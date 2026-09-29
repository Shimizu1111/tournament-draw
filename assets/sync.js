"use strict";
/* =======================================================================
   全端末で同じ内容を見るための同期（Cloudflare Workers + Durable Objects）
   - URLを開くだけで自動的につながる。コードの入力は不要
   - どの端末からでも編集でき、変更は数秒で他の端末に反映される
   - 通信できないときはローカルで動き続け、回復したら自動で追いつく
   ======================================================================= */

const WS_ID = "FANTASISTA-KYUSHU";      // 共有ワークスペースの名前
const PUSH_WAIT = 1500;                 // 入力が止まってから送信するまで
const PULL_EVERY = 8000;                // 受信の間隔
const MAX_BYTES = 800 * 1024;           // 送信サイズの上限

const SYNC = {
  version: 0,
  timer: null,
  pushTimer: null,
  busy: false,
  lastSent: null,
  state: "idle",     // idle | syncing | ok | offline | error | off | toobig
  at: 0,
  message: ""
};

const apiBase = () => (DB.pref.apiBase || "").replace(/\/+$/, "");
const syncOn = () => !!apiBase() && !DB.pref.syncOff;

async function api(path, opt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(apiBase() + path, Object.assign({ signal: ctrl.signal }, opt || {}));
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  } finally { clearTimeout(t); }
}

/* ---------------- 同期する中身 ---------------- */
/** 大会の一覧だけを共有する（復元ポイントと端末ごとの設定は共有しない） */
function wsPayload() {
  const events = {};
  Object.values(DB.events).forEach(ev => {
    events[ev.id] = { id: ev.id, createdAt: ev.createdAt, updatedAt: ev.updatedAt, state: ev.state };
  });
  return { events, deleted: DB.deleted || {} };
}

/** まだ一度も使われていない大会か（初回接続時に重複させないため）
   参加チームが初期値のままなら「未使用」とみなす。
   これを判定しないと、端末を開くたびに同じ名前の大会が増えてしまう */
function isPristine(ev) {
  const st = normalizeState(ev.state);
  const base = initState();
  const untouched = CATS.every(c => {
    const x = st.cats[c];
    if (x.order || x.revealed) return false;
    if (Object.keys(x.scores || {}).length || Object.keys(x.d2 || {}).length) return false;
    const def = defaultTeams(c);
    const empty = x.teams.every(t => !t.name.trim());
    const same = x.teams.length === def.length
      && x.teams.every((t, i) => t.name === def[i].name && t.pref === def[i].pref);
    return empty || same;
  });
  return untouched && st.meta.name === base.meta.name && !st.meta.d1 && !st.meta.d2 && !st.meta.venue;
}

/** ローカルとサーバーの大会一覧を統合する。同じ大会は更新が新しいほうを採用 */
function mergeEvents(remote) {
  const rEvents = (remote && remote.events) || {};
  const rDeleted = (remote && remote.deleted) || {};
  const deleted = Object.assign({}, rDeleted, DB.deleted || {});

  // 初回接続時、手つかずの空の大会しかなければサーバー側を採用する
  const localIds = Object.keys(DB.events);
  if (Object.keys(rEvents).length && localIds.length === 1 && isPristine(DB.events[localIds[0]])) {
    delete DB.events[localIds[0]];
    if (DB.currentId === localIds[0]) DB.currentId = null;
  }

  const ids = new Set([...Object.keys(DB.events), ...Object.keys(rEvents)]);
  const merged = {};
  ids.forEach(id => {
    if (deleted[id]) return;                       // 削除済みは復活させない
    const a = DB.events[id], b = rEvents[id];
    if (!a) { merged[id] = { id, createdAt: b.createdAt, updatedAt: b.updatedAt, state: b.state }; return; }
    if (!b) { merged[id] = a; return; }
    merged[id] = (a.updatedAt || 0) >= (b.updatedAt || 0)
      ? a
      : { id, createdAt: b.createdAt || a.createdAt, updatedAt: b.updatedAt, state: b.state };
  });

  DB.events = merged;
  DB.deleted = deleted;

  if (!DB.events[DB.currentId]) {
    const newest = Object.values(DB.events).sort((x, y) => y.updatedAt - x.updatedAt)[0];
    if (newest) openEvent(newest.id, DB.ui && DB.ui.cat);
    else createEvent();
  } else {
    // 開いている大会の内容が入れ替わっていたら画面用の状態も差し替える
    const st = normalizeState(DB.events[DB.currentId].state);
    ST.meta = st.meta; ST.sched = st.sched; ST.cats = st.cats;
  }
}

/** 画面に反映する。入力中は再描画せず、フォーカスと変換中の文字を壊さない */
function syncRefresh(force) {
  if (typeof render !== "function") return;
  const ae = document.activeElement;
  const typing = ae && ae.closest && ae.closest("#view") && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
  if (typing && !force) { updateSyncBadge(); return; }
  render();
}

/* ---------------- 受信 ---------------- */
async function pullNow(first) {
  if (!syncOn() || SYNC.busy) return;
  SYNC.busy = true;
  try {
    const r = await api("/api/ws/" + WS_ID);
    if (!r.ok) { setState("error", "受信できませんでした"); return; }
    SYNC.at = Date.now();

    if (r.body.version === SYNC.version && !first) { setState("ok"); return; }

    const before = JSON.stringify(wsPayload());
    mergeEvents(r.body.state);
    SYNC.version = r.body.version;
    const after = JSON.stringify(wsPayload());
    persist();
    setState("ok");

    if (after !== before) syncRefresh(true);
    else updateSyncBadge();

    // サーバーに無い内容が手元にあれば送り返す
    const remoteStr = JSON.stringify({
      events: (r.body.state || {}).events || {},
      deleted: (r.body.state || {}).deleted || {}
    });
    if (after !== remoteStr) schedulePush();
  } catch (e) {
    setState("offline", "オフラインです。接続が戻ると自動で同期します");
  } finally { SYNC.busy = false; }
}

/* ---------------- 送信 ---------------- */
function schedulePush() {
  if (!syncOn()) return;
  clearTimeout(SYNC.pushTimer);
  SYNC.pushTimer = setTimeout(pushNow, PUSH_WAIT);
}

async function pushNow() {
  if (!syncOn() || SYNC.busy) return;
  const state = wsPayload();
  const body = JSON.stringify(state);
  if (body === SYNC.lastSent) { setState("ok"); return; }
  if (body.length > MAX_BYTES) {
    setState("toobig", "データが大きく同期できません。古い大会を削除してください");
    return;
  }

  SYNC.busy = true;
  setState("syncing");
  try {
    let r = await api("/api/ws/" + WS_ID, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, baseVersion: SYNC.version })
    });

    // 別の端末が先に更新していた場合は、統合してから送り直す
    if (r.status === 409) {
      mergeEvents(r.body.state);
      SYNC.version = r.body.version;
      persist();
      const merged = wsPayload();
      r = await api("/api/ws/" + WS_ID, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: merged, baseVersion: SYNC.version })
      });
      if (r.ok) SYNC.lastSent = JSON.stringify(merged);
      syncRefresh();
    } else if (r.ok) {
      SYNC.lastSent = body;
    }

    if (r.ok) { SYNC.version = r.body.version; SYNC.at = Date.now(); setState("ok"); }
    else setState("error", "送信できませんでした");
  } catch (e) {
    setState("offline", "オフラインです。接続が戻ると自動で送信します");
  } finally {
    SYNC.busy = false;
    updateSyncBadge();
  }
}

/* ---------------- 状態表示 ---------------- */
function setState(s, msg) {
  SYNC.state = DB.pref.syncOff ? "off" : s;
  SYNC.message = msg || "";
  updateSyncBadge();
}
function syncLabel() {
  if (DB.pref.syncOff) return { cls: "off", text: "この端末だけで使用中" };
  switch (SYNC.state) {
    case "syncing": return { cls: "busy", text: "同期中…" };
    case "ok": return { cls: "ok", text: "全端末で共有中" };
    case "offline": return { cls: "warn", text: "オフライン" };
    case "toobig": return { cls: "warn", text: SYNC.message };
    case "error": return { cls: "warn", text: SYNC.message || "同期エラー" };
    default: return { cls: "busy", text: "接続中…" };
  }
}
function updateSyncBadge() {
  const el = document.getElementById("syncbadge");
  if (!el) return;
  const l = syncLabel();
  el.className = "syncbadge " + l.cls;
  el.textContent = l.text;
  el.title = SYNC.at ? "最終同期 " + nowStamp(SYNC.at) : "";
}

/* ---------------- 起動・定期実行 ---------------- */
function startSync() {
  clearInterval(SYNC.timer);
  if (!syncOn()) { setState("off"); return; }
  SYNC.timer = setInterval(() => { if (!document.hidden) pullNow(); }, PULL_EVERY);
  pullNow(true);
}
function stopSync() { clearInterval(SYNC.timer); SYNC.timer = null; }

function setSyncOff(off) {
  DB.pref.syncOff = !!off;
  persist();
  if (off) { stopSync(); setState("off"); } else { SYNC.lastSent = null; startSync(); }
}

window.addEventListener("online", () => { if (syncOn()) { pullNow(); schedulePush(); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden) pullNow(); });
