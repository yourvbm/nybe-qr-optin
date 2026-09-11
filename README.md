# New York's Best Experiences: QR Opt-in

Two QR-code opt-in landing pages for newyorksbestexperiences.com (Josiah Brown), each with the
same form and a different thank-you page:

- `/spin/`: "All Set! You're ready to spin the wheel!" (used when the attendee spins a prize
  wheel live at the event)
- `/inbox/`: "All Set! Check your inbox..." (used when there's no in-person wheel)

Form fields: first name, email, zip code, choose up to 5 interests (at least one required). On
submit, a Cloudflare Worker (`worker/`) upserts a GHL contact, tags it `Source - Spin Wheel` or
`Source - Check Inbox` (by source) plus one `Interest - <name>` tag per selected interest,
populates a custom "Interests" field with a natural-language list, and adds a contact note.

**Gotcha:** never tag a contact with anything starting with "QR" ("QR Code - ...", plain
"QR - ...", etc). GHL silently strips those tags a few seconds after they're applied, no error
returned, confirmed live on two different locations (2026-09-10, 2026-09-11). "Source - <name>"
has survived reliably across repeated tests; re-verify with a side-by-side tag test before
trusting anything new.

## Structure

- `public/`: static site, deployed to Cloudflare Pages (`qr.newyorksbestexperiences.com`)
- `worker/`: Cloudflare Worker holding the GHL Private Integration Token, deployed separately
  (`nybe-qr-worker.miriam-68c.workers.dev`)

## Deploy

```bash
# Pages (from repo root)
npx wrangler pages deploy public --project-name=nybe-qr-optin

# Worker (from worker/)
cd worker
npx wrangler secret put GHL_PIT
npx wrangler deploy
```
