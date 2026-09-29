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

/** 動作確認用のサンプル16チーム（九州7県×2＋開催県枠2） */
function demoTeams() {
  const P = ["福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島"];
  const t = [];
  P.forEach(p => {
    t.push({ name: p + "FC", pref: p });
    t.push({ name: p + "サッカースポーツ少年団", pref: p });
  });
  t.push({ name: "熊本クラブA（開催県枠）", pref: "熊本" });
  t.push({ name: "熊本クラブB（開催県枠）", pref: "熊本" });
  return t;
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
    <h2>タイムスケジュール<span class="sub">各カテゴリ2コート・全12枠（1枠につき2試合）</span></h2>
    <div class="row">
      <div><label for="f-s1">1日目 開始時刻</label><input id="f-s1" type="time" data-sched="d1Start" value="${esc(s.d1Start)}"></div>
      <div><label for="f-s2">2日目 開始時刻</label><input id="f-s2" type="time" data-sched="d2Start" value="${esc(s.d2Start)}"></div>
      <div><label for="f-mm">1試合の時間（分）<span style="display:block;font-size:10px">前半＋ハーフタイム＋後半</span></label>
        <input id="f-mm" type="number" min="1" max="90" data-sched="matchMin" value="${s.matchMin}"></div>
      <div><label for="f-gm">試合間インターバル（分）<span style="display:block;font-size:10px">次の試合までの入替・移動</span></label>
        <input id="f-gm" type="number" min="0" max="60" data-sched="gapMin" value="${s.gapMin}"></div>
    </div>
    <div class="note">
      <b>1枠 ＝ ${(+s.matchMin) + (+s.gapMin)}分</b>（${s.matchMin}分 ＋ ${s.gapMin}分）　→　12枠で
      ${Math.floor(12 * ((+s.matchMin) + (+s.gapMin)) / 60)}時間${(12 * ((+s.matchMin) + (+s.gapMin))) % 60}分
      <br><span style="font-size:12px;color:var(--muted)">
        時刻の計算に使うのは<b>2つの合計</b>だけです。18分＋2分 と 15分＋5分 はどちらも1枠20分なので、進行表の時刻は同じになります。<br>
        合計を変えると全試合の開始時刻がずれます。対戦カードや試合番号は変わりません。
        大会要項どおりなら <b>18分 ＋ 2分</b> です。</span>
    </div>
    <div class="courtcol" style="margin-top:14px">
      ${[["1日目（予選リーグ）", ST.sched.d1Start], ["2日目（トーナメント）", ST.sched.d2Start]].map(([ttl, st0]) => `
        <div><h3 class="sect"><span class="tag">${ttl}</span></h3>
        <table class="sched"><tr><th>枠</th><th>時間</th><th>枠</th><th>時間</th></tr>
        ${[0, 1, 2, 3, 4, 5].map(i => `<tr>
          <td class="no">${i + 1}</td><td class="tm">${slotTime(st0, i)}〜${slotTime(st0, i + 1)}</td>
          <td class="no">${i + 7}</td><td class="tm">${slotTime(st0, i + 6)}〜${slotTime(st0, i + 7)}</td>
        </tr>`).join("")}</table></div>`).join("")}
    </div>
  </div>

  <div class="panel">
    <h2>1日目の進行方式<span class="sub">4ブロックを2コートにどう割り当てるか</span></h2>
    ${[["round", "ラウンド型（大会要項の図）", "枠1＝A・B、枠2＝C・D、枠3＝A・B…と交互。各ブロックの試合番号は A・B が 1,3,5,7,9,11、C・D が 2,4,6,8,10,12 になります。"],
       ["block", "ブロック集中型", "第1コートで A,A,B,B…、第2コートで C,C,D,D…。1ブロックを2試合続けて行うため、各チームの試合間隔のばらつきが小さくなります。"]]
      .map(([v, ttl, desc]) => {
        const rest = restRange(day1Slots(v));
        return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid ${ST.sched.d1Mode === v ? "var(--accent)" : "var(--border)"};border-radius:8px;margin-bottom:8px;cursor:pointer;color:var(--text)">
          <input type="radio" name="d1mode" value="${v}" ${ST.sched.d1Mode === v ? "checked" : ""} style="width:auto;margin-top:4px">
          <span><b style="font-size:14px">${ttl}</b>
            <span class="tag ${rest.min >= 2 ? "" : "gray"}" style="margin-left:8px">試合間隔 ${rest.min}〜${rest.max}試合分</span>
            <br><span style="font-size:12px;color:var(--muted)">${desc}</span></span>
        </label>`;
      }).join("")}
  </div>

  <div class="panel">
    <h2>この大会の操作<span class="sub">切り替えと新規作成は、画面左上の大会名からできます</span></h2>
    <div class="evrow cur">
      <div class="ev-main"><b>${esc(ST.meta.name || "（名称未設定）")}</b>
        <div class="ev-sub">${(() => {
          const ev = DB.events[DB.currentId], pg = eventProgress(ev);
          return `最終更新 ${nowStamp(ev.updatedAt)}<br>抽選 ${pg.drawn}/3カテゴリ　・　1日目終了 ${pg.d1}/3　・　順位確定 ${pg.done}/3`;
        })()}</div>
      </div>
    </div>
    <div class="btns">
      <button data-ev="dup" data-id="${DB.currentId}">この大会を複製する</button>
      <button id="b-ev-clear" style="color:var(--warn)">入力内容をすべて消す</button>
      <button data-ev="del" data-id="${DB.currentId}" style="margin-left:auto;color:var(--warn)">この大会を削除する</button>
    </div>
    <p class="hint">「入力内容をすべて消す」はチーム・抽選・試合結果だけを消し、大会名とタイムスケジュールは残します。
      どちらも直前の状態が復元ポイントに残るので、あとから戻せます。</p>
  </div>

  ${sharePanel()}

  <div class="panel">
    <h2>バックアップと復元<span class="sub">入力内容はこのブラウザに自動保存されます</span></h2>
    <div class="btns" style="margin-top:0">
      <button id="b-export">バックアップを保存（JSON）</button>
      <button id="b-import">バックアップを読み込む</button>
      <button id="b-snap">いまの状態を復元ポイントにする</button>
    </div>
    <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px;margin-top:12px">
      <input type="checkbox" id="f-autodl" ${DB.pref.autoDl ? "checked" : ""} style="width:auto">
      抽選が確定したとき、バックアップファイルを自動で保存する
    </label>
    ${(() => {
      const list = DB.snaps.filter(x => x.eventId === DB.currentId).slice().reverse();
      if (!list.length) return '<p class="hint">復元ポイントはまだありません。抽選の確定時やデータを消す操作の直前に自動で作られます。</p>';
      return `<h3 class="sect" style="margin:16px 0 8px"><span class="tag gray">復元ポイント（新しい順・最大12件）</span></h3>
        <div class="evlist">${list.map(x => `<div class="evrow">
          <div class="ev-main"><b>${esc(x.label)}</b>
            <div class="ev-sub">${nowStamp(x.at)}　${esc(x.name || "")}</div></div>
          <div class="ev-btn"><button class="sm" data-snap="${x.id}">この時点に戻す</button></div>
        </div>`).join("")}</div>`;
    })()}
    <p class="hint">復元ポイントはこのブラウザの中にだけ残ります。
      <b>端末の故障やデータ消去に備えて、抽選後には必ず「バックアップを保存」でファイルを残してください。</b></p>
  </div>

  <div class="panel">
    <h2>動作確認用のサンプルデータ<span class="sub">操作を試すためのダミーデータです</span></h2>
    <div class="btns" style="margin-top:0">
      <button id="b-demo">3カテゴリにサンプル16チームを入れて抽選まで実行</button>
      <button id="b-demo2">さらに1日目の結果をランダムで埋める</button>
    </div>
    <p class="hint">九州7県×2＋開催県枠2の想定で16チーム分入ります。熊本が4チームあるので、
      同じ県が4ブロックに分かれる動きも確認できます。<br>
      <b style="color:var(--warn)">本番の登録前に「この大会の入力内容をすべて消す」でサンプルを消すか、
      「新しい大会を作る」で本番用の大会を別に用意してください。</b></p>
  </div>`;
}

/* ===================== 大会の切り替えメニュー（画面左上） ===================== */
let evMenuOpen = false;

function renderEvMenu() {
  const box = $("#evmenu"), btn = $("#evsw");
  if (!box) return;
  btn.setAttribute("aria-expanded", evMenuOpen ? "true" : "false");
  box.hidden = !evMenuOpen;
  if (!evMenuOpen) { box.innerHTML = ""; return; }

  const list = Object.values(DB.events).sort((a, b) => b.updatedAt - a.updatedAt);
  box.innerHTML = `
    <h4>大会を選ぶ（${list.length}件）</h4>
    ${list.map(ev => {
      const st = normalizeState(ev.state);
      const pg = eventProgress(ev);
      const cur = ev.id === DB.currentId;
      return `<button class="pick ${cur ? "cur" : ""}" data-evpick="${ev.id}">
        <span class="ck">${cur ? "✓" : ""}</span>
        <span class="nm"><b>${esc(st.meta.name || "（名称未設定）")}</b>
          <span>抽選 ${pg.drawn}/3　・　最終更新 ${nowStamp(ev.updatedAt)}${
            sh ? "　・　共有中" + (sh.role === "viewer" ? "（閲覧専用）" : "") : ""}</span></span>
      </button>`;
    }).join("")}
    <hr>
    <button class="act" id="b-evm-new">＋　新しい大会を作る</button>
    <button class="act" id="b-evm-new2">＋　今の設定を引き継いで作る</button>
    <button class="act" id="b-evm-manage">　　この大会を複製・削除する</button>`;
}
function closeEvMenu() { if (evMenuOpen) { evMenuOpen = false; renderEvMenu(); } }

/* ===================== 同期 ===================== */
function sharePanel() {
  const l = syncLabel();
  const base = apiBase();
  return `<div class="panel">
    <h2>他の端末との共有<span class="sub">URLを開くだけで、どの端末でも同じ内容になります</span></h2>
    <div class="note ${l.cls === "warn" ? "warn" : ""}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="syncbadge ${l.cls}" id="syncbadge">${esc(l.text)}</span>
        ${SYNC.at ? `<span style="font-size:12px;color:var(--muted)">最終同期 ${nowStamp(SYNC.at)}</span>` : ""}
        <button class="sm" id="b-sync-now" style="margin-left:auto">いますぐ同期</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">
        ${DB.pref.syncOff
          ? "同期を止めています。この端末で入力した内容は、他の端末には表示されません。"
          : "この大会の URL を開いた端末は、すべて同じ内容を見て編集できます。入力は数秒で他の端末に反映されます。"}
      </div>
    </div>
    <div class="btns">
      <button data-ro="ok" data-copy="${esc(location.origin + location.pathname)}">このページのURLをコピー</button>
      <button id="b-sync-toggle" style="margin-left:auto">${DB.pref.syncOff ? "同期を再開する" : "この端末だけで使う（同期を止める）"}</button>
    </div>
    <p class="hint">通信できないときもアプリは動き続け、つながり次第まとめて同期します。
      サーバー：${esc(base.replace(/^https?:\/\//, "") || "未設定")}
      <button class="sm" id="b-api-edit">変更</button></p>
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
    ${storageNotice()}
  </div>

  <div class="panel">
    <h2>まとめて貼り付け<span class="sub">Excel・スプレッドシートからコピーできます</span></h2>
    <label for="f-bulk">1行に1チーム。「チーム名 [タブ or カンマ] 県名」の形式にも対応します</label>
    <textarea id="f-bulk" rows="6" placeholder="〇〇FC	熊本&#10;△△SSS	福岡&#10;..."></textarea>
    <div class="btns"><button id="b-bulk" class="primary">貼り付けた内容で置き換える</button></div>
  </div>`;
}

/** 同期の状態を参加チーム画面にも小さく出す */
function storageNotice() {
  const l = syncLabel();
  if (DB.pref.syncOff) {
    return `<div class="note warn">同期を止めているため、この端末にだけ保存されます。
      <button class="sm" id="b-sync-toggle2">同期を再開する</button></div>`;
  }
  return `<div class="note"><span class="syncbadge ${l.cls}">${esc(l.text)}</span>
    　入力した内容は自動で保存され、同じURLを開いている他の端末にも反映されます。</div>`;
}

/* ===================== 抽選 ===================== *//* ===================== 抽選 ===================== */
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

/* ===================== リーグ戦の四角形（対戦図） ===================== */
/** 4隅にチーム名、辺と対角線の6本が6試合を表す図。各線に試合番号を表示 */
function leagueSquare(cat, li) {
  const X1 = 170, X2 = 310, Y1 = 50, Y2 = 148;
  // 位置 0=左上, 1=左下, 2=右上, 3=右下（LEAGUE_ORDER と対応）
  const pt = [[X1, Y1], [X1, Y2], [X2, Y1], [X2, Y2]];
  const nameAt = [[X1 - 12, Y1 - 6, "end"], [X1 - 12, Y2 + 20, "end"],
                  [X2 + 12, Y1 - 6, "start"], [X2 + 12, Y2 + 20, "start"]];

  const lines = LEAGUE_ORDER.map(([i, j]) =>
    `<line x1="${pt[i][0]}" y1="${pt[i][1]}" x2="${pt[j][0]}" y2="${pt[j][1]}"/>`).join("");

  // 試合番号。辺は中点、対角線は上側の頂点から30%の位置に置いて重なりを避ける
  const nums = LEAGUE_ORDER.map(([i, j], mi) => {
    const A = pt[i], B = pt[j];
    const diag = A[0] !== B[0] && A[1] !== B[1];
    let x, y;
    if (diag) {
      const [T, O] = A[1] < B[1] ? [A, B] : [B, A];
      x = T[0] + (O[0] - T[0]) * 0.3; y = T[1] + (O[1] - T[1]) * 0.3;
    } else {
      x = (A[0] + B[0]) / 2; y = (A[1] + B[1]) / 2;
    }
    const { no } = day1MatchNo(li, mi);
    return `<circle cx="${x}" cy="${y}" r="10.5" class="nmask"/>
      <text x="${x}" y="${y + 4}" class="mno">${no}</text>`;
  }).join("");

  const corners = pt.map(([x, y], p) => `
    <circle cx="${x}" cy="${y}" r="12" class="cn"/>
    <text x="${x}" y="${y + 4.5}" class="cnum">${p + 1}</text>`).join("");

  const names = nameAt.map(([x, y, anchor], p) => {
    const nm = teamNameAt(cat, li * 4 + p);
    const fs = nm.length > 13 ? 10 : nm.length > 10 ? 11.5 : 13;
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="tnm" font-size="${fs}">${esc(nm)}</text>`;
  }).join("");

  return `<div class="sq">
    <h3>${LG[li]}ブロック<span>①〜④ ＝ ${LG[li]}1〜${LG[li]}4</span></h3>
    <svg viewBox="0 0 480 176" role="img" aria-label="${LG[li]}ブロック 対戦図">
      <g class="ln">${lines}</g>${nums}${corners}${names}
    </svg>
  </div>`;
}

function leagueSquares(cat) {
  return `<div class="panel">
    <h2>${esc(ST.cat)}　1日目 リーグ戦 対戦図<span class="sub">4隅がチーム、線の数字が試合番号です（抽選結果を自動反映）</span></h2>
    <div class="sqgrid">${LG.map((_, li) => leagueSquare(cat, li)).join("")}</div>
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
    const blks = [...new Set(rows.filter(r => r.court === ct).map(r => LG[r.li]))].join("・");
    return `<div><h3 class="sect"><span class="tag">第${ct}コート</span>
      <span style="color:var(--muted);font-size:12px">${blks}ブロック</span></h3>
      <table class="sched"><tr><th>No</th><th>開始</th><th>組</th><th colspan="3">対戦カード</th></tr>${tr}</table></div>`;
  }).join("");

  const rest = restRange(day1Slots());
  return `
  <div class="panel">
    <h2>${esc(ST.cat)}　1日目 進行表<span class="sub">${esc(ST.meta.d1 ? ST.meta.d1.replace(/-/g, "/") : "")}　4チーム総当たり × 4ブロック ＝ 24試合</span></h2>
    <div class="courtcol">${courts}</div>
    <div class="note ${bad.length ? "warn" : ""}">${bad.length
      ? "<b>連続試合があります：</b>" + bad.map(b => esc(b.name)).join("、")
      : `<span class="ok">✓ 同じチームが連続して試合することはありません</span>　試合間隔は全チーム ${rest.min}〜${rest.max}試合分`}</div>
  </div>`;
}

function renderDay1() {
  const cat = C();
  if (!cat.order || cat.revealed < 16) {
    return `<div class="panel"><h2>1日目 リーグ戦</h2>
      <div class="note warn">先に抽選を完了してください。</div></div>`;
  }
  return leagueSquares(cat) + day1ScheduleSection() + LG.map((_, li) => leagueBlock(cat, li)).join("");
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
  const ct = day2Schedule().find(r => r.block === block && r.key === key);
  return `<div class="match"><div class="mno"><span>${D2_LABEL[key]}</span>
    <span>No.${no}・${ct ? ct.court : 1}C</span></div>${sides}</div>`;
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
        ／ No.${isU ? "1・3・5・7・9・11（奇数枠）" : "2・4・6・8・10・12（偶数枠）"}</span></h2>
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
        <td class="lg" style="font-size:11px;font-weight:400">
          <span class="tag ${r.block === "U" ? "" : "lo"}" style="font-size:10px;padding:1px 6px">${r.block === "U" ? "上位" : "下位"}</span>
          ${D2_LABEL[r.key]}</td>
        <td class="a">${esc(nameOrLabel(cat, A))}</td>
        <td class="vs">vs</td>
        <td>${esc(nameOrLabel(cat, B))}</td>
      </tr>`;
    }).join("");
    return `<div><h3 class="sect"><span class="tag">第${ct}コート</span></h3>
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
      <button class="primary" id="b-print" data-ro="ok">このページを印刷 / PDF保存</button>
      <button id="b-csv-draw" data-ro="ok">抽選結果 CSV</button>
      <button id="b-csv-d1" data-ro="ok">1日目 進行表 CSV</button>
      <button id="b-csv-d2" data-ro="ok">2日目 進行表 CSV</button>
      <button id="b-csv-rank" data-ro="ok">最終順位 CSV</button>
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

  <div class="pagebreak">${leagueSquares(cat)}${day1ScheduleSection()}</div>
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
  renderEvMenu();

  const fn = { setup: renderSetup, teams: renderTeams, draw: renderDraw, day1: renderDay1, day2: renderDay2, out: renderOut }[ST.view];
  $("#view").innerHTML = fn();
  save();

  updateSyncBadge();
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
/** すべての大会と復元ポイントを1つのJSONファイルに書き出す */
function exportBackup(suffix) {
  save();
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date(), p = n => String(n).padStart(2, "0");
  a.download = (ST.meta.name || "大会").replace(/[\\/:*?"<>|]/g, "_")
    + (suffix ? "_" + suffix : "") + `_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
  // メニューの外をクリックしたら閉じる
  if (evMenuOpen && !e.target.closest("#evmenu") && !e.target.closest("#evsw")) closeEvMenu();

  const b = e.target.closest("button"); if (!b) return;

  if (b.id === "evsw") { evMenuOpen = !evMenuOpen; renderEvMenu(); return; }
  if (b.dataset.evpick) {
    closeEvMenu();
    if (b.dataset.evpick !== DB.currentId) { save(); openEvent(b.dataset.evpick); startSync(); }
    render(); window.scrollTo(0, 0); return;
  }
  if (b.id === "b-evm-manage") { closeEvMenu(); ST.view = "setup"; render();
    setTimeout(() => { const h = [...document.querySelectorAll(".panel>h2")].find(x => x.textContent.includes("この大会の操作")); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
    return; }
  if (b.id === "b-evm-new" || b.id === "b-evm-new2") {
    closeEvMenu();
    const nm = (prompt("新しい大会の名前", ST.meta.name || "大会") || "").trim();
    if (!nm) return;
    save(); createEvent(nm, b.id === "b-evm-new2"); startSync(); render(); window.scrollTo(0, 0); return;
  }

  if (b.dataset.cat) { ST.cat = b.dataset.cat; render(); return; }

  if (b.dataset.ev) {
    const id = b.dataset.id, ev = DB.events[id];
    if (!ev) return;
    const nm = normalizeState(ev.state).meta.name || "（名称未設定）";
    if (b.dataset.ev === "open") { save(); openEvent(id); render(); return; }
    if (b.dataset.ev === "dup") { save(); duplicateEvent(id); render(); return; }
    if (b.dataset.ev === "del") {
      if (!confirm(`大会「${nm}」を削除します。\nこの大会の抽選結果・試合結果はすべて消え、元に戻せません。\n\n本当に削除しますか？`)) return;
      if (id === DB.currentId) snap("削除する直前の状態");
      deleteEvent(id); render(); return;
    }
  }
  if (b.dataset.copy) {
    navigator.clipboard.writeText(b.dataset.copy)
      .then(() => { const t = b.textContent; b.textContent = "コピーしました"; setTimeout(() => { b.textContent = t; }, 1400); })
      .catch(() => prompt("コピーしてください", b.dataset.copy));
    return;
  }
  if (b.dataset.snap) {
    const sp = DB.snaps.find(x => x.id === b.dataset.snap);
    if (!sp) return;
    if (!confirm(`「${sp.label}」（${nowStamp(sp.at)}）の時点に戻します。\n現在の内容は復元ポイントとして残るので、やり直せます。\n\n戻しますか？`)) return;
    restoreSnap(b.dataset.snap); render(); return;
  }
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
    case "b-next": cat.revealed = Math.min(16, cat.revealed + 1); afterReveal(cat); render(); return;
    case "b-all": cat.revealed = 16; afterReveal(cat); render(); return;
    case "b-redo":
      if (!confirm("抽選をやり直します。現在の抽選結果と、入力済みの試合結果もすべて消えます。よろしいですか？")) return;
      snap(`${ST.cat} 抽選をやり直す直前`);
      cat.order = null; cat.revealed = 0; cat.seed = null; cat.scores = {}; cat.rankOrder = {}; cat.d2 = {};
      render(); return;
    case "b-demo": {
      if (!confirm("3カテゴリすべてにサンプルの16チームを入れ、抽選まで実行します。\n現在入力されている内容は上書きされます。よろしいですか？")) return;
      snap("サンプル投入の直前");
      CATS.forEach(c => {
        const x = ST.cats[c] = initCat();
        x.teams = demoTeams();
        x.avoidPref = true;
        x.seed = newSeed();
        const keep = ST.cat; ST.cat = c;          // drawOrder はカテゴリ名も種に使う
        x.order = drawOrder(x, x.seed);
        ST.cat = keep;
        x.revealed = 16;
      });
      ST.view = "draw"; render(); window.scrollTo(0, 0); return;
    }
    case "b-demo2": {
      if (!CATS.every(c => ST.cats[c].order)) { alert("先に「サンプル16チームを入れて抽選まで実行」を押してください。"); return; }
      if (!confirm("1日目の全試合にランダムなスコアを入れます。入力済みの結果は上書きされます。よろしいですか？")) return;
      snap("サンプル結果投入の直前");
      CATS.forEach((c, ci) => {
        const x = ST.cats[c], rng = makeRng("demo-score-" + c + "-" + x.seed);
        x.scores = {}; x.rankOrder = {};
        LG.forEach(L => LEAGUE_ORDER.forEach((_, mi) => {
          x.scores[L + "-" + mi] = { a: Math.floor(rng() * 4), b: Math.floor(rng() * 4) };
        }));
      });
      ST.view = "day1"; render(); window.scrollTo(0, 0); return;
    }
    case "b-api-edit": {
      const v = (prompt("同期サーバーのURL", DB.pref.apiBase || "") || "").trim();
      if (!v) return;
      if (!/^https?:\/\//.test(v)) { alert("https:// から始まるURLを入力してください。"); return; }
      DB.pref.apiBase = v.replace(/\/+$/, ""); persist(); SYNC.version = 0; SYNC.lastSent = null; startSync(); render(); return;
    }
    case "b-sync-now": pullNow(true).then(() => { schedulePush(); render(); }); return;
    case "b-sync-toggle":
    case "b-sync-toggle2": {
      const off = !DB.pref.syncOff;
      if (off && !confirm("同期を止めます。\nこの端末で入力した内容は、他の端末には表示されなくなります。\n\n止めますか？")) return;
      setSyncOff(off); render(); return;
    }
    case "b-teams-backup": exportBackup(); return;
    case "b-print": window.print(); return;
    case "b-csv-draw": dl(fname("抽選結果"), csvDraw()); return;
    case "b-csv-d1": dl(fname("1日目進行表"), csvDay1()); return;
    case "b-csv-d2": dl(fname("2日目進行表"), csvDay2()); return;
    case "b-csv-rank": dl(fname("最終順位"), csvRank()); return;
    case "b-export": exportBackup(); return;
    case "b-import": $("#f-file").click(); return;
    case "b-snap": {
      const label = (prompt("復元ポイントの名前", "手動保存") || "").trim();
      if (!label) return;
      snap(label); render(); return;
    }
    case "b-ev-clear":
      if (!confirm(`大会「${ST.meta.name}」の入力内容（チーム・抽選・試合結果）をすべて消します。\n直前の状態は復元ポイントに残ります。\n\n消してよろしいですか？`)) return;
      snap("消去する直前の状態");
      { const keep = ST.meta.name, sched = JSON.parse(JSON.stringify(ST.sched)), st = normalizeState(null);
        ST.meta = st.meta; ST.meta.name = keep; ST.sched = sched; ST.cats = st.cats; }
      save(); render(); return;
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

/** 抽選が16枠すべて公開された瞬間に、復元ポイントと自動バックアップを作る */
function afterReveal(cat) {
  if (cat.revealed < 16 || cat.snapped) return;
  cat.snapped = true;
  snap(`${ST.cat} 抽選確定`);
  if (DB.pref.autoDl) setTimeout(() => exportBackup(`${ST.cat}抽選確定`), 300);
}

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
  if (el.name === "d1mode") { ST.sched.d1Mode = el.value; render(); return; }
  if (el.id === "f-avoid") { cat.avoidPref = el.checked; save(); return; }
  if (el.id === "f-autodl") { DB.pref.autoDl = el.checked; persist(); return; }
  if (el.id === "f-file") {
    const f = el.files && el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (o && o.events && Object.keys(o.events).length) {
          // 新形式：大会をまるごと取り込む（既存の大会は残す）
          const n = Object.keys(o.events).length;
          if (!confirm(`バックアップに含まれる ${n} 件の大会を取り込みます。\n現在の大会はそのまま残ります。\n\n取り込みますか？`)) return;
          save();
          let lastId = null;
          Object.values(o.events).forEach(ev => {
            const id = DB.events[ev.id] ? newId("evt_") : ev.id;
            DB.events[id] = { id, createdAt: ev.createdAt || Date.now(), updatedAt: ev.updatedAt || Date.now(), state: normalizeState(ev.state) };
            lastId = id;
          });
          (o.snaps || []).forEach(sp => { if (DB.events[sp.eventId]) DB.snaps.push(sp); });
          while (DB.snaps.length > 12) DB.snaps.shift();
          if (lastId) openEvent(lastId);
          render();
        } else if (o && o.cats) {
          // 旧形式：1大会分として取り込む
          if (!confirm("バックアップを新しい大会として取り込みます。\n現在の大会はそのまま残ります。\n\n取り込みますか？")) return;
          save();
          const id = newId("evt_");
          DB.events[id] = { id, createdAt: Date.now(), updatedAt: Date.now(), state: normalizeState(o) };
          openEvent(id);
          render();
        } else { throw new Error("形式が違います"); }
      } catch (err) { alert("バックアップファイルを読み込めませんでした：" + err.message); }
      el.value = "";
    };
    r.readAsText(f);
  }
});

document.addEventListener("keydown", e => { if (e.key === "Escape") closeEvMenu(); });

/* ===================== 起動 ===================== */
load();
startSync();
render();

// 保存されるたびに自動で同期する
const _save = save;
save = function () { _save(); schedulePush(); };
