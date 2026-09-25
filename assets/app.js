"use strict";
/* =======================================================================
   fantasistaカップ九州大会 抽選・組合せシステム
   - 1カテゴリ16チーム／4チーム総当たりリーグ×4ブロック（1日目）
   - 上位トーナメント（各ブロック1・2位）／下位トーナメント（3・4位）（2日目）
   - 全チームの最終順位（1〜16位）が確定するまで順位決定戦を実施
   ======================================================================= */

const CATS = ["U-7", "U-8", "U-9"];
const LG = ["A", "B", "C", "D"];
const STORE_KEY = "fantasista-kyushu-v1";

/* 4チーム総当たりの試合順（サークル法）。[リーグ内位置, リーグ内位置] */
const LEAGUE_ORDER = [[0, 3], [1, 2], [0, 2], [3, 1], [0, 1], [2, 3]];

/* トーナメント1回戦の組合せ。[ブロックA, 順位オフセット, ブロックB, 順位オフセット]
   同一ブロック同士が当たらず、1位と2位がクロスするよう配置 */
const QF_PAIRS = [[0, 0, 1, 1], [2, 0, 3, 1], [1, 0, 0, 1], [3, 0, 2, 1]];

/* 2日目の試合順（1コートあたり12試合）。同一チームが連続しない並び */
const D2_ORDER = ["QF1", "QF2", "QF3", "QF4", "SF1", "CSF1", "SF2", "CSF2", "F", "P3", "P5", "P7"];

const D2_LABEL = {
  QF1: "1回戦①", QF2: "1回戦②", QF3: "1回戦③", QF4: "1回戦④",
  SF1: "準決勝①", SF2: "準決勝②",
  CSF1: "5〜8位決定①", CSF2: "5〜8位決定②",
  F: "決勝", P3: "3位決定戦", P5: "5位決定戦", P7: "7位決定戦"
};

/* =======================  乱数（シード固定・再現可能）  ======================= */
function makeRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function newSeed() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint32Array(12);
  crypto.getRandomValues(b);
  let s = ""; for (let i = 0; i < 12; i++) s += c[b[i] % c.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =========================  状態管理  ========================= */
function initCat() {
  return {
    teams: Array.from({ length: 16 }, () => ({ name: "", pref: "" })),
    seed: null,
    order: null,      // 抽選結果：枠index(0-15) -> チームindex
    revealed: 0,      // 公開済みの枠数
    avoidPref: true,  // 同一県を同一ブロックに入れない
    scores: {},       // "A-0" -> {a:数, b:数}   1日目リーグ戦
    rankOrder: {},    // "A" -> [リーグ内位置...]  手動順位確定
    d2: {}            // "U-QF1" -> {a, b, pk}    2日目トーナメント
  };
}
function initState() {
  return {
    meta: { name: "fantasistaカップ九州大会", d1: "", d2: "", venue: "" },
    sched: { d1Start: "09:00", d2Start: "09:00", matchMin: 15, gapMin: 5 },
    cat: CATS[0],
    view: "setup",
    cats: Object.fromEntries(CATS.map(c => [c, initCat()]))
  };
}
let ST = initState();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(ST)); } catch (e) { /* 保存不可でも継続 */ }
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && o.cats) ST = Object.assign(initState(), o);
    CATS.forEach(c => { ST.cats[c] = Object.assign(initCat(), ST.cats[c] || {}); });
  } catch (e) { /* 壊れていれば初期状態 */ }
}
const C = () => ST.cats[ST.cat];

/* =========================  抽選  ========================= */
function drawOrder(cat, seed) {
  const rng = makeRng(seed + "/" + ST.cat);
  const idx = cat.teams.map((_, i) => i);
  let buckets;

  if (cat.avoidPref && cat.teams.some(t => t.pref.trim())) {
    // 県ごとにまとめ、多い県から順に A→B→C→D と配っていく（同県は必ず別ブロック）
    const byPref = new Map();
    idx.forEach(i => {
      const k = cat.teams[i].pref.trim() || "__none__" + i; // 県未入力は個別扱い
      if (!byPref.has(k)) byPref.set(k, []);
      byPref.get(k).push(i);
    });
    let groups = shuffle([...byPref.values()], rng);
    groups.sort((a, b) => b.length - a.length);
    const flat = groups.flatMap(g => shuffle(g, rng));
    buckets = [[], [], [], []];
    flat.forEach((ti, i) => buckets[i % 4].push(ti));
  } else {
    const flat = shuffle(idx, rng);
    buckets = [0, 1, 2, 3].map(i => flat.slice(i * 4, i * 4 + 4));
  }

  // ブロック名の割当と、ブロック内の番号をランダム化
  buckets = shuffle(buckets, rng).map(b => shuffle(b, rng));
  return buckets.flat();
}

/** 同一県が同じブロックに入ってしまった箇所を返す */
function prefConflicts(cat) {
  if (!cat.order) return [];
  const out = [];
  LG.forEach((L, li) => {
    const seen = new Map();
    for (let p = 0; p < 4; p++) {
      const t = cat.teams[cat.order[li * 4 + p]];
      const k = (t.pref || "").trim();
      if (!k) continue;
      if (seen.has(k)) out.push(`${L}ブロック：${k} が ${seen.get(k)} と ${t.name} で重複`);
      else seen.set(k, t.name);
    }
  });
  return out;
}

/* =========================  1日目リーグ戦  ========================= */
/** 枠index(0-15) -> チームオブジェクト */
function teamAt(cat, slot) {
  if (!cat.order) return null;
  const t = cat.teams[cat.order[slot]];
  return t && t.name ? t : null;
}
function slotLabel(slot) { return LG[Math.floor(slot / 4)] + (slot % 4 + 1); }

/** 1日目の全試合。court:1|2、slot:0-11、no はコートごとに1〜12
   第1コート A,A,B,B,A,A,B,B,A,A,B,B ／ 第2コート C,C,D,D,C,C,D,D,C,C,D,D
   1ブロックを2試合続けて行うことで、各チームの試合間隔のばらつきを抑える */
function day1Schedule() {
  const rows = [];
  for (let s = 0; s < 12; s++) {
    const mi = Math.floor(s / 4) * 2 + (s % 2);   // そのブロックの何試合目か
    const second = Math.floor(s / 2) % 2 === 1;   // A/C か B/D か
    [[1, second ? 1 : 0], [2, second ? 3 : 2]].forEach(([court, li]) => {
      const [x, y] = LEAGUE_ORDER[mi];
      rows.push({ slot: s, court, li, mi, no: s + 1, a: li * 4 + x, b: li * 4 + y });
    });
  }
  rows.sort((p, q) => p.slot - q.slot || p.court - q.court);
  return rows;
}

/** 各チームの試合間隔（何試合分空くか）の最小・最大 */
function restRange(bySlot) {
  const last = new Map(); let min = Infinity, max = 0;
  bySlot.forEach((teams, s) => teams.forEach(t => {
    if (t === null) return;
    if (last.has(t)) { const g = s - last.get(t) - 1; min = Math.min(min, g); max = Math.max(max, g); }
    last.set(t, s);
  }));
  return { min: min === Infinity ? 0 : min, max };
}

function scoreOf(cat, L, mi) { return cat.scores[L + "-" + mi] || null; }

/** リーグ順位。返り値はリーグ内位置の配列（上位順）＋成績 */
function standings(cat, li) {
  const L = LG[li];
  const st = [0, 1, 2, 3].map(p => ({ p, pt: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, played: 0 }));
  LEAGUE_ORDER.forEach(([x, y], mi) => {
    const sc = scoreOf(cat, L, mi);
    if (!sc || sc.a === null || sc.b === null) return;
    const A = st[x], B = st[y];
    A.played++; B.played++;
    A.gf += sc.a; A.ga += sc.b; B.gf += sc.b; B.ga += sc.a;
    if (sc.a > sc.b) { A.w++; A.pt += 3; B.l++; }
    else if (sc.a < sc.b) { B.w++; B.pt += 3; A.l++; }
    else { A.d++; B.d++; A.pt++; B.pt++; }
  });
  st.forEach(s => { s.gd = s.gf - s.ga; });

  const h2h = (a, b) => {
    for (let mi = 0; mi < LEAGUE_ORDER.length; mi++) {
      const [x, y] = LEAGUE_ORDER[mi];
      if ((x === a.p && y === b.p) || (x === b.p && y === a.p)) {
        const sc = scoreOf(cat, L, mi);
        if (!sc || sc.a === null || sc.b === null) return 0;
        const av = x === a.p ? sc.a : sc.b, bv = x === a.p ? sc.b : sc.a;
        return bv - av;   // 勝った方が上（降順ソート用）
      }
    }
    return 0;
  };
  const sorted = st.slice().sort((a, b) => b.pt - a.pt || b.gd - a.gd || b.gf - a.gf || h2h(a, b) || a.p - b.p);

  // 完全に並びきらない（勝点・得失点・総得点・直接対決まで同じ）組を検出
  const unresolved = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a.pt === b.pt && a.gd === b.gd && a.gf === b.gf && h2h(a, b) === 0 && a.played === 3 && b.played === 3) {
      unresolved.push([a.p, b.p]);
    }
  }

  const manual = cat.rankOrder[L];
  const final = (manual && manual.length === 4)
    ? manual.map(p => st.find(s => s.p === p))
    : sorted;
  return { rows: final, unresolved, manual: !!manual, allPlayed: st.every(s => s.played === 3) };
}

/* =========================  2日目トーナメント  ========================= */
/** block: "U"(上位) | "L"(下位) */
function d2Key(block, k) { return block + "-" + k; }

/** 試合の参加者を解決。{label, slot|null, from} を返す */
function resolveSide(cat, block, key, side) {
  const base = block === "U" ? 0 : 2;
  const qfIdx = { QF1: 0, QF2: 1, QF3: 2, QF4: 3 }[key];
  if (qfIdx !== undefined) {
    const [la, ra, lb, rb] = QF_PAIRS[qfIdx];
    const li = side === "a" ? la : lb;
    const r = base + (side === "a" ? ra : rb);
    const s = standings(cat, li);
    const label = `${LG[li]}ブロック${r + 1}位`;
    if (!s.allPlayed) return { label, slot: null };
    return { label, slot: li * 4 + s.rows[r].p };
  }
  const DEP = {
    SF1: [["W", "QF1"], ["W", "QF2"]],
    SF2: [["W", "QF3"], ["W", "QF4"]],
    CSF1: [["L", "QF1"], ["L", "QF2"]],
    CSF2: [["L", "QF3"], ["L", "QF4"]],
    F: [["W", "SF1"], ["W", "SF2"]],
    P3: [["L", "SF1"], ["L", "SF2"]],
    P5: [["W", "CSF1"], ["W", "CSF2"]],
    P7: [["L", "CSF1"], ["L", "CSF2"]]
  }[key];
  const [wl, src] = DEP[side === "a" ? 0 : 1];
  const label = `${D2_LABEL[src]}${wl === "W" ? "勝者" : "敗者"}`;
  const res = d2Winner(cat, block, src);
  if (!res) return { label, slot: null };
  return { label, slot: wl === "W" ? res.win : res.lose };
}

/** 勝敗が確定していれば {win, lose}（枠index）、未確定なら null */
function d2Winner(cat, block, key) {
  const m = cat.d2[d2Key(block, key)];
  if (!m) return null;
  const A = resolveSide(cat, block, key, "a"), B = resolveSide(cat, block, key, "b");
  if (A.slot === null || B.slot === null) return null;
  if (m.a === null || m.b === null || m.a === undefined || m.b === undefined) return null;
  if (m.a > m.b) return { win: A.slot, lose: B.slot };
  if (m.b > m.a) return { win: B.slot, lose: A.slot };
  if (m.pk === "a") return { win: A.slot, lose: B.slot };
  if (m.pk === "b") return { win: B.slot, lose: A.slot };
  return null;
}

/** 最終順位（1〜16位）。未確定は null */
function finalRanking(cat) {
  const out = new Array(16).fill(null);
  [["U", 0], ["L", 8]].forEach(([blk, off]) => {
    [["F", 0, 1], ["P3", 2, 3], ["P5", 4, 5], ["P7", 6, 7]].forEach(([k, wi, li]) => {
      const r = d2Winner(cat, blk, k);
      if (r) { out[off + wi] = r.win; out[off + li] = r.lose; }
    });
  });
  return out;
}

/** 2日目の進行。court1=上位、court2=下位。no はコートごとに1〜12 */
function day2Schedule() {
  const rows = [];
  D2_ORDER.forEach((k, s) => {
    rows.push({ slot: s, court: 1, block: "U", key: k, no: s + 1 });
    rows.push({ slot: s, court: 2, block: "L", key: k, no: s + 1 });
  });
  return rows;
}

/* =========================  時刻  ========================= */
function slotTime(startHHMM, slot) {
  const [h, m] = (startHHMM || "09:00").split(":").map(Number);
  const step = (+ST.sched.matchMin || 15) + (+ST.sched.gapMin || 5);
  const tot = h * 60 + m + slot * step;
  const hh = Math.floor(tot / 60) % 24, mm = tot % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

/* =========================  連続試合チェック  ========================= */
function consecutiveViolations(pairsBySlot) {
  const bad = [];
  for (let s = 0; s + 1 < pairsBySlot.length; s++) {
    const now = pairsBySlot[s], next = pairsBySlot[s + 1];
    now.forEach(t => { if (t !== null && next.includes(t)) bad.push({ slot: s, team: t }); });
  }
  return bad;
}
function day1Slots() {
  const bySlot = Array.from({ length: 12 }, () => []);
  day1Schedule().forEach(r => { bySlot[r.slot].push(r.a, r.b); });
  return bySlot;
}
function day1Consecutive() {
  const cat = C();
  return consecutiveViolations(day1Slots()).map(v => ({ ...v, name: teamAt(cat, v.team)?.name || slotLabel(v.team) }));
}
function day2Consecutive() {
  const cat = C();
  const bySlot = Array.from({ length: 12 }, () => []);
  day2Schedule().forEach(r => {
    ["a", "b"].forEach(sd => {
      const v = resolveSide(cat, r.block, r.key, sd);
      bySlot[r.slot].push(v.slot);
    });
  });
  return consecutiveViolations(bySlot).map(v => ({ ...v, name: teamAt(cat, v.team)?.name || slotLabel(v.team) }));
}

/* =========================  ユーティリティ  ========================= */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const $ = sel => document.querySelector(sel);
function teamsReady(cat) { return cat.teams.filter(t => t.name.trim()).length === 16; }
