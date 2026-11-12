// New York's Best Experiences: QR opt-in intake Worker
// Custom form (spin/ and inbox/ pages) --POST JSON--> this Worker --> LeadConnector upsert + tags.
// The Private Integration Token lives ONLY in the Worker secret GHL_PIT. Never in page JS or the repo.

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";
const MAX_INTERESTS = 5;
const INTERESTS_FIELD_ID = "tNGIMk5n6C3uGPxQf22c"; // "Interests" custom field (contact.interests)

// Must match the checkbox values in public/spin/index.html and public/inbox/index.html.
const INTEREST_TAGS = [
  "foodie", "wine", "culture/art", "hiking", "fishing", "camping/rving",
  "family fun", "craft beverage", "cool towns", "events", "beach",
  "autumn", "lodging", "winter fun", "adventure",
];

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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/api/interest-stats") {
      if (req.method !== "GET") return j({ ok: false, error: "method_not_allowed" }, 405, cors);
      return interestStats(env, cors);
    }

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
    // The "QR Code - Spin the Wheel" workflow on this location triggers on tag "qr - spin wheel"
    // and removes it as its own first action (by design, not a platform quirk - confirmed by
    // reading the workflow definition directly, 2026-09-11). Tag names below must match that
    // workflow's trigger exactly, or it silently won't fire.
    const sourceTag = source === "qr-spin" ? "QR - Spin Wheel"
      : source === "qr-inbox" ? "QR - Check Inbox"
      : "QR";

    // 2) ADDITIVE TAGS. Never a full PUT, which would replace the contact's existing tags.
    if (contactId) {
      const tags = [sourceTag, ...interests];
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

// Counts contacts per interest tag via /contacts/search (pageLimit:1, reads the `total` field).
// Read-only, no PII returned -- just tag name -> count.
async function interestStats(env, cors) {
  const H = {
    Authorization: `Bearer ${env.GHL_PIT}`,
    Version: VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    const counts = await Promise.all(
      INTEREST_TAGS.map(async (tag) => {
        const res = await fetch(`${API}/contacts/search`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({
            locationId: env.GHL_LOCATION_ID,
            pageLimit: 1,
            filters: [{ field: "tags", operator: "contains", value: tag }],
          }),
        });
        if (!res.ok) return [tag, null];
        const r = await res.json();
        return [tag, typeof r.total === "number" ? r.total : null];
      })
    );

    return j({ ok: true, generatedAt: new Date().toISOString(), counts }, 200, cors);
  } catch {
    return j({ ok: false, error: "upstream_unreachable" }, 502, cors);
  }
}
