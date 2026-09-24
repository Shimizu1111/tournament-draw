"use strict";
/* =======================================================================
   画面描画・操作
   ======================================================================= */

const VIEWS = [
  { k: "setup", n: "大会設定" },
  { k: "teams", n: "参加チーム" },
  { k: "draw", n: "抽選" },
  { k: "day1", n: "1日目 リーグ" },
  { k: "day2", n: "2日目 トーナメント" },
  { k: "out", n: "印刷・出力" }
];

/* ===================== 共通パーツ ===================== */
function teamNameAt(cat, slot) {
  const t = teamAt(cat, slot);
  return t ? t.name : slotLabel(slot);
}
function nameOrLabel(cat, side) {
  return side.slot === null ? side.label : teamNameAt(cat, side.slot);
}

/* ===================== 大会設定 ===================== */
function renderSetup() {
  const m = ST.meta, s = ST.sched;
  return `
  <div class="panel">
    <h2>大会情報</h2>
    <div class="row">
      <div style="flex:2 1 320px">
        <label for="f-name">大会名</label>
        <input id="f-name" data-meta="name" value="${esc(m.name)}">
      </div>
      <div>
        <label for="f-venue">会場</label>
        <input id="f-venue" data-meta="venue" value="${esc(m.venue)}" placeholder="例：〇〇スポーツパーク">
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <div><label for="f-d1">1日目（リーグ戦）</label><input id="f-d1" type="date" data-meta="d1" value="${esc(m.d1)}"></div>
      <div><label for="f-d2">2日目（トーナメント）</label><input id="f-d2" type="date" data-meta="d2" value="${esc(m.d2)}"></div>
    </div>
  </div>

  <div class="panel">
    <h2>タイムスケジュール<span class="sub">1カテゴリ2コート・全12試合枠で自動計算します</span></h2>
    <div class="row">
      <div><label for="f-s1">1日目 開始時刻</label><input id="f-s1" type="time" data-sched="d1Start" value="${esc(s.d1Start)}"></div>
      <div><label for="f-s2">2日目 開始時刻</label><input id="f-s2" type="time" data-sched="d2Start" value="${esc(s.d2Start)}"></div>
      <div><label for="f-mm">1試合の時間（分）</label><input id="f-mm" type="number" min="1" max="90" data-sched="matchMin" value="${s.matchMin}"></div>
      <div><label for="f-gm">試合間インターバル（分）</label><input id="f-gm" type="number" min="0" max="60" data-sched="gapMin" value="${s.gapMin}"></div>
    </div>
    <p class="hint">1試合 ${s.matchMin}分 ＋ 入替 ${s.gapMin}分 → 全12枠で
      ${Math.floor(12 * ((+s.matchMin) + (+s.gapMin)) / 60)}時間${(12 * ((+s.matchMin) + (+s.gapMin))) % 60}分（最終試合の終了まで）</p>
  </div>

  <div class="panel">
    <h2>データの保存<span class="sub">入力内容はこのブラウザに自動保存されます</span></h2>
    <div class="btns">
      <button id="b-export">バックアップを保存（JSON）</button>
      <button id="b-import">バックアップを読み込む</button>
      <button id="b-reset" style="margin-left:auto;color:var(--warn)">全データを初期化</button>
    </div>
    <p class="hint">抽選会の当日は、抽選後に必ず一度バックアップを保存してください。別のPCやスマホに引き継ぐこともできます。</p>
  </div>`;
}

/* ===================== 参加チーム ===================== */
function renderTeams() {
  const cat = C();
  const filled = cat.teams.filter(t => t.name.trim()).length;
  const rows = cat.teams.map((t, i) => `
    <div class="teamrow">
      <span class="idx">${i + 1}</span>
      <input class="nm" data-team="${i}" data-f="name" value="${esc(t.name)}" placeholder="チーム名">
      <input class="pf" data-team="${i}" data-f="pref" value="${esc(t.pref)}" placeholder="県">
    </div>`).join("");
  return `
  <div class="panel">
    <h2>${esc(ST.cat)} 参加チーム<span class="sub">16チーム（県名は同県対戦の回避に使います・任意）</span></h2>
    <div class="teamgrid">${rows}</div>
    <p class="hint">入力済み <b class="${filled === 16 ? "ok" : ""}">${filled} / 16</b> チーム${cat.order ? "　※すでに抽選済みです。チームを変更した場合は抽選をやり直してください。" : ""}</p>
  </div>

  <div class="panel">
    <h2>まとめて貼り付け<span class="sub">Excel・スプレッドシートからコピーできます</span></h2>
    <label for="f-bulk">1行に1チーム。「チーム名 [タブ or カンマ] 県名」の形式にも対応します</label>
    <textarea id="f-bulk" rows="6" placeholder="〇〇FC	熊本&#10;△△SSS	福岡&#10;..."></textarea>
    <div class="btns"><button id="b-bulk" class="primary">貼り付けた内容で置き換える</button></div>
  </div>`;
}

/* ===================== 抽選 ===================== */
function renderDraw() {
  const cat = C();
  const ready = teamsReady(cat);
  const done = !!cat.order;
  const rev = cat.revealed;

  if (!ready && !done) {
    return `<div class="panel"><h2>${esc(ST.cat)} 抽選</h2>
      <div class="note warn">参加チームが16チーム揃っていません。「参加チーム」で入力してください。</div></div>`;
  }

  // 直前に公開された枠
  let bigHtml = `<div class="reveal"><div class="big-slot">抽選前</div>
    <div class="big-name" style="color:var(--muted);font-size:20px">「抽選を開始する」を押してください</div></div>`;
  if (done && rev > 0) {
    const slot = rev - 1, t = teamAt(cat, slot);
    bigHtml = `<div class="reveal live"><div class="big-slot">${slotLabel(slot)}　（${LG[Math.floor(slot / 4)]}ブロック ${slot % 4 + 1}番）</div>
      <div class="big-name">${esc(t ? t.name : "")}</div>
      <div class="big-pref">${esc(t && t.pref ? t.pref + "県代表" : "")}</div></div>`;
  } else if (done && rev === 0) {
    bigHtml = `<div class="reveal"><div class="big-slot">準備完了</div>
      <div class="big-name" style="font-size:22px">「次の枠を引く」で1枠ずつ発表できます</div></div>`;
  }

  const blocks = LG.map((L, li) => {
    const tr = [0, 1, 2, 3].map(p => {
      const slot = li * 4 + p;
      const shown = done && slot < rev;
      const t = shown ? teamAt(cat, slot) : null;
      const cls = (shown ? "" : "pending") + (slot === rev - 1 ? " just" : "");
      return `<tr class="${cls}">
        <td class="pos">${L}${p + 1}</td>
        <td class="nm">${shown ? esc(t ? t.name : "") : "― 未定 ―"}</td>
        <td class="pf">${shown && t && t.pref ? esc(t.pref) : ""}</td></tr>`;
    }).join("");
    return `<div class="blk"><h3>${L}ブロック</h3><table>${tr}</table></div>`;
  }).join("");

  const conf = done ? prefConflicts(cat) : [];
  return `
  <div class="panel noprint">
    <h2>${esc(ST.cat)} 抽選<span class="sub">シード値を記録すれば同じ結果をいつでも再現・検証できます</span></h2>
    <div class="row">
      <div style="flex:0 0 auto">
        <label>　</label>
        <label style="display:flex;align-items:center;gap:7px;color:var(--text);font-size:14px">
          <input type="checkbox" id="f-avoid" ${cat.avoidPref ? "checked" : ""} style="width:auto" ${done ? "disabled" : ""}>
          同じ県のチームを同じブロックに入れない
        </label>
      </div>
      <div style="flex:0 0 220px">
        <label for="f-seed">抽選シード値（空欄でランダム）</label>
        <input id="f-seed" class="mono" value="${esc(cat.seed || "")}" ${done ? "readonly" : ""} placeholder="自動生成">
      </div>
    </div>
    <div class="btns">
      ${!done ? `<button id="b-start" class="primary big">抽選を開始する</button>` : ""}
      ${done && rev < 16 ? `<button id="b-next" class="primary big">次の枠を引く　（${rev} / 16）</button>
        <button id="b-all">残りをすべて公開</button>` : ""}
      ${done && rev >= 16 ? `<button id="b-redo" style="color:var(--warn)">抽選をやり直す</button>` : ""}
    </div>
    ${done ? `<div class="progress"><i style="width:${rev / 16 * 100}%"></i></div>` : ""}
  </div>

  <div class="panel">
    <h2>${esc(ST.meta.name)}　${esc(ST.cat)}　組合せ抽選結果</h2>
    ${bigHtml}
    <div class="drawgrid">${blocks}</div>
    ${done ? `<p class="hint">抽選シード値 <b class="mono">${esc(cat.seed)}</b>${rev >= 16 ? "　／　抽選確定" : "　／　公開中 " + rev + " / 16"}</p>` : ""}
    ${conf.length ? `<div class="note warn"><b>同県が同ブロックになっています</b><br>${conf.map(esc).join("<br>")}</div>` : ""}
  </div>`;
}

/* ===================== 1日目 リーグ戦 ===================== */
function leagueBlock(cat, li) {
  const L = LG[li];
  const s = standings(cat, li);
  const matches = LEAGUE_ORDER.map(([x, y], mi) => {
    const sc = scoreOf(cat, L, mi) || { a: null, b: null };
    return `<tr>
      <td style="width:38px;color:var(--muted);font-size:11px">${L}${mi + 1}</td>
      <td class="team" style="text-align:right">${esc(teamNameAt(cat, li * 4 + x))}</td>
      <td style="width:54px"><input class="sc" type="number" min="0" data-sc="${L}-${mi}" data-side="a" value="${sc.a ?? ""}"></td>
      <td style="width:22px;color:var(--muted)">-</td>
      <td style="width:54px"><input class="sc" type="number" min="0" data-sc="${L}-${mi}" data-side="b" value="${sc.b ?? ""}"></td>
      <td class="team" style="text-align:left">${esc(teamNameAt(cat, li * 4 + y))}</td>
    </tr>`;
  }).join("");

  const rank = s.rows.map((r, i) => `
    <tr class="${i === 0 ? "r1" : ""}">
      <td style="width:34px">${i + 1}</td>
      <td class="team" style="text-align:left">${esc(teamNameAt(cat, li * 4 + r.p))}</td>
      <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td><b>${r.pt}</b></td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td>
      <td class="noprint" style="width:58px">
        <button class="sm" data-rank="${L}" data-i="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""}>▲</button>
        <button class="sm" data-rank="${L}" data-i="${i}" data-dir="1" ${i === 3 ? "disabled" : ""}>▼</button>
      </td>
    </tr>`).join("");

  return `
  <div class="panel">
    <h2>${L}ブロック<span class="sub">${s.allPlayed ? "全試合終了" : "リーグ戦"}</span>
      ${s.manual ? '<span class="tag gray">順位を手動確定済み</span>' : ""}</h2>
    <div class="tablescroll"><table class="grid">${matches}</table></div>
    <div class="tablescroll" style="margin-top:14px"><table class="grid">
      <tr><th>順位</th><th>チーム</th><th>試合</th><th>勝</th><th>分</th><th>敗</th><th>勝点</th><th>得点</th><th>失点</th><th>得失</th><th class="noprint">調整</th></tr>
      ${rank}
    </table></div>
    ${s.unresolved.length ? `<div class="note warn">勝点・得失点差・総得点・直接対決まで並びません（${s.unresolved.map(([a, b]) => esc(teamNameAt(cat, li * 4 + a)) + " と " + esc(teamNameAt(cat, li * 4 + b))).join("、")}）。大会規定にしたがって順位を決め、▲▼で並べ替えてください。</div>` : ""}
  </div>`;
}

function day1ScheduleSection() {
  const cat = C();
  const rows = day1Schedule();
  const bad = day1Consecutive();
  const courts = [1, 2].map(ct => {
    const tr = rows.filter(r => r.court === ct).map(r => `
      <tr>
        <td class="no">${r.no}</td>
        <td class="tm">${slotTime(ST.sched.d1Start, r.slot)}</td>
        <td class="lg">${LG[r.li]}</td>
        <td class="a">${esc(teamNameAt(cat, r.a))}</td>
        <td class="vs">vs</td>
        <td>${esc(teamNameAt(cat, r.b))}</td>
      </tr>`).join("");
    return `<div><h3 class="sect"><span class="tag">第${ct}コート</span>
      <span style="color:var(--muted);font-size:12px">${ct === 1 ? "A・Bブロック" : "C・Dブロック"}</span></h3>
      <table class="sched"><tr><th>No</th><th>開始</th><th>組</th><th colspan="3">対戦カード</th></tr>${tr}</table></div>`;
  }).join("");

  return `
  <div class="panel">
    <h2>${esc(ST.cat)}　1日目 進行表<span class="sub">${esc(ST.meta.d1 ? ST.meta.d1.replace(/-/g, "/") : "")}　4チーム総当たり × 4ブロック ＝ 24試合</span></h2>
    <div class="courtcol">${courts}</div>
    <div class="note ${bad.length ? "warn" : ""}">${bad.length
      ? "<b>連続試合があります：</b>" + bad.map(b => esc(b.name)).join("、")
      : '<span class="ok">✓ 同じチームが連続して試合することはありません</span>（各チーム 最短でも1試合分の休憩を確保）'}</div>
  </div>`;
}

function renderDay1() {
  const cat = C();
  if (!cat.order || cat.revealed < 16) {
    return `<div class="panel"><h2>1日目 リーグ戦</h2>
      <div class="note warn">先に抽選を完了してください。</div></div>`;
  }
  return day1ScheduleSection() + LG.map((_, li) => leagueBlock(cat, li)).join("");
}

/* ===================== 2日目 トーナメント ===================== */
function matchBox(cat, block, key, no) {
  const m = cat.d2[d2Key(block, key)] || { a: null, b: null, pk: null };
  const res = d2Winner(cat, block, key);
  const sides = ["a", "b"].map(sd => {
    const v = resolveSide(cat, block, key, sd);
    const nm = nameOrLabel(cat, v);
    const isWin = res && v.slot !== null && res.win === v.slot;
    const tie = m.a !== null && m.b !== null && m.a === m.b && m.a !== undefined;
    return `<div class="side ${isWin ? "win" : ""} ${v.slot === null ? "tbd" : ""}">
      <span class="nm">${esc(nm)}</span>
      ${tie ? `<button class="sm noprint" data-pk="${d2Key(block, key)}" data-side="${sd}"
        style="padding:1px 5px;${m.pk === sd ? "background:var(--accent);color:var(--accent-text);border-color:var(--accent)" : ""}">PK</button>` : ""}
      <input class="sc" type="number" min="0" data-d2="${d2Key(block, key)}" data-side="${sd}" value="${m[sd] ?? ""}">
    </div>`;
  }).join("");
  return `<div class="match"><div class="mno"><span>${D2_LABEL[key]}</span><span>第${no}試合</span></div>${sides}</div>`;
}

function bracketFor(cat, block, nos) {
  const cols = [
    { head: "1回戦", keys: ["QF1", "QF2", "QF3", "QF4"] },
    { head: "準決勝", keys: ["SF1", "SF2"] },
    { head: "決勝", keys: ["F"] }
  ];
  const html = cols.map(col => `
    <div class="round"><div class="round-head">${col.head}</div><div class="slots">
      ${col.keys.map(k => `<div class="slot">${matchBox(cat, block, k, nos[k])}</div>`).join("")}
    </div></div>`).join("");
  return `<div class="bracket-scroll"><div class="bracket ${block === "L" ? "lower" : ""}">${html}</div></div>`;
}

function placers(cat, block, nos) {
  const list = [
    ["P3", "3位決定戦"], ["CSF1", ""], ["CSF2", ""], ["P5", "5位決定戦"], ["P7", "7位決定戦"]
  ];
  return `<div class="placer">${list.map(([k]) => `
    <div class="pmatch ${block === "L" ? "lower" : ""}">${matchBox(cat, block, k, nos[k])}</div>`).join("")}</div>`;
}

function blockSection(cat, block) {
  const rows = day2Schedule().filter(r => r.block === block);
  const nos = {}; rows.forEach(r => { nos[r.key] = r.no; });
  const isU = block === "U";
  return `
  <div class="panel">
    <h2 class="sect"><span class="tag ${isU ? "" : "lo"}">${isU ? "上位トーナメント" : "下位トーナメント"}</span>
      <span style="font-weight:400;font-size:13px;color:var(--muted)">
        ${isU ? "各ブロック 1位・2位 の8チーム → 1〜8位を決定" : "各ブロック 3位・4位 の8チーム → 9〜16位を決定"}
        ／ 第${isU ? 1 : 2}コート</span></h2>
    ${bracketFor(cat, block, nos)}
    <h3 class="sect" style="margin-top:6px"><span class="tag gray">順位決定戦</span></h3>
    ${placers(cat, block, nos)}
  </div>`;
}

function renderDay2() {
  const cat = C();
  if (!cat.order || cat.revealed < 16) {
    return `<div class="panel"><h2>2日目 トーナメント</h2><div class="note warn">先に抽選を完了してください。</div></div>`;
  }
  const allDone = LG.every((_, li) => standings(cat, li).allPlayed);
  const rows = day2Schedule();
  const bad = day2Consecutive();
  const fin = finalRanking(cat);

  const courts = [1, 2].map(ct => {
    const tr = rows.filter(r => r.court === ct).map(r => {
      const A = resolveSide(cat, r.block, r.key, "a"), B = resolveSide(cat, r.block, r.key, "b");
      return `<tr>
        <td class="no">${r.no}</td>
        <td class="tm">${slotTime(ST.sched.d2Start, r.slot)}</td>
        <td class="lg" style="font-size:11px;font-weight:400">${D2_LABEL[r.key]}</td>
        <td class="a">${esc(nameOrLabel(cat, A))}</td>
        <td class="vs">vs</td>
        <td>${esc(nameOrLabel(cat, B))}</td>
      </tr>`;
    }).join("");
    return `<div><h3 class="sect"><span class="tag ${ct === 1 ? "" : "lo"}">第${ct}コート</span>
      <span style="color:var(--muted);font-size:12px">${ct === 1 ? "上位トーナメント" : "下位トーナメント"}</span></h3>
      <table class="sched"><tr><th>No</th><th>開始</th><th>区分</th><th colspan="3">対戦カード</th></tr>${tr}</table></div>`;
  }).join("");

  const rank = fin.map((slot, i) => `
    <div class="rankrow m${i + 1}"><span class="pl">${i + 1}位</span>
      <span class="nm">${slot === null ? '<span style="color:var(--muted)">―</span>' : esc(teamNameAt(cat, slot))}</span></div>`).join("");

  return `
  <div class="panel">
    <h2>${esc(ST.cat)}　2日目 進行表<span class="sub">${esc(ST.meta.d2 ? ST.meta.d2.replace(/-/g, "/") : "")}　上位・下位あわせて24試合</span></h2>
    ${allDone ? "" : '<div class="note warn">1日目のリーグ戦がすべて入力されていないため、対戦カードは「Aブロック1位」などの表示になります。結果を入力すると自動でチーム名に変わります。</div>'}
    <div class="courtcol">${courts}</div>
    <div class="note ${bad.length ? "warn" : ""}">${bad.length
      ? "<b>連続試合があります：</b>" + bad.map(b => esc(b.name)).join("、")
      : '<span class="ok">✓ 同じチームが連続して試合することはありません</span>'}</div>
  </div>
  ${blockSection(cat, "U")}
  ${blockSection(cat, "L")}
  <div class="panel">
    <h2>${esc(ST.cat)}　最終順位</h2>
    <div class="ranklist">${rank}</div>
  </div>`;
}

/* ===================== 印刷・出力 ===================== */
function matrixTable(cat, li) {
  const L = LG[li];
  const s = standings(cat, li);
  const head = `<tr><th style="width:150px">${L}ブロック</th>${[0, 1, 2, 3].map(p => `<th>${p + 1}</th>`).join("")}<th>勝点</th><th>得失</th><th>順位</th></tr>`;
  const body = [0, 1, 2, 3].map(p => {
    const cells = [0, 1, 2, 3].map(q => {
      if (p === q) return `<td class="self"></td>`;
      let mi = -1, flip = false;
      LEAGUE_ORDER.forEach(([x, y], i) => {
        if (x === p && y === q) { mi = i; }
        else if (x === q && y === p) { mi = i; flip = true; }
      });
      const sc = scoreOf(cat, L, mi);
      if (!sc || sc.a === null || sc.b === null) return `<td></td>`;
      return `<td>${flip ? sc.b : sc.a} - ${flip ? sc.a : sc.b}</td>`;
    }).join("");
    const row = s.rows.find(r => r.p === p);
    const pos = s.rows.findIndex(r => r.p === p) + 1;
    return `<tr><td class="team" style="text-align:left">${p + 1}. ${esc(teamNameAt(cat, li * 4 + p))}</td>${cells}
      <td>${row.pt}</td><td>${row.gd > 0 ? "+" : ""}${row.gd}</td><td><b>${s.allPlayed ? pos : "-"}</b></td></tr>`;
  }).join("");
  return `<table class="grid">${head}${body}</table>`;
}

function renderOut() {
  const cat = C();
  if (!cat.order) return `<div class="panel"><h2>印刷・出力</h2><div class="note warn">先に抽選を完了してください。</div></div>`;
  const blocks = LG.map((L, li) => `
    <div class="blk"><h3>${L}ブロック</h3><table>
      ${[0, 1, 2, 3].map(p => {
        const t = teamAt(cat, li * 4 + p);
        return `<tr><td class="pos">${L}${p + 1}</td><td class="nm">${esc(t ? t.name : "")}</td><td class="pf">${esc(t && t.pref ? t.pref : "")}</td></tr>`;
      }).join("")}
    </table></div>`).join("");

  return `
  <div class="panel noprint">
    <h2>印刷・データ出力</h2>
    <div class="btns">
      <button class="primary" id="b-print">このページを印刷 / PDF保存</button>
      <button id="b-csv-draw">抽選結果 CSV</button>
      <button id="b-csv-d1">1日目 進行表 CSV</button>
      <button id="b-csv-d2">2日目 進行表 CSV</button>
      <button id="b-csv-rank">最終順位 CSV</button>
    </div>
    <p class="hint">印刷は A4横 を推奨します。カテゴリごとに切り替えて印刷してください。</p>
  </div>

  <div class="panel">
    <h2>${esc(ST.meta.name)}　${esc(ST.cat)}　組合せ表</h2>
    <p class="hint" style="margin:0 0 12px">${esc(ST.meta.venue)}　${ST.meta.d1 ? esc(ST.meta.d1.replace(/-/g, "/")) : ""}${ST.meta.d2 ? " ・ " + esc(ST.meta.d2.replace(/-/g, "/")) : ""}　／　抽選シード値 <span class="mono">${esc(cat.seed || "")}</span></p>
    <div class="drawgrid">${blocks}</div>
  </div>

  <div class="panel pagebreak">
    <h2>${esc(ST.cat)}　リーグ戦 星取表（記入用）</h2>
    <div class="courtcol">${LG.map((_, li) => `<div class="tablescroll">${matrixTable(cat, li)}</div>`).join("")}</div>
  </div>

  <div class="pagebreak">${day1ScheduleSection()}</div>
  <div class="pagebreak">${blockSection(cat, "U")}${blockSection(cat, "L")}</div>`;
}

/* ===================== 全体描画 ===================== */
function render() {
  const cat = C();
  $("#catsw").innerHTML = CATS.map(c => {
    const done = ST.cats[c].order && ST.cats[c].revealed >= 16;
    return `<button data-cat="${c}" aria-selected="${c === ST.cat}">${c}${done ? " ✓" : ""}</button>`;
  }).join("");
  $("#steps").innerHTML = VIEWS.map(v =>
    `<button data-view="${v.k}" aria-selected="${v.k === ST.view}">${v.n}</button>`).join("");
  $("#brandname").textContent = ST.meta.name || "大会運営システム";

  const fn = { setup: renderSetup, teams: renderTeams, draw: renderDraw, day1: renderDay1, day2: renderDay2, out: renderOut }[ST.view];
  $("#view").innerHTML = fn();
  save();
}

/* ===================== 出力（CSV / JSON） ===================== */
function csvEsc(s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; }
function toCsv(rows) { return rows.map(r => r.map(csvEsc).join(",")).join("\r\n"); }
function dl(name, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function fname(base) {
  return (ST.meta.name || "大会").replace(/[\\/:*?"<>|]/g, "_") + "_" + ST.cat + "_" + base + ".csv";
}
function csvDraw() {
  const cat = C();
  const rows = [["ブロック", "番号", "チーム名", "県"]];
  LG.forEach((L, li) => [0, 1, 2, 3].forEach(p => {
    const t = teamAt(cat, li * 4 + p);
    rows.push([L, L + (p + 1), t ? t.name : "", t ? t.pref : ""]);
  }));
  return toCsv(rows);
}
function csvDay1() {
  const cat = C();
  const rows = [["No", "コート", "開始", "ブロック", "チームA", "チームB"]];
  day1Schedule().forEach(r => rows.push([r.no, "第" + r.court + "コート", slotTime(ST.sched.d1Start, r.slot), LG[r.li],
    teamNameAt(cat, r.a), teamNameAt(cat, r.b)]));
  return toCsv(rows);
}
function csvDay2() {
  const cat = C();
  const rows = [["No", "コート", "開始", "区分", "試合", "チームA", "チームB"]];
  day2Schedule().forEach(r => {
    const A = resolveSide(cat, r.block, r.key, "a"), B = resolveSide(cat, r.block, r.key, "b");
    rows.push([r.no, "第" + r.court + "コート", slotTime(ST.sched.d2Start, r.slot),
      r.block === "U" ? "上位トーナメント" : "下位トーナメント", D2_LABEL[r.key],
      nameOrLabel(cat, A), nameOrLabel(cat, B)]);
  });
  return toCsv(rows);
}
function csvRank() {
  const cat = C();
  const rows = [["順位", "チーム名", "県"]];
  finalRanking(cat).forEach((slot, i) => {
    const t = slot === null ? null : teamAt(cat, slot);
    rows.push([i + 1, t ? t.name : "", t ? t.pref : ""]);
  });
  return toCsv(rows);
}

/* ===================== イベント ===================== */
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;

  if (b.dataset.cat) { ST.cat = b.dataset.cat; render(); return; }
  if (b.dataset.view) { ST.view = b.dataset.view; render(); window.scrollTo(0, 0); return; }

  const cat = C();
  switch (b.id) {
    case "b-bulk": {
      const lines = $("#f-bulk").value.split("\n").map(s => s.trim()).filter(Boolean);
      if (!lines.length) return;
      if (cat.order && !confirm("抽選済みです。チームを置き換えると抽選結果は破棄されます。よろしいですか？")) return;
      cat.teams = Array.from({ length: 16 }, (_, i) => {
        const raw = lines[i] || "";
        const parts = raw.split(/[\t,]/).map(s => s.trim());
        return { name: parts[0] || "", pref: (parts[1] || "").replace(/[県府都道]$/, "") };
      });
      if (cat.order) { cat.order = null; cat.revealed = 0; cat.seed = null; cat.scores = {}; cat.rankOrder = {}; cat.d2 = {}; }
      render(); return;
    }
    case "b-start": {
      const given = ($("#f-seed").value || "").trim();
      cat.avoidPref = $("#f-avoid").checked;
      cat.seed = given || newSeed();
      cat.order = drawOrder(cat, cat.seed);
      cat.revealed = 0;
      cat.scores = {}; cat.rankOrder = {}; cat.d2 = {};
      render(); return;
    }
    case "b-next": cat.revealed = Math.min(16, cat.revealed + 1); render(); return;
    case "b-all": cat.revealed = 16; render(); return;
    case "b-redo":
      if (!confirm("抽選をやり直します。現在の抽選結果と、入力済みの試合結果もすべて消えます。よろしいですか？")) return;
      cat.order = null; cat.revealed = 0; cat.seed = null; cat.scores = {}; cat.rankOrder = {}; cat.d2 = {};
      render(); return;
    case "b-print": window.print(); return;
    case "b-csv-draw": dl(fname("抽選結果"), csvDraw()); return;
    case "b-csv-d1": dl(fname("1日目進行表"), csvDay1()); return;
    case "b-csv-d2": dl(fname("2日目進行表"), csvDay2()); return;
    case "b-csv-rank": dl(fname("最終順位"), csvRank()); return;
    case "b-export": {
      const blob = new Blob([JSON.stringify(ST, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (ST.meta.name || "大会").replace(/[\\/:*?"<>|]/g, "_") + "_バックアップ.json";
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    case "b-import": $("#f-file").click(); return;
    case "b-reset":
      if (!confirm("すべてのカテゴリのデータを消去して初期状態に戻します。よろしいですか？")) return;
      ST = initState(); render(); return;
  }

  // リーグ順位の手動並べ替え
  if (b.dataset.rank) {
    const L = b.dataset.rank, li = LG.indexOf(L);
    const i = +b.dataset.i, dir = +b.dataset.dir, j = i + dir;
    if (j < 0 || j > 3) return;
    const cur = standings(cat, li).rows.map(r => r.p);
    [cur[i], cur[j]] = [cur[j], cur[i]];
    cat.rankOrder[L] = cur;
    render(); return;
  }
  // PK勝ち
  if (b.dataset.pk) {
    const k = b.dataset.pk;
    cat.d2[k] = cat.d2[k] || { a: null, b: null, pk: null };
    cat.d2[k].pk = cat.d2[k].pk === b.dataset.side ? null : b.dataset.side;
    render(); return;
  }
});

/* 入力（再描画なし：入力中のフォーカスを保つ） */
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.meta) { ST.meta[el.dataset.meta] = el.value; if (el.dataset.meta === "name") $("#brandname").textContent = el.value; save(); return; }
  if (el.dataset.sched) { ST.sched[el.dataset.sched] = el.value; save(); return; }
  if (el.dataset.team !== undefined) { C().teams[+el.dataset.team][el.dataset.f] = el.value; save(); return; }
});

/* 確定時（スコアなどは再描画して順位・勝ち上がりを更新） */
document.addEventListener("change", e => {
  const el = e.target, cat = C();
  if (el.dataset.sc) {
    const k = el.dataset.sc;
    cat.scores[k] = cat.scores[k] || { a: null, b: null };
    cat.scores[k][el.dataset.side] = el.value === "" ? null : Math.max(0, +el.value);
    delete cat.rankOrder[k.split("-")[0]];   // スコア変更で手動順位はリセット
    render(); return;
  }
  if (el.dataset.d2) {
    const k = el.dataset.d2;
    cat.d2[k] = cat.d2[k] || { a: null, b: null, pk: null };
    cat.d2[k][el.dataset.side] = el.value === "" ? null : Math.max(0, +el.value);
    render(); return;
  }
  if (el.id === "f-avoid") { cat.avoidPref = el.checked; save(); return; }
  if (el.id === "f-file") {
    const f = el.files && el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (!o || !o.cats) throw new Error("形式が違います");
        if (!confirm("現在のデータを、読み込むバックアップで置き換えます。よろしいですか？")) return;
        ST = Object.assign(initState(), o);
        CATS.forEach(c => { ST.cats[c] = Object.assign(initCat(), ST.cats[c] || {}); });
        render();
      } catch (err) { alert("バックアップファイルを読み込めませんでした：" + err.message); }
      el.value = "";
    };
    r.readAsText(f);
  }
});

/* ===================== 起動 ===================== */
load();
render();
