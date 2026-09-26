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

Start the app without the local explorer, then start a tunnel in a second terminal:

```sh
X_LOCAL_EXPLORER=false pnpm dev
cloudflared tunnel --no-autoupdate --url http://localhost:5173
```

The local explorer shows the local data. Do not expose it through a tunnel.

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
