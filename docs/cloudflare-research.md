# Cloudflare feasibility research

Checked 2026-09-22. Future live-build target: 500+ concurrent participants in the organizer's Cloudflare account. The current scope is a visual demo with a simulated crowd. No backend runtime was tested.

## Documented capabilities

| Component | Evidence and implication |
| --- | --- |
| PartyServer | A library over Durable Objects. It supplies room routing, connection hooks, broadcasting, and opt-in hibernation. It uses Wrangler for platform configuration. Browser clients can use PartySocket. This supports an application managed directly in Cloudflare. [PartyServer README](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md) |
| PartyKit | Its default managed platform also supports own-account deployment, called cloud-prem. The guide was last updated on 2025-03-26; deployment was not probed. [PartyKit deployment guide](https://docs.partykit.io/guides/deploy-to-cloudflare/) |
| Workers static assets | A Worker can serve browser assets and dynamic routes in one project. Asset routing can run the Worker first for selected paths. Reserve the WebSocket and moderator API paths so a single-page fallback cannot consume them. The path recommendation is an inference from the routing rules. [Assets configuration](https://developers.cloudflare.com/workers/static-assets/binding/) |
| Durable Objects | A Worker routes requests to a Durable Object, which can coordinate a room's WebSocket clients. SQLite-backed objects are available on Workers Free and Paid plans. [Getting started](https://developers.cloudflare.com/durable-objects/get-started/), [plan support](https://developers.cloudflare.com/durable-objects/platform/limits/) |
| Hibernation | Idle objects can leave memory while client sockets remain connected. In-memory state is discarded. Persist important room state and restore per-connection state with attachments. Scheduled callbacks can prevent hibernation. [WebSocket lifecycle](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [hibernation conditions](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) |

## Reconnection needs application rules

PartySocket reconnects and buffers sends while disconnected. Its current upstream source defaults to an unlimited queue and flushes that queue before the application receives the `open` event. These are source observations, not a probe of a selected release. [PartySocket README](https://github.com/cloudflare/partykit/blob/main/packages/partysocket/README.md), [queue and reconnect implementation](https://github.com/cloudflare/partykit/blob/main/packages/partysocket/src/ws.ts)

Recommended protocol, inferred from that behavior:

- Set `maxEnqueuedMessages: 0` for transient gestures. Old cursor moves and applause must not replay after reconnection.
- Request a fresh room snapshot on connection. Keep controls disabled until it arrives.
- Include a round ID and action ID in consequential inputs. The server must check the active phase and deadline, reject stale rounds, and deduplicate retries.
- Show a vote as accepted only after the server acknowledges it. Do not treat an open socket or a successful client send as vote acceptance.
- Pin package releases during implementation and probe reconnect, replay, and duplicate handling with those releases.

## Capacity and fanout

The hibernation API permits 32,768 sockets per object, subject to workload CPU and memory constraints. An object is single-threaded; the FAQ gives a soft limit of 1,000 requests per second, dependent on work per request. These bounds do not guarantee audience capacity. [Socket bound](https://developers.cloudflare.com/durable-objects/api/state/#acceptwebsocket), [throughput guidance](https://developers.cloudflare.com/durable-objects/reference/faq/#how-much-work-can-a-single-durable-object-do)

Derived traffic model: if `N` phones each send `r` updates per second, ingress is `N × r`. Relaying each update to every other phone requires `N × r × (N − 1)` deliveries. Batching reduces message overhead, but full participant snapshots can still grow with the audience. Cloudflare recommends batching high-frequency WebSocket data. [Batching guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

Recommendation for 500+ phones: send rate-limited inputs and return aggregates and acknowledgements. Give the stage display bounded or sampled particles, animated locally from shared state. Keep practice rooms separate. Choose shards only after a representative load test.

## Proposed starting architecture

Recommendation, not an implementation decision:

`Phone / stage display / moderator → Worker + static assets → PartyServer room → SQLite-backed Durable Object storage`

Use PartySocket in the browser and one object per independent room initially. Persist rounds, phases, deadlines, moderator changes, and accepted ballots. Keep cursor position disposable. Proposed assumption: wrapup requires host approval enforced by the server. These components are documented above; event-scale performance is UNVERIFIED.

## Required evidence before the event

Cloudflare supplies Durable Object test examples. Chrome DevTools can emulate offline operation and throttle WebSockets. Use these for the proposed checks, then test at the venue. [Durable Object tests](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/), [WebSocket throttling](https://developer.chrome.com/docs/devtools/network/reference#throttle-websocket-connections)

- Protocol: simultaneous taps, duplicate actions, expired votes, a round change during disconnect, moderator authorization, and state restoration after restart/hibernation.
- Devices: iPhone Safari and Android Chrome; screen lock, background/foreground, refresh, weak links, and Wi-Fi/mobile-data switching. Confirm the visible accepted/rejected state after each case.
- Load: expected join burst, active input rate, stage feed, and simultaneous reconnects. Record join success, acknowledgement latency, disconnects, errors, CPU, and bytes sent.
- Venue: rehearse the QR-to-join flow on the actual attendee network, with representative devices and organizer controls. Agree on a manual stage fallback before live use.

UNVERIFIED: actual attendance, venue network behavior, latency, deployment, and event capacity. Unresolved: anonymous browser sessions or ticket-bound admission. The protocol must match that choice before ballots represent attendee votes.

## Cost boundary

Durable Objects bill compute and storage. Incoming WebSocket messages use a billing ratio; outgoing WebSocket messages have no request charge. Hibernation can reduce duration charges during idle periods. Free-plan operations can fail when a quota is exhausted. These facts do not establish this event's total cost. [Current pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Collect concurrent users, join/reconnect counts, input rate, session duration, active object time, and storage reads/writes before estimating cost. Include practice traffic and the front Worker. No event cost estimate was made.
