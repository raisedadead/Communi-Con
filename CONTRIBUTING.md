# Contributing

## Set up

You need Node.js 24 and pnpm 12.

```sh
pnpm install
cp .dev.vars.example .dev.vars
```

Write a local passphrase in `.dev.vars`. Then start the app:

```sh
pnpm dev
```

Open <http://localhost:5173/admin>. `pnpm dev` runs the Worker and the Durable Object on your computer, and reloads the page when a file changes.

## Test on phones

Use a Cloudflare quick tunnel. It needs no Cloudflare account. The rooms stay in the local Durable Object storage in `.wrangler/state`, so no remote database is necessary.

1. Install `cloudflared`. On macOS: `brew install cloudflared`. For other systems, see the [downloads page](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
1. In the first terminal, start the app without the local explorer:

   ```sh
   X_LOCAL_EXPLORER=false pnpm dev
   ```

1. In the second terminal, start the tunnel:

   ```sh
   cloudflared tunnel --no-autoupdate --url http://localhost:5173
   ```

1. Open the `https://<name>.trycloudflare.com` address from the tunnel output on your phones. Open `/admin` on that address to create a room.

Do not add `--http-host-header` to the tunnel command. The Worker accepts a room request or a live connection only when the browser address and the request address are the same. The local explorer shows the local data, so do not expose it through a tunnel.

## Check a change

```sh
pnpm lint
pnpm test
pnpm build
```

`pnpm format` fixes the formatting. CI runs the same checks on each pull request.

## Layout

| Path         | Contents                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `src/client` | React app: `screens/`, `components/`, `room/` (socket state), `styles/` |
| `src/shared` | Session rules and the wire protocol, used by both sides                 |
| `src/worker` | Worker routes (`index.ts`), the room Durable Object, auth               |

## Rules

- Keep the wire protocol and the Durable Object storage compatible. Rooms that exist must keep working.
- Add a test for a change in `src/shared` or `src/worker`.
- Use plain CSS. Put a rule in the file for its screen.
- Write commit subjects as `type(scope): subject`, for example `fix(stage): align the QR code`.

## Deploy from your computer

```sh
pnpm build
pnpm run deploy
```

`pnpm run deploy` uploads the output of `pnpm build`. Run the build first.
