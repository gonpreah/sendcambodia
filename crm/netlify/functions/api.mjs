// /api/* — The Send Cambodia CRM. Records live in Netlify Blobs (store "crm"):
//   p/<id>          one person
//   c/<id>          one church
//   ix/phone/<e164> -> person id (one person per phone number)
// Access: x-crm-code header = STAFF_CODE (staff) or ADMIN_CODE (admin); x-crm-user = who is editing.
import { getStore } from "@netlify/blobs";

const PROVINCES = ["phnom-penh","banteay-meanchey","battambang","kampong-cham","kampong-chhnang","kampong-speu","kampong-thom","kampot","kandal","kep","koh-kong","kratie","mondulkiri","oddar-meanchey","pailin","preah-sihanouk","preah-vihear","prey-veng","pursat","ratanakiri","siem-reap","stung-treng","svay-rieng","takeo","tbong-khmum","outside"];
const ROLES = ["attendee","volunteer","pastor","church-contact","donor","responder","staff"];
const STAGES = ["invited","interested","committed","bringing-group"];
const AGE = ["u18","18-25","26-35","36-50","50+"];
const SIZES = ["<50","50-150","150-500","500+"];
const ID_RE = /^[a-z0-9]{6,40}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const env = (k) => (globalThis.Netlify?.env?.get(k)) || "";
function roleFor(req) {
  const code = req.headers.get("x-crm-code") || "";
  if (env("ADMIN_CODE") && code === env("ADMIN_CODE")) return "admin";
  if (env("STAFF_CODE") && code === env("STAFF_CODE")) return "staff";
  return null;
}
const store = () => globalThis.__crmStore || getStore({ name: "crm", consistency: "strong" });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Cambodian numbers: 012 345 678, 855 12 345 678 and +855 12 345 678 all become +85512345678.
export function normPhone(raw) {
  let s = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) s = s.startsWith("855") ? "+" + s : "+855" + (s.startsWith("0") ? s.slice(1) : s);
  if (s.startsWith("+8550")) s = "+855" + s.slice(5);
  if (!/^\+\d{8,15}$/.test(s)) return null;
  if (s.startsWith("+855") && !/^\+855\d{8,9}$/.test(s)) return null;
  return s;
}
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const pick = (v, list) => (list.includes(v) ? v : "");

function cleanPerson(b) {
  const phone = normPhone(b.phone);
  if (phone === null) return { error: "bad_phone" };
  const p = {
    nameKm: str(b.nameKm, 80), nameEn: str(b.nameEn, 80), phone,
    telegram: str(b.telegram, 40).replace(/^@/, ""), email: str(b.email, 120).toLowerCase(),
    province: pick(b.province, PROVINCES), district: str(b.district, 60),
    gender: pick(b.gender, ["m", "f"]), ageBand: pick(b.ageBand, AGE), lang: pick(b.lang, ["km", "en", "both"]),
    roles: Array.isArray(b.roles) ? [...new Set(b.roles.filter((r) => ROLES.includes(r)))] : [],
    churchId: ID_RE.test(b.churchId || "") ? b.churchId : "",
    notes: str(b.notes, 2000),
    consentMsg: b.consentMsg === true, guardianConsent: b.guardianConsent === true,
  };
  if (!p.nameKm && !p.nameEn) return { error: "no_name" };
  return { rec: p };
}
function cleanChurch(b) {
  const phone = normPhone(b.phone);
  if (phone === null) return { error: "bad_phone" };
  const c = {
    nameKm: str(b.nameKm, 120), nameEn: str(b.nameEn, 120), phone,
    province: pick(b.province, PROVINCES), district: str(b.district, 60),
    network: str(b.network, 80), pastorName: str(b.pastorName, 80),
    size: pick(b.size, SIZES), stage: pick(b.stage, STAGES) || "invited", notes: str(b.notes, 2000),
  };
  if (!c.nameKm && !c.nameEn) return { error: "no_name" };
  return { rec: c };
}

async function listAll(s, prefix) {
  const { blobs } = await s.list({ prefix });
  const out = await Promise.all(blobs.map(async (b) => {
    const d = await s.get(b.key, { type: "json" });
    return d ? { id: b.key.slice(prefix.length), ...d } : null;
  }));
  return out.filter(Boolean);
}

// Save a person, keeping the phone index in step. Returns {id} or {error, id}.
async function savePerson(s, id, rec, who, { merge = false } = {}) {
  const old = id ? await s.get("p/" + id, { type: "json" }) : null;
  if (id && !old) return { error: "not_found" };
  if (rec.phone) {
    const owner = await s.get("ix/phone/" + rec.phone);
    if (owner && owner !== id) {
      if (!merge) return { error: "duplicate", id: owner };
      // Import: fill the existing record's empty fields and add roles; never overwrite what is there.
      const cur = await s.get("p/" + owner, { type: "json" });
      if (cur) {
        const m = { ...cur };
        for (const [k, v] of Object.entries(rec)) {
          if (k === "roles") m.roles = [...new Set([...(cur.roles || []), ...v])];
          else if ((m[k] === "" || m[k] == null || m[k] === false) && v) m[k] = v;
        }
        m.updatedAt = Date.now(); m.updatedBy = who;
        await s.setJSON("p/" + owner, m);
        return { id: owner, merged: true };
      }
    }
  }
  const pid = id || newId();
  const now = Date.now();
  const full = { ...rec, createdAt: old?.createdAt || now, createdBy: old?.createdBy || who, updatedAt: now, updatedBy: who };
  await s.setJSON("p/" + pid, full);
  if (old?.phone && old.phone !== rec.phone) await s.delete("ix/phone/" + old.phone);
  if (rec.phone) await s.set("ix/phone/" + rec.phone, pid);
  return { id: pid };
}

export default async (req) => {
  const role = roleFor(req);
  if (!role) return json({ error: "bad_code" }, 401);
  const who = str(req.headers.get("x-crm-user") || "", 60) || role;
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  const id = url.searchParams.get("id") || "";
  if (id && !ID_RE.test(id)) return json({ error: "bad_id" }, 400);
  const s = store();
  const body = async () => { const t = await req.text(); if (t.length > 2_000_000) throw new Error("too_large"); return t ? JSON.parse(t) : {}; };

  try {
    if (route === "me") return json({ role });

    if (route === "data" && req.method === "GET") {
      const [people, churches] = await Promise.all([listAll(s, "p/"), listAll(s, "c/")]);
      return json({ role, people, churches });
    }

    if (route === "people") {
      if (req.method === "PUT") {
        const { rec, error } = cleanPerson(await body());
        if (error) return json({ error }, 400);
        const out = await savePerson(s, id, rec, who);
        if (out.error) return json(out, out.error === "duplicate" ? 409 : 404);
        return json(out);
      }
      if (req.method === "DELETE") {
        if (role !== "admin") return json({ error: "forbidden" }, 403);
        const old = await s.get("p/" + id, { type: "json" });
        if (old?.phone && (await s.get("ix/phone/" + old.phone)) === id) await s.delete("ix/phone/" + old.phone);
        await s.delete("p/" + id);
        return json({ ok: true });
      }
    }

    if (route === "churches") {
      if (req.method === "PUT") {
        const { rec, error } = cleanChurch(await body());
        if (error) return json({ error }, 400);
        const old = id ? await s.get("c/" + id, { type: "json" }) : null;
        if (id && !old) return json({ error: "not_found" }, 404);
        const cid = id || newId(), now = Date.now();
        await s.setJSON("c/" + cid, { ...rec, createdAt: old?.createdAt || now, createdBy: old?.createdBy || who, updatedAt: now, updatedBy: who });
        return json({ id: cid });
      }
      if (req.method === "DELETE") {
        if (role !== "admin") return json({ error: "forbidden" }, 403);
        await s.delete("c/" + id);
        return json({ ok: true });
      }
    }

    // Bulk import of people (paper sign-ups, church group lists). Same phone = fill in the existing record.
    if (route === "import" && req.method === "POST") {
      const { people } = await body();
      if (!Array.isArray(people) || people.length > 500) return json({ error: "bad_batch" }, 400);
      const result = { created: 0, merged: 0, skipped: [] };
      for (let i = 0; i < people.length; i++) {
        const { rec, error } = cleanPerson(people[i] || {});
        if (error) { result.skipped.push({ row: i, reason: error }); continue; }
        const out = await savePerson(s, "", rec, who, { merge: true });
        if (out.merged) result.merged++; else result.created++;
      }
      return json(result);
    }
  } catch (e) {
    return json({ error: e.message === "too_large" ? "too_large" : "bad_request" }, 400);
  }
  return json({ error: "not_found" }, 404);
};

export const config = { path: "/api/*" };
