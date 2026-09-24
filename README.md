# Communi-Con

Anonymous audience votes for community talks. The audience votes on phones. The co-chairs see the count and cue the applause.

## How it works

- Each talk has a clock. By default, a talk lasts 10 minutes, and voting opens at 05:00 for 5 minutes. A co-chair can change these values in **Timing**.
- A co-chair can also open the voting at any time with **Open voting now**.
- While voting is open, each phone can vote **Keep going** or **Wrap it up**. A phone can change its vote until voting closes.
- Only the co-chairs see the count. The phones and the stage screen do not show it.
- The first vote from each phone sends a 👍 or 👎 reaction to the phones and the stage screen. A person who counts the reactions can estimate the votes. Only the co-chairs see the totals.
- A co-chair can cue the applause at any time during a talk. All phones and the stage screen show the cue.

## Run the event

1. Open `/admin` on a phone. Enter the event passphrase. Tap **Create room**.
1. Tap **Open stage screen**. Show that screen on the projector between talks. It shows the QR code for the audience and the name of the next speaker.
1. Tap **Share co-chair link** to give control to the other co-chairs.
1. If necessary, change the values in **Timing** and tap **Save timing**. The values stay for the next talks.
1. For each talk:
   1. Type the name in **Next speaker**. Tap **Save name** to show it on the phones and the stage screen.
   1. Tap **Start talk** when the speaker starts.
   1. Tap **Cue applause** to end the talk.
   1. Tap **Next talk**. This clears the votes and the speaker name.

If you tap **Start talk** late, tap **+1 min** to correct the clock. To rehearse the phases, tap **Open voting now** or **+1 min**.

## Set the passphrase

Only a person with the event passphrase can create a room. Set the passphrase as a Worker secret:

```sh
pnpm exec wrangler secret put ADMIN_PASSPHRASE
```

You can also set it in the Cloudflare dashboard: **Workers & Pages** > **communi-con** > **Settings** > **Variables and Secrets**. Use the type **Secret**.

To change the passphrase for a new event, set a new value. Rooms that exist continue to work, and their co-chair links do not change. If the secret is not set, nobody can create a room.

## Develop

```sh
pnpm install
echo 'ADMIN_PASSPHRASE=<local passphrase>' > .dev.vars
pnpm dev
```

Open <http://localhost:8000/admin>. `pnpm dev` starts the Worker and the Durable Object on your computer, and rebuilds the frontend when a file changes.

To test on phones, start a tunnel in a second terminal:

```sh
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000
```

Do not add `--http-host-header localhost:8000`. It exposes the local Wrangler explorer through the tunnel.

## Deploy

Cloudflare Workers Builds deploys each push to `main`. Connect the repository once in the Cloudflare dashboard (**Workers & Pages** > **Create** > **Import a repository**) with these settings:

| Setting | Value |
| --- | --- |
| Project name | `communi-con` |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable | `PNPM_VERSION` = `12.4.1` |

The project name must match `name` in `wrangler.jsonc`. The build image installs pnpm 10 by default, and pnpm 10 cannot switch to the pnpm 12 in `packageManager`.

## Limits

- One browser is one participant. There is no ticket check.
- The passphrase controls who can create a room. The co-chair link controls who can run a room.
- The co-chair link gives full control. Do not show it on the projector.
