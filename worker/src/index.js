/* =======================================================================
   大会データ共有サーバー
   - 大会1件 ＝ Durable Object 1つ（SQLiteバックエンド）
   - 共有コードを知っていれば閲覧でき、編集キーを持つ端末だけが書き込める
   - D1 は使用しない
   ======================================================================= */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 紛らわしい I O 0 1 を除外
const MAX_BODY = 900 * 1024;                            // 1オブジェクトの保存上限（2MB）に対する安全側の制限

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type,x-edit-key",
  "access-control-max-age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function randomToken(n) {
  const b = new Uint32Array(n);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** 共有コードの表記ゆれを吸収（小文字・ハイフン・空白を無視） */
function normalizeCode(raw) {
  const c = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{8}$/.test(c) ? c : null;
}

async function readBody(request) {
  const len = +(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BODY) return { tooLarge: true };
  try { return { data: JSON.parse(text) }; } catch (e) { return { bad: true }; }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/" || path === "/health") {
      return json({ ok: true, service: "tournament-share" });
    }

    // 新しい共有を作る
    if (path === "/api/rooms" && request.method === "POST") {
      const body = await readBody(request);
      if (body.tooLarge) return json({ error: "too_large" }, 413);
      if (body.bad) return json({ error: "bad_json" }, 400);

      const code = randomToken(8);
      const editKey = randomToken(24);
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      const res = await stub.fetch("https://do/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          editKeyHash: await sha256(editKey),
          state: (body.data && body.data.state) || null
        })
      });
      if (!res.ok) return json({ error: "create_failed" }, 500);
      const out = await res.json();
      return json({ code, editKey, version: out.version });
    }

    const m = path.match(/^\/api\/rooms\/([A-Za-z0-9-]{8,12})$/);
    if (m) {
      const code = normalizeCode(m[1]);
      if (!code) return json({ error: "bad_code" }, 400);
      const stub = env.ROOM.get(env.ROOM.idFromName(code));

      if (request.method === "GET") {
        const res = await stub.fetch("https://do/get");
        if (res.status === 404) return json({ error: "not_found" }, 404);
        return json(await res.json());
      }

      if (request.method === "PUT") {
        const body = await readBody(request);
        if (body.tooLarge) return json({ error: "too_large" }, 413);
        if (body.bad) return json({ error: "bad_json" }, 400);
        const key = request.headers.get("x-edit-key") || "";
        if (!key) return json({ error: "no_edit_key" }, 401);

        const res = await stub.fetch("https://do/put", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            editKeyHash: await sha256(key),
            state: body.data.state,
            baseVersion: body.data.baseVersion
          })
        });
        if (res.status === 404) return json({ error: "not_found" }, 404);
        if (res.status === 403) return json({ error: "forbidden" }, 403);
        if (res.status === 409) return json({ error: "conflict", ...(await res.json()) }, 409);
        if (!res.ok) return json({ error: "put_failed" }, 500);
        return json(await res.json());
      }

      return json({ error: "method_not_allowed" }, 405);
    }

    return json({ error: "not_found" }, 404);
  }
};

/* ---------------------------------------------------------------------
   Durable Object：大会1件分のデータを保持する
   storage.put / storage.get のみを使用（SQL は書かない）
   --------------------------------------------------------------------- */
export class TournamentRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const store = this.ctx.storage;

    if (path === "/create") {
      const b = await request.json();
      if (await store.get("meta")) return new Response("exists", { status: 409 });
      const meta = { code: b.code, editKeyHash: b.editKeyHash, createdAt: Date.now(), updatedAt: Date.now(), version: 1 };
      await store.put("meta", meta);
      await store.put("state", b.state);
      return Response.json({ version: meta.version });
    }

    if (path === "/get") {
      const meta = await store.get("meta");
      if (!meta) return new Response("not_found", { status: 404 });
      return Response.json({
        version: meta.version,
        updatedAt: meta.updatedAt,
        state: (await store.get("state")) ?? null
      });
    }

    if (path === "/put") {
      const meta = await store.get("meta");
      if (!meta) return new Response("not_found", { status: 404 });
      const b = await request.json();
      if (b.editKeyHash !== meta.editKeyHash) return new Response("forbidden", { status: 403 });

      // 別の端末が先に更新していたら、こちらの上書きを止めてサーバーの内容を返す
      if (typeof b.baseVersion === "number" && b.baseVersion !== meta.version) {
        return new Response(JSON.stringify({
          version: meta.version,
          updatedAt: meta.updatedAt,
          state: (await store.get("state")) ?? null
        }), { status: 409, headers: { "content-type": "application/json" } });
      }

      meta.version += 1;
      meta.updatedAt = Date.now();
      await store.put("state", b.state);
      await store.put("meta", meta);
      return Response.json({ version: meta.version, updatedAt: meta.updatedAt });
    }

    return new Response("not_found", { status: 404 });
  }
}
