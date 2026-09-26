# Communi-Con

Anonymous live votes for community talks. The audience votes on phones. The co-chairs see the totals and cue the applause.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/raisedadead/Communi-Con)

![The stage screen during a talk: a QR code, the speaker name, and the talk clock](docs/screenshots/stage.webp)

## Screens

<table>
  <tr>
    <td><img src="docs/screenshots/phone-join.webp" alt="Enter the event code on a phone" width="200"></td>
    <td><img src="docs/screenshots/phone-vote.webp" alt="Vote Keep going or Wrap it up" width="200"></td>
    <td><img src="docs/screenshots/phone-applause.webp" alt="The applause cue on a phone" width="200"></td>
    <td><img src="docs/screenshots/phone-co-chair.webp" alt="The co-chair controls and the vote totals" width="200"></td>
  </tr>
  <tr>
    <td align="center">Join</td>
    <td align="center">Vote</td>
    <td align="center">Applause</td>
    <td align="center">Co-chair</td>
  </tr>
</table>

<table>
  <tr>
    <td><img src="docs/screenshots/landing.webp" alt="The home page with the event code entry"></td>
    <td><img src="docs/screenshots/stage-applause.webp" alt="The applause cue on the stage screen"></td>
  </tr>
  <tr>
    <td align="center">Home page</td>
    <td align="center">Applause on the stage screen</td>
  </tr>
</table>

## Deploy

1. Click **Deploy to Cloudflare**. Cloudflare copies this repository to your GitHub account and deploys it to your Cloudflare account.
1. Set `ADMIN_PASSPHRASE` when Cloudflare asks for it. Use a long random value. Co-chairs need it to create a room.
1. Open `https://<worker>.<subdomain>.workers.dev/admin`.

If the build fails at the install step, add the build variable `PNPM_VERSION` = `12.4.1` in **Settings** > **Build**, then retry the build.

To change the passphrase, set a new value for the `ADMIN_PASSPHRASE` secret in **Settings** > **Variables and Secrets**. Rooms that exist continue to work.

The app runs on the Workers Free plan. A large event can exceed the free daily limits. If that is a risk, use the Workers Paid plan.

## Run the event

1. Open `/admin` on a phone. Enter an event name (optional) and the passphrase. Tap **Create room**.
1. Open the stage link on the projector. It shows the QR code, the event code, and the next speaker.
1. Tap **Share co-chair link** to give control to the other co-chairs.
1. For each talk: type the speaker name, tap **Start talk**, then **Cue applause**, then **Next talk**.

A talk lasts 10 minutes. Voting opens at 05:00 for 5 minutes. Change these values in **Timing**, or tap **Open voting now**.

## Voting

- Each phone votes **Keep going** or **Wrap it up**, and can change the vote until voting closes.
- Only the co-chairs see the totals.
- The first vote from each phone shows a 👍 or 👎 reaction on the phones and the stage screen.

## Limits

- One browser is one participant. There is no ticket check.
- The co-chair link gives full control. Do not show it on the projector.
- A person who guesses an 8-digit room code can open its stage screen and vote.
- Each talk accepts votes from up to 2000 phones.
- Room creation allows 10 attempts per minute from one network address.

## Change the defaults

Fork the repository, edit the value, and deploy your fork.

| Default                               | File                                      |
| ------------------------------------- | ----------------------------------------- |
| Votes per talk: 2000                  | `src/worker/room.ts`, `voteLimit`         |
| Room creation attempts: 10 per minute | `wrangler.jsonc`, `ratelimits`            |
| Talk length and voting window         | `src/shared/session.ts`, `initialSession` |
| Participant cookie life: 1 day        | `src/worker/http.ts`, `setCookie`         |

## Tech stack

React and Vite on the phones. Cloudflare Workers, Durable Objects, and [PartyServer](https://github.com/cloudflare/partykit) on the server. TypeScript, Vitest, oxlint, and pnpm for the tooling.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
