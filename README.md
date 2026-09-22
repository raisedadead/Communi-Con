# Communi-Con

A visual concept for IndiaFOSS 2026. Attendees join a cursor playground, then give private feedback during a sample talk. Co-chairs see the results and choose when to cue the stage.

The [official event page](https://platform.fossunited.org/c/indiafoss/2026communi-con) lists 27 September 2026 in Hall 1. Checked 22 September 2026.

## Run

```sh
npm ci
npm run dev
```

Open the URLs printed by Vite:

- `/`: participant experience. Practice, listening, private ballot, and closing acknowledgement.
- `/stage`: projector view, QR code, and shared cursor artwork. No vote totals.
- `/admin`: co-chair interface preview, private sample results, timer, and walkthrough controls. No link to this route appears on the participant or stage page.

Start with `/admin`. Open the audience and stage links in separate tabs in the same browser. Click **Start sample talk**, then use **05:00 · Vote** and **08:00 · Wrap up** to preview the transitions. Try a ballot choice in the audience tab. The co-chair can then cue applause. **Reset demo** returns to practice and clears the local choice.

The timer runs while a co-chair tab is open. Same-origin tabs share local demo state. Where supported, a browser Web Lock ensures that only one co-chair tab advances the timer.

## Phone preview

Use the network URL printed by Vite from a phone on the same reachable network. Put that address in the co-chair page's **Participant demo URL** field to update the stage QR code. A phone cannot reach this computer through `localhost`.

Each device runs an independent simulation. To preview the ballot on a phone, open `/admin` in that phone's browser, advance to five minutes, and open `/` in another tab. This is only a prototype walkthrough; live attendees will not use the co-chair route.

## Scope and limits

- This is a static visual demo, not a live voting service. Cursor artwork and sample results are simulated.
- The sample talk is fictional. Timings and labels are proposals for organizer review.
- Feedback opens at five minutes. A co-chair can cue applause from eight minutes. Audience input alone does not trigger it. The sample talk stops at ten minutes.
- Only the co-chair UI displays totals. There is no authentication or data access control in this demo. Anyone who opens `/admin` can use its controls. Do not use it for a real event or private ballots.
- One browser profile represents one demo participant. This is not one-person-one-vote enforcement.
- No Cloudflare service is configured or deployed. The future live target is 500+ participants; event capacity is untested.
- Fonts load from Google Fonts, with system-font fallbacks. The remaining app assets are bundled locally.

For the proposed Cloudflare implementation, see [hosting research](docs/cloudflare-research.md). It recommends Workers static assets, PartyServer, Durable Objects, and PartySocket, subject to runtime and venue tests. Enforce co-chair authentication and authorization on the server, and send results only to authenticated co-chair connections.

For an alternate design exploration, paste the [Open Design prompt](docs/open-design-prompt.md) into the design tool.

## Validate

```sh
npm run check
npm run build
npm run preview
```

`build` runs the TypeScript check and creates `dist/`. It does not deploy anything.
