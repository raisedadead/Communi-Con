# Communi-Con

Anonymous audience votes for the Communi-Con talks at IndiaFOSS 2026. The audience votes on phones. The co-chairs see the count and cue the applause.

## How it works

- Each talk has a 10-minute clock.
- From 05:00, each phone can vote **Keep going** or **Wrap it up**. A phone can change its vote until 10:00.
- Only the co-chairs see the count. The phones and the stage screen do not show it.
- From 08:00, a co-chair can cue the applause. All phones and the stage screen show the cue.

## Run the event

1. Open `/admin` on a phone. Tap **Create room**.
1. Tap **Open stage screen**. Show that screen on the projector. It shows the QR code for the audience.
1. Tap **Share co-chair link** to give control to the other co-chairs.
1. For each talk, tap **Start talk** when the speaker starts. Tap **Cue applause** to end the talk. Tap **Back to lobby** before the next talk.

Use **Set the clock** to rehearse the phases or to correct a late start.

## Develop

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8000/admin>. `pnpm dev` builds the frontend and starts the Worker and the Durable Object on your computer.

## Deploy

```sh
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`. `pnpm deploy` is a different pnpm command.

## Limits

- One browser is one participant. There is no ticket check.
- The co-chair link gives full control. Do not show it on the projector.
