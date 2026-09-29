"use strict";
/* =======================================================================
   他の端末との共有（Cloudflare Workers + Durable Objects）
   - 編集キーを持つ端末＝オーナー。変更するたびに自動で送信する
   - 共有コードだけの端末＝閲覧専用。定期的に受信して表示を更新する
   - サーバーが落ちていても、通信が切れても、アプリはローカルで動き続ける
   ======================================================================= */

const SYNC = {
  timer: null,
  pushTimer: null,
  busy: false,
  lastPushed: null,     // 直近に送った内容（同じなら送らない）
  status: "",           // 画面に出す状態メッセージ
  error: "",
  conflict: null        // {version, updatedAt, state} 別端末が先に更新していた場合
};

const apiBase = () => (DB.pref.apiBase || "").replace(/\/+$/, "");
const shareOf = () => (DB.events[DB.currentId] || {}).share || null;
const isViewer = () => { const s = shareOf(); return !!(s && s.role === "viewer"); };
const isOwner = () => { const s = shareOf(); return !!(s && s.role === "owner" && s.editKey); };

function fmtCode(c) { return c ? c.slice(0, 4) + "-" + c.slice(4) : ""; }
function payload() { return { meta: ST.meta, sched: ST.sched, cats: ST.cats }; }

async function api(path, opt) {
  const base = apiBase();
  if (!base) throw new Error("共有サーバーのURLが設定されていません");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(base + path, Object.assign({ signal: ctrl.signal }, opt || {}));
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

/* ---------------- 共有を始める / 参加する / やめる ---------------- */
async function shareCreate() {
  SYNC.error = "";
  const r = await api("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: payload() })
  });
  if (!r.ok) throw new Error("共有を作成できませんでした（" + (r.body.error || r.status) + "）");
  const ev = DB.events[DB.currentId];
  ev.share = { code: r.body.code, editKey: r.body.editKey, role: "owner", version: r.body.version, at: Date.now() };
  SYNC.lastPushed = JSON.stringify(payload());
  persist();
  startSync();
  return ev.share;
}

/** 閲覧用リンクに含まれる共有サーバーのURLを取り込む（未設定のときだけ自動、違う場合は確認） */
function adoptApiBase(url) {
  if (!url || !/^https?:\/\//.test(url)) return;
  const v = url.replace(/\/+$/, "");
  const cur = apiBase();
  if (cur === v) return;
  if (!cur) { DB.pref.apiBase = v; persist(); return; }
  if (confirm("このリンクは別の共有サーバーを指しています。\n\n現在：" + cur + "\nリンク：" + v + "\n\nリンクのサーバーに切り替えますか？")) {
    DB.pref.apiBase = v; persist();
  }
}

/** 共有コードで参加する。新しい大会として取り込み、閲覧専用で開く */
async function shareJoin(rawCode) {
  SYNC.error = "";
  const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{8}$/.test(code)) throw new Error("共有コードは8文字です");

  const existing = Object.values(DB.events).find(e => e.share && e.share.code === code);
  // すでに編集キーを持っている大会なら、閲覧専用に降格させず、そのまま開く
  if (existing && existing.share.editKey) {
    openEvent(existing.id);
    startSync();
    await pullNow();
    return code;
  }
  const r = await api("/api/rooms/" + code);
  if (r.status === 404) throw new Error("その共有コードは見つかりませんでした");
  if (!r.ok) throw new Error("読み込めませんでした（" + (r.body.error || r.status) + "）");

  const id = existing ? existing.id : newId("evt_");
  DB.events[id] = {
    id,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
    state: normalizeState(r.body.state),
    share: { code, editKey: null, role: "viewer", version: r.body.version, at: Date.now() }
  };
  openEvent(id);
  startSync();
  return code;
}

function shareStop() {
  const ev = DB.events[DB.currentId];
  if (ev) delete ev.share;
  SYNC.conflict = null; SYNC.status = ""; SYNC.error = "";
  stopSync();
  persist();
}

/* ---------------- 送信・受信 ---------------- */
function schedulePush() {
  if (!isOwner() || !apiBase()) return;
  clearTimeout(SYNC.pushTimer);
  SYNC.pushTimer = setTimeout(pushNow, 2500);   // 連続入力をまとめて1回に
}

async function pushNow() {
  if (!isOwner() || !apiBase() || SYNC.busy || SYNC.conflict) return;
  const ev = DB.events[DB.currentId], sh = ev.share;
  const body = JSON.stringify(payload());
  if (body === SYNC.lastPushed) return;          // 変化なし

  SYNC.busy = true;
  try {
    const r = await api("/api/rooms/" + sh.code, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-edit-key": sh.editKey },
      body: JSON.stringify({ state: JSON.parse(body), baseVersion: sh.version })
    });
    if (r.status === 409) {
      SYNC.conflict = r.body;                     // 別端末が先に更新していた
      SYNC.status = ""; SYNC.error = "";
    } else if (r.ok) {
      sh.version = r.body.version; sh.at = Date.now();
      SYNC.lastPushed = body;
      SYNC.status = "保存しました " + nowStamp(sh.at);
      SYNC.error = "";
      persist();
    } else {
      SYNC.error = "送信できませんでした（" + (r.body.error || r.status) + "）";
    }
  } catch (e) {
    SYNC.error = "オフラインのようです。接続が戻ったら自動で送信します。";
  } finally {
    SYNC.busy = false;
    if (typeof render === "function") render();
  }
}

async function pullNow(force) {
  const sh = shareOf();
  if (!sh || !apiBase() || SYNC.busy || SYNC.conflict) return;
  SYNC.busy = true;
  try {
    const r = await api("/api/rooms/" + sh.code);
    if (r.status === 404) { SYNC.error = "共有が見つかりません。停止された可能性があります。"; return; }
    if (!r.ok) { SYNC.error = "受信できませんでした（" + (r.body.error || r.status) + "）"; return; }
    SYNC.error = "";
    if (r.body.version > sh.version || force) {
      if (isViewer()) {
        applyRemote(r.body);
        SYNC.status = "更新を受信しました " + nowStamp(Date.now());
        if (typeof render === "function") render();
      } else {
        // オーナー端末：別の端末で更新されていた
        SYNC.conflict = r.body;
        if (typeof render === "function") render();
      }
    } else {
      sh.at = Date.now();
    }
  } catch (e) {
    SYNC.error = "オフラインのようです。接続が戻ったら自動で受信します。";
  } finally { SYNC.busy = false; }
}

function applyRemote(body) {
  const st = normalizeState(body.state);
  ST.meta = st.meta; ST.sched = st.sched; ST.cats = st.cats;
  const ev = DB.events[DB.currentId];
  ev.state = { meta: ST.meta, sched: ST.sched, cats: ST.cats };
  ev.updatedAt = Date.now();
  ev.share.version = body.version;
  ev.share.at = Date.now();
  SYNC.lastPushed = JSON.stringify(payload());
  persist();
}

/** 競合の解決：サーバー側を採用する */
function conflictTakeServer() {
  if (!SYNC.conflict) return;
  snap("サーバーの内容を取り込む直前");
  applyRemote(SYNC.conflict);
  SYNC.conflict = null;
  SYNC.status = "サーバーの内容に更新しました";
}
/** 競合の解決：この端末の内容で上書きする */
async function conflictKeepLocal() {
  if (!SYNC.conflict) return;
  const sh = shareOf();
  sh.version = SYNC.conflict.version;    // サーバーの最新版を土台にして上書き
  SYNC.conflict = null;
  SYNC.lastPushed = null;
  await pushNow();
}

/* ---------------- 定期実行 ---------------- */
function startSync() {
  stopSync();
  if (!shareOf() || !apiBase()) return;
  SYNC.timer = setInterval(() => {
    if (document.hidden) return;
    pullNow();
  }, 20000);
  pullNow();
}
function stopSync() { clearInterval(SYNC.timer); SYNC.timer = null; }

window.addEventListener("online", () => { SYNC.error = ""; if (isOwner()) pushNow(); else pullNow(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) pullNow(); });
