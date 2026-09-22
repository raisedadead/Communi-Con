# Communi-Con

A shared demo for IndiaFOSS 2026. Attendees join a practice circle from their phones, then give private feedback during a sample talk. Co-chairs see the results and choose when to cue applause.

## Try the demo

1. Open `/admin` on the laptop and select **Create a demo room**.
2. Open **Stage view** from that room. Scan its QR code with a phone, or use **Copy participant link** on the co-chair page.
3. On the phone, tap **Join the circle**. The stage shows connected participants.
4. On the laptop, select **Start sample talk**, then **05:00 · Vote**. The phone follows the session and opens its ballot.
5. Vote from the phone. Only the co-chair sees the totals. Changing a choice replaces that ballot.
6. Select **08:00 · Wrap up**, then **Cue a round of applause**. The phone and stage show the cue. **Reset demo** returns the room to practice.

Use links from the same room. The browser that creates a room holds its co-chair access cookie. Opening its `/admin?room=…` URL in another browser does not grant access. The cookie lasts one day; create a new demo room if access expires.

## Run locally

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:8000/admin>. This builds the frontend and starts a local Cloudflare Worker with PartyServer, PartySocket, and Durable Objects. The talk clock and ballots belong to the server. Reloading a phone restores its choice. The clock continues if the co-chair closes its tab.

After editing frontend files, run `npm run build` again. Room data stays in `.wrangler/`, which Git ignores.

## Share with phones

Start a temporary tunnel in one terminal:

```sh
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000 --http-host-header localhost:8000
```

Copy the HTTPS origin printed by cloudflared. Build the app, then start the preview in another terminal with that origin. Stop any earlier preview process first.

```sh
npm run build
npm run preview -- --var PUBLIC_ORIGIN:https://YOUR-URL.trycloudflare.com
```

Open that public origin at `/admin`, create a room, and scan its new QR code. Keep the Mac, preview process, and tunnel running. A new tunnel address needs a new room. `npm run preview` disables Wrangler's local explorer and observability routes before exposing the app.

## Demo boundaries

- Feedback opens at five minutes. The co-chair can cue applause from eight minutes. Ten minutes ends the sample talk. Walkthrough buttons skip the wait.
- Votes do not trigger a stage effect. Audience and stage connections receive no aggregate results. Each attendee receives only their own choice.
- The practice circle represents connected browsers. It shares joining the circle, not continuous pointer movement.
- One browser profile represents one participant. There is no ticket check or one-person-one-vote guarantee. Co-chair access is limited to the creating browser; there are no organizer accounts or invitations.
- The sample talk is fictional. Timings and labels are proposals for organizer review.
- The Worker runs locally through the tunnel. No production Cloudflare resources are deployed. Capacity for 500+ participants and physical-phone/venue behavior remain unverified.
- Fonts load from Google Fonts, with system-font fallbacks.

See [Cloudflare research](docs/cloudflare-research.md) for event-scale follow-up and the [Open Design prompt](docs/open-design-prompt.md) for another visual exploration.

## Validate

```sh
npm run check
npm run build
```

These check the browser and Worker TypeScript and build `dist/`. They do not deploy anything.
