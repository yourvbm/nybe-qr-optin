// New York's Best Experiences: QR opt-in intake Worker
// Custom form (spin/ and inbox/ pages) --POST JSON--> this Worker --> LeadConnector upsert + tags.
// The Private Integration Token lives ONLY in the Worker secret GHL_PIT. Never in page JS or the repo.

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";
const MAX_INTERESTS = 5;
const INTERESTS_FIELD_ID = "uv1wSb5LF0fkAPswUFHL"; // "Interests" custom field (contact.interests)

// "Foodie" / "Foodie and Wine" / "Foodie, Wine and Hiking": first word capitalized, "and" before the last.
function formatInterestList(items) {
  if (items.length === 0) return "";
  const list = items.slice();
  list[0] = list[0].charAt(0).toUpperCase() + list[0].slice(1);
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

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

    // honeypot: hidden field bots fill in, humans leave blank. Silently succeed so bots learn nothing.
    if (d.company) return j({ ok: true }, 200, cors);

    const firstName = (d.firstName || "").trim();
    const email = (d.email || "").trim();
    const zip = (d.zip || "").trim().slice(0, 10);
    const interests = Array.isArray(d.interests) ? d.interests.filter((s) => typeof s === "string" && s.trim()).slice(0, MAX_INTERESTS) : [];
    const source = (d.source || "qr").trim();

    if (!firstName) return j({ ok: false, error: "first_name_required" }, 422, cors);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ ok: false, error: "bad_email" }, 422, cors);
    if (!zip) return j({ ok: false, error: "zip_required" }, 422, cors);
    if (interests.length < 1) return j({ ok: false, error: "interests_required" }, 422, cors);

    const H = {
      Authorization: `Bearer ${env.GHL_PIT}`,
      Version: VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const interestList = formatInterestList(interests);

    // 1) UPSERT (create-or-update by email within the location)
    const upsertBody = {
      locationId: env.GHL_LOCATION_ID,
      firstName,
      email,
      source,
      ...(zip ? { postalCode: zip } : {}),
      customFields: [{ id: INTERESTS_FIELD_ID, value: interestList }],
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

    const sourceLabel = source === "qr-spin" ? "the Spin Wheel QR Code"
      : source === "qr-inbox" ? "the Check Inbox QR Code"
      : "a QR Code";
    // NOTE: GHL silently strips any tag containing the exact phrase "QR Code" a few seconds after
    // it's applied (reserved for their own native QR-tracking feature) - confirmed live 2026-09-10.
    // "QR - <name>" survives fine, so that's what we use instead of "QR Code - <name>".
    const sourceTag = source === "qr-spin" ? "QR - Spin Wheel"
      : source === "qr-inbox" ? "QR - Check Inbox"
      : "QR";

    // 2) ADDITIVE TAGS. Never a full PUT, which would replace the contact's existing tags.
    if (contactId) {
      const tags = [sourceTag, ...interests.map((i) => `Interest - ${i}`)];
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

    // 3) NOTE: best-effort, never fail the submission on it.
    if (contactId) {
      const noteBody = `Came in through ${sourceLabel}. Interests: ${interestList}.`;
      try {
        await fetch(`${API}/contacts/${contactId}/notes`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ body: noteBody }),
        });
      } catch {
        // non-critical
      }
    }

    return j({ ok: true }, 200, cors);
  },
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
