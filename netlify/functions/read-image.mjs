// /api/read-image — reads a photo or screenshot of a Culture Index chart with Claude.
// Optional: only active when ANTHROPIC_API_KEY is set. PDFs never come here; the page
// reads those directly in the browser.
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const code = req.headers.get("x-team-code") || "";
  const ok = [Netlify.env.get("TEAM_CODE"), Netlify.env.get("ADMIN_CODE")].some((c) => c && c === code);
  if (!ok) return json({ error: "bad_code" }, 401);
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "not_configured" }, 403);

  let body; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const { prompt, image, mediaType } = body || {};
  if (typeof prompt !== "string" || prompt.length > 4000) return json({ error: "bad_prompt" }, 400);
  if (typeof image !== "string" || image.length > 7_000_000 || !TYPES.includes(mediaType)) return json({ error: "bad_image" }, 400);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
        { type: "text", text: prompt },
      ] }],
    }),
  });
  if (!res.ok) return json({ error: "upstream", status: res.status }, 502);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const m = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  if (!m) return json({ error: "no_json" }, 502);
  try { return json({ result: JSON.parse(m[0]) }); } catch { return json({ error: "no_json" }, 502); }
};

export const config = { path: "/api/read-image" };
