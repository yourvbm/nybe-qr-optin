# New York's Best Experiences: QR Opt-in

Two QR-code opt-in landing pages for newyorksbestexperiences.com (Josiah Brown), each with the
same form and a different thank-you page:

- `/spin/`: "All Set! You're ready to spin the wheel!" (used when the attendee spins a prize
  wheel live at the event)
- `/inbox/`: "All Set! Check your inbox..." (used when there's no in-person wheel)

Form fields: first name, email, zip code, choose up to 5 interests (at least one required). On
submit, a Cloudflare Worker (`worker/`) upserts a GHL contact, tags it `QR - Spin Wheel` or
`QR - Check Inbox` (by source) plus one `Interest - <name>` tag per selected interest,
populates a custom "Interests" field with a natural-language list, and adds a contact note.

**Gotcha:** never tag a contact with anything containing the literal phrase "QR Code". GHL
silently strips any tag matching that pattern a few seconds after it's applied (confirmed live
2026-09-10), reserved for their own native QR-tracking feature. Use "QR - <name>" instead, which
is unaffected.

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
