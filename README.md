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

**Tag naming matters here:** the `QR - Spin Wheel` tag has to exactly match the trigger tag on
the "QR Code - Spin the Wheel" GHL workflow, which removes that tag as its own first action (then
adds `qr code - spin wheel` and sends an email). A tag disappearing a few seconds after being
applied is that workflow firing correctly, not a bug. If the tag names here ever need to change,
read the actual workflow definition first (don't guess from watching a tag vanish).

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
