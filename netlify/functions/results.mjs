// /api/results — team results stored in Netlify Blobs.
//   GET              list every result (team code or admin code)
//   PUT ?id=...      save one result. Team members may only write their own device id;
//                    the admin may write any id (entering answers for someone else).
//   DELETE ?id=...   admin only
import { getStore } from "@netlify/blobs";
import seed from "../../data/seed.json";

const LANES = ["point","outcomes","mobilization","finance","media","communications","operations","worship","outreach","systems","other"];
const TRAITS = ["ini","ppl","pat","str","log","cre"];
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

function roleFor(req) {
  const team = Netlify.env.get("TEAM_CODE") || "";
  const admin = Netlify.env.get("ADMIN_CODE") || "";
  const code = req.headers.get("x-team-code") || "";
  if (admin && code === admin) return "admin";
  if (team && code === team) return "member";
  return null;
}

async function ensureSeeded(store) {
  if (await store.get("_meta/seeded")) return;
  for (const rec of seed.results || []) {
    const { id, ...data } = rec;
    if (ID_RE.test(id) && !(await store.get(id))) await store.setJSON(id, data);
  }
  await store.set("_meta/seeded", new Date().toISOString());
}

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const num10 = (v) => (typeof v === "number" && isFinite(v) ? Math.min(10, Math.max(0, Math.round(v * 10) / 10)) : null);
const scoreObj = (o) => {
  if (!o || typeof o !== "object") return null;
  // Older records used "pac" (Pace, high = fast). Culture Index direction is Patience (high = steady).
  if (o.pat == null && typeof o.pac === "number") o = { ...o, pat: 10 - o.pac };
  const out = {};
  for (const k of TRAITS) { const v = num10(o[k]); if (v == null) return null; out[k] = v; }
  return out;
};
const answerArr = (a) => (Array.isArray(a) && a.length === 24 && a.every((x) => Number.isInteger(x) && x >= 1 && x <= 5) ? a : undefined);
const ciRows = (o) => {
  if (!o || typeof o !== "object") return {};
  const out = {};
  for (const k of ["A","B","C","D","L","I"]) out[k] = str(String(o[k] ?? ""), 6);
  return out;
};

// Keep only known fields, so the store never holds anything unexpected.
function clean(body) {
  const scores = scoreObj(body.scores);
  if (!scores) return null;
  const rec = {
    name: str(body.name, 60).trim(),
    lane: LANES.includes(body.lane) ? body.lane : "other",
    role: str(body.role, 60).trim(),
    scores,
    updatedAt: Date.now(),
  };
  const pat = str(body.pattern, 40).trim(); if (pat) rec.pattern = pat;
  if (!rec.name) return null;
  const job = scoreObj(body.jobScores); if (job) rec.jobScores = job;
  const a1 = answerArr(body.answers); if (a1) rec.answers = a1;
  const a2 = answerArr(body.jobAnswers); if (a2) rec.jobAnswers = a2;
  if (body.source === "ci") {
    rec.source = "ci";
    const c = body.ci || {};
    rec.ci = { traits: ciRows(c.traits), job: ciRows(c.job), traitsArrow: str(String(c.traitsArrow ?? ""), 6), jobArrow: str(String(c.jobArrow ?? ""), 6), traitsEU: str(String(c.traitsEU ?? ""), 4), jobEU: str(String(c.jobEU ?? ""), 4), pattern: str(c.pattern, 40) };
  }
  return rec;
}

export default async (req) => {
  const role = roleFor(req);
  if (!role) return json({ error: "bad_code" }, 401);

  const store = getStore({ name: "results", consistency: "strong" });
  await ensureSeeded(store);
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const keys = blobs.map((b) => b.key).filter((k) => !k.startsWith("_meta/"));
    const results = (await Promise.all(keys.map(async (k) => {
      const d = await store.get(k, { type: "json" });
      return d ? { id: k, ...d } : null;
    }))).filter(Boolean);
    return json({ role, imageReading: !!Netlify.env.get("ANTHROPIC_API_KEY"), results });
  }

  if (!ID_RE.test(id) || id.startsWith("_meta")) return json({ error: "bad_id" }, 400);

  if (req.method === "PUT") {
    const device = req.headers.get("x-device-id") || "";
    if (role !== "admin" && id !== device) return json({ error: "forbidden" }, 403);
    const raw = await req.text();
    if (raw.length > 20000) return json({ error: "too_large" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
    const rec = clean(body);
    if (!rec) return json({ error: "invalid" }, 400);
    await store.setJSON(id, rec);
    return json({ ok: true });
  }

  if (req.method === "DELETE") {
    if (role !== "admin") return json({ error: "forbidden" }, 403);
    await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/results" };
