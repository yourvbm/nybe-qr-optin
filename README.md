# New York's Best Experiences: QR Opt-in

Two QR-code opt-in landing pages for newyorksbestexperiences.com (Josiah Brown), each with the
same form and a different thank-you page:

- `/spin/`: "All Set! You're ready to spin the wheel!" (used when the attendee spins a prize
  wheel live at the event)
- `/inbox/`: "All Set! Check your inbox..." (used when there's no in-person wheel)

Form fields: first name, email, zip code, choose up to 5 interests (at least one required). On
submit, a Cloudflare Worker (`worker/`) upserts a GHL contact, tags it `QR Code - Spin Wheel` or
`QR Code - Check Inbox` (by source) plus one `Interest - <name>` tag per selected interest,
populates a custom "Interests" field with a natural-language list, and adds a contact note.

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
