// New York's Best Experiences — QR opt-in intake Worker
// Custom form (spin/ and inbox/ pages) --POST JSON--> this Worker --> LeadConnector upsert + tags.
// The Private Integration Token lives ONLY in the Worker secret GHL_PIT — never in page JS or the repo.

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";
const MAX_INTERESTS = 5;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allow = env.ALLOWED_ORIGIN || origin;
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== "/api/optin") return j({ ok: false, error: "not_found" }, 404, cors);
    if (req.method !== "POST") return j({ ok: false, error: "method_not_allowed" }, 405, cors);

    let d;
    try { d = await req.json(); } catch { return j({ ok: false, error: "bad_json" }, 400, cors); }

    // honeypot — hidden field bots fill in, humans leave blank. Silently succeed so bots learn nothing.
    if (d.company) return j({ ok: true }, 200, cors);

    const firstName = (d.firstName || "").trim();
    const email = (d.email || "").trim();
    const interests = Array.isArray(d.interests) ? d.interests.filter((s) => typeof s === "string" && s.trim()).slice(0, MAX_INTERESTS) : [];
    const source = (d.source || "qr").trim();

    if (!firstName) return j({ ok: false, error: "first_name_required" }, 422, cors);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ ok: false, error: "bad_email" }, 422, cors);
    if (interests.length < 1) return j({ ok: false, error: "interests_required" }, 422, cors);

    const H = {
      Authorization: `Bearer ${env.GHL_PIT}`,
      Version: VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 1) UPSERT (create-or-update by email within the location)
    const upsertBody = {
      locationId: env.GHL_LOCATION_ID,
      firstName,
      email,
      source,
    };

    let contactId;
    try {
      const up = await fetch(`${API}/contacts/upsert`, { method: "POST", headers: H, body: JSON.stringify(upsertBody) });
      if (!up.ok) return j({ ok: false, error: "upsert_failed", status: up.status }, 502, cors);
      const r = await up.json();
      contactId = (r.contact && r.contact.id) || r.id;
    } catch {
      return j({ ok: false, error: "upstream_unreachable" }, 502, cors);
    }

    // 2) ADDITIVE TAGS — never a full PUT, which would replace the contact's existing tags.
    if (contactId) {
      const tags = ["QR Code", ...interests.map((i) => `Interest - ${i}`)];
      try {
        await fetch(`${API}/contacts/${contactId}/tags`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ tags }),
        });
      } catch {
        // contact exists even if the tag call failed; not fatal to the submission
      }
    }

    return j({ ok: true }, 200, cors);
  },
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
