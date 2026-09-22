# Open Design prompt

Design an interactive visual prototype for Communi-Con at IndiaFOSS 2026.

## Context

Communi-Con gives seven community-selected speakers ten minutes each. We want 500+ attendees to participate from their phones through a QR code or link. The experience should feel collective, playful, and easy to understand.

Combine multiplayer cursors with “Ask the Audience” from Who Wants to Be a Millionaire: everyone can contribute, but only the co-chairs see the voting results.

Create three distinct experiences.

## Participant: phone first

- Join from a QR code or short link, with minimal friction.
- Give each participant an anonymous cursor, dot, or small character.
- Include a short practice playground. Participants move or tap to bring their characters together and complete a simple collective action.
- Provide a large tap target. Dragging must be optional.
- During a talk, show the current talk and a quiet listening state.
- After five minutes, reveal a private ballot: “Keep going” and “Time to wrap up.”
- Let participants change their choice. Show their own selection.
- Do not show vote totals, percentages, other people's choices, or links to admin controls.
- Show an encouraging acknowledgement when the co-chairs cue closing applause.

## Shared stage screen

- Design for a large projector, readable from the back of a hall.
- Show the QR code and a short join link.
- Make collective participation visible through a crowd of cursors or another visual metaphor.
- Use the practice round to create a memorable shared moment.
- Keep visuals calm during the talk.
- Show a celebratory wrap-up effect only when the co-chairs trigger it.
- Do not reveal private voting results or identify individual voters.

## Private co-chair console

- Use a separate interface, intended only for authenticated co-chairs.
- Show the talk timer, participation count, and private vote distribution.
- Include start, pause, next-talk, and wrap-up controls.
- Audience feedback advises the hosts. It must not automatically end a talk.
- For this prototype, make a wrap-up cue available after eight minutes.
- Include separate demo controls to explore practice, listening, voting, and applause states.

## Visual direction

Explore a distinctive open-source festival identity: expressive typography, strong contrast, warm humor, and satisfying collective motion. Avoid a generic SaaS dashboard.

Suggest two or three visual metaphors before refining one. Examples: a cursor constellation, an applause wave, or a flock landing together. Keep the tone sporting and welcoming. Avoid public humiliation, elimination leaderboards, or hostile “kill” graphics.

## Prototype requirements

Use clearly labelled simulated participants and sample talk content. Make the principal interactions clickable. Include mobile, projector, and co-chair layouts, plus reconnecting and reduced-motion states.

This is a visual prototype for organizer discussion. Future hosting is planned on Cloudflare with PartyKit/PartyServer. No production backend or real authentication is required for this design exploration. Do not imply either exists.
