# LEVEL 38 — Phase 5.0 Party Presence + OBS Overlay

Implemented locally against deployed/reviewed Phase 3.9. No commit, push, deployment, production migration/backfill, Twitch enablement, player embed or quest-content change was performed in this phase.

## 1. Presence architecture

The existing `/level38` application remains responsible for authenticated participant sessions and gameplay. A separate Socket.IO namespace, `/level38-party`, carries presentation-only party events over the existing `/level38/socket.io` transport path. The public page opens a dedicated viewer WebSocket after its HTTP session has resolved, so even a first-time visitor's newly issued HttpOnly cookie is present in the handshake. The normal gameplay socket is independent.

`MemoryPartyPresence` implements the `PresenceStore` abstraction. It keeps participant-to-connection membership, last heartbeat, expiry, grace deadlines and ephemeral public IDs in memory. `PartyRuntime` bridges authenticated socket registration, committed domain events and the store. No presence heartbeat, coordinate, lane, speed, animation phase or reaction state is written to PostgreSQL.

## 2. Single-instance limitation

This version requires the existing single Node instance. Multiple replicas would each maintain a different crowd; a Socket.IO Redis adapter alone would not make the presence records atomic. Before horizontal scaling, replace `PresenceStore` with shared membership/expiry storage, preserve atomic per-participant lifecycle and FIFO ordering, and coordinate broadcasts across instances. No infrastructure or instance configuration changed here.

## 3. Participant stream visibility

`Participant.streamVisible` is persistent, non-null and defaults to true for existing and new rows. Only a joined participant with a nickname, class and valid session can appear. Anonymous/unassigned visitors never appear, regardless of the default preference. Missing variant artwork uses the existing fallback; identity is never reassigned by presence.

The identity card adds **Aparecer en el stream / Appear on stream**, with a short explanation that the nickname and character may appear in Leo's stream while the page is open. `POST /level38/api/stream-visibility` accepts only a boolean and uses the authenticated session cookie, existing Origin/CSRF protection and a rate limit. It updates only `streamVisible`.

Opting out immediately removes the presentation from every overlay while leaving sockets, voting and the stored class/variant/nickname/session intact. Opting in restores the stored appearance. Other tabs receive the saved preference through the existing periodic session refresh; actual overlay removal is immediate.

## 4. Public presence privacy

Every visible lifecycle receives a random UUID `presenceId`, unrelated to the database ID or session token. Normal member payloads contain exactly:

```json
{"presenceId":"ephemeral UUID","nickname":"Garnet","classId":"thief","variantId":"krile"}
```

The public overlay can be read without an operator login. Opted-in presentation names/art are public; OFF nickname mode hides labels visually, whereas participant `streamVisible=false` removes the presence itself. No Participant ID, token/hash, cookie, IP, operator credential, personal vote history or internal membership timestamp is sent through this channel. The existing public gameplay feed is not forwarded to overlays.

## 5. Socket protocol

| Direction/event | Meaning |
| --- | --- |
| Viewer → `party:register` | Resolve the existing session cookie on the server; ignore all client identity fields |
| Viewer → `party:heartbeat` | Refresh only an in-memory connection clock; ack indicates whether registration remains valid |
| Viewer → `party:leave` | Best-effort pagehide notification; starts grace when the last connection leaves |
| Server → `party:snapshot` | Ordered safe members and `{enabled,nameMode,maxVisible}` after an overlay connects |
| Server → `party:joined` | One newly visible member |
| Server → `party:updated` | Same presence ID with changed presentation, normally nickname |
| Server → `party:left` | `{presenceId}` only |
| Server → `party:action` | Targeted `{presenceId,action:"vote"}` or all-party `{action:"quest"}` |
| Server → `party:config` | Persisted, validated presentation configuration |
| Server → `level38:unlocked` | The existing genuine unlock event, forwarded without a second progress state machine |

Overlay connections have no handlers for registering members or issuing reactions/administrative commands. Sending a fabricated join/action to the namespace cannot publish it to others. Viewer registration requires the configured Origin and cookie authentication; identities supplied in handshake/event bodies are ignored. Registration is throttled and permits only one in-flight lookup per socket. Heartbeats never perform database writes.

## 6. Multiple tabs

The store keys internal membership by the authenticated participant, with a connection map underneath. Two or more tabs produce one public avatar. Closing one connection does not remove an avatar while another remains live. A visibility change applies to that participant across all tabs, rather than only to the tab making the request.

## 7. Grace, reconnect and restart

The viewer sends a heartbeat every 20 seconds. Last-connection disconnect/pagehide starts a 45-second grace period, preserving the same presence ID during refresh/reconnect. A 5-second sweeper removes elapsed grace entries; a completely silent connection expires after 60 seconds without a heartbeat. Session expiry is also checked in memory. Page unload delivery is an optimization, not the correctness mechanism.

A fully ended lifecycle can return with a new presence ID but the same persisted appearance. Nickname changes keep the same presence ID. Intentional opt-out ends visible membership immediately; opting in begins a new visible lifecycle. A Node restart begins with an empty store, and viewer Socket.IO reconnect/registration repopulates it. Restart tests verify stored identity and configuration survive; positions are intentionally not recovered.

## 8. Overlay route

`GET /level38/overlay/party` renders a transparent, read-only page with no navigation, account controls, game panels or scrollbars. All CSS, scripts, fonts, manifest and PNGs are local. External blocking styles establish transparency before the document paints; manifest/network failure leaves the page empty rather than placing an error banner over gameplay.

Default future production URL:

`https://leonifelheim.tv/level38/overlay/party`

No query parameters are needed. Arbitrary scale, CSS or path query parameters are not interpreted. The only supported parameter is the separately authorized owner preview count.

## 9. Movement algorithm

One RAF loop advances runtime-only positions with capped frame delta. Per-presence seeded phases, initial direction, 18–32 rendered px/s speeds, walk/pause durations and occasional direction changes keep the crowd independent. Typical motion is close to the audited 24 px/s. Avatars turn at the left/right bounds and pause briefly when the next step would crowd another avatar. No physics engine, travel persistence or framework was added.

Coordinates are rounded to rendered pixels. Source-left movement uses the original orientation; source-right movement requests the shared renderer's cosmetic horizontal mirror. No combat-handedness claim is attached to that mirror.

## 10. Lanes, spacing and overflow

Up to 15 displayed avatars use one shallow lane. Larger crowds use two, with 86 rendered pixels between foot baselines. The lower baseline sits 32 pixels above the Browser Source bottom. The normalized anchor `(8,24)` at 2× determines each sprite's position. The source remains a 32×48 canvas, including the audited shorter appearances' transparent top padding.

New arrivals occupy the largest available horizontal gap. Crossing the lane threshold redistributes the crowd across lanes; viewport resize preserves proportional horizontal position and resolves spacing. Nearest-neighbor avoidance and capped name widths keep labels from forming a solid overlapping row. Very long visual labels ellipsize; stored nicknames are unchanged.

Visible selection is FIFO by the start of a visible presence lifecycle. The first configured N members remain selected until they leave/opt out or an operator changes the cap. Heartbeats and nickname updates never shuffle selection. Everyone else remains online in memory and can be promoted when a slot opens. Default cap is 30; moderator range is 1–50. An excess count appears as `+5 PARTY MEMBERS`. Global disable retains membership but renders zero avatars.

## 11. Nickname modes

- **ENTRY**, default: show on entry for five seconds, then fade; show briefly again for an individual reaction or victory.
- **ALWAYS**: keep the safely rendered nickname label visible.
- **OFF**: no visible nickname labels.

Labels use `textContent`, with overflow clipping/ellipsis rather than HTML or nickname rewriting. Permanent class-name labels are absent from the overlay. The lower-area default keeps the rest of the stream transparent.

## 12. Vote reaction

After `Level38Service.vote` succeeds, the controller asks presence for the authenticated participant's public presence ID. Only that ID and action `vote` are broadcast. The targeted avatar makes a 350 ms, 12-pixel transform hop using existing frames, with its name briefly visible. Anonymous, offline or opted-out participants have no target. Normal public poll payloads remain unchanged.

## 13. Quest and finale reactions

Only committed `quest:completed` notifications trigger all-party celebration: the existing two-frame, 250 ms/frame, three-cycle sequence, then walking/idle resumes. A genuine unlock forwards the existing `level38:unlocked` event and suppresses the redundant quest reaction for that same commit. The overlay deduplicates that event ID.

Owner fireworks preview events do not trigger the real party or change progress. Public-page fireworks code/lifecycle is unchanged. No past vote or reaction history is replayed on a newly connected overlay; its initial entry sequence is presentation only.

## 14. Moderator controls

Both MODERATOR and OWNER get a Party Overlay section on `/level38/control`: global enable checkbox, OFF/ENTRY/ALWAYS selector and visible limit 1–50. Counts show online eligible presences, selected/rendered count and overflow; they update from the presentation channel, including arrivals/leaves without a gameplay revision.

`POST /level38/api/control/party` uses existing operator authentication, Origin/CSRF validation, rate limiting, optimistic control revision, event-row transaction and audit history. Configuration creates a `party:configured` audit entry with before/after settings. It follows the existing non-reversible configuration-action policy. Invalid modes, non-boolean flags, fractional/out-of-range limits and unauthorized callers are rejected.

## 15. Reset integration

The committed `owner:participants` and `owner:prepare` notifications clear live membership and invalidate pending registration/identity reads, preventing reset participants from reappearing as ghosts. Their existing database cleanup preserves vote foreign keys/history as before. `owner:progress` does not remove anyone from presence. No reset or reseed was run against production.

## 16. Shared sprite renderer reuse

The overlay fetches the unchanged Phase 3.9 manifest (`level38-sprites-3.9.0`) and calls `Level38Sprites.resolve`. The shared `render` now supports `{externalClock:true}` and returns `paint(action, elapsed, mirrored)` / `dispose()`. That reuses the same DOM image/fallback logic and `frameAt`, without starting one timer per avatar. The website's original internally timed usage remains supported and regression-tested.

Frame arrays, Thief Faris/Krile source-backed assembly, anchor, scale, mirror policy and fallback paths remain centralized. No sprite asset, class assignment or variant assignment was changed. A failed asset uses the existing owned placeholder and keeps the participant's identifiers intact.

## 17. Performance and cleanup

The overlay uses one RAF scheduler, cached viewport dimensions, no per-frame layout reads, small 16×24 PNGs and transform position updates. Pairwise avoidance is bounded by the operator cap of 50. Reaction clocks and name visibility are fields in the main loop, not per-avatar intervals/timeouts. Empty/global-disabled overlays stop RAF. Disconnect hides the stage, stops RAF and disposes sprite instances; a fresh snapshot recreates image resources while retaining avatar positions and entry clocks. This also recovers images whose requests failed while offline. Visibility changes cannot restart animation before a connected snapshot. Hidden documents stop animation, and reduced-motion environments use idle with no wandering/hop.

Leaving removes DOM, label and renderer state. Destroy/pagehide cancels RAF, disposes all sprite instances, removes listeners and disconnects the presentation socket. Back/forward-cache restoration reloads the overlay cleanly. Viewer pagehide similarly clears its single heartbeat timer and socket. Movement never migrates into PostgreSQL.

Measured in installed Chrome **152.0.7977.84**, headless on the local Windows machine, with 30 continuously rendered avatars and normal motion:

| Measurement | Final run |
| --- | --- |
| Continuous stress duration | 180.4 seconds; 18 samples |
| Animation callbacks | 10,813; one pending application RAF throughout |
| Frame interval | p95 16.9 ms; maximum 20.5 ms |
| Long tasks (50 ms or longer) | 0 |
| Document elements | 192 at every sample |
| CDP DOM nodes, including non-element nodes | 268 before / 268 after garbage collection |
| CDP event listeners | 83 before / 83 after |
| Retained JS heap after garbage collection | 2,118,172 → 2,230,252 bytes; +112,080 bytes |
| Page errors / CSP violations | 0 / 0 |

The heap figures include the QA recorder's retained frame-interval array; this finite run does not establish an indefinite absence of memory leaks. There was no observed node/listener accumulation or large animation stall. Repeated disconnect/reconnect checks also verified zero pending RAF while disconnected and one after restoration. Final capture confirms loaded sprite images after those reconnects. Screenshots briefly pause only the application animation callback so independently changing image loads can settle; the three-minute measurement runs continuously. These are Chrome measurements, **not OBS FPS claims**.

## 18. OBS setup

After a separately approved deployment, add a normal **Browser Source** above gameplay in the OBS Sources list. No custom plugin is needed.

| Setting | Recommended value |
| --- | --- |
| Local file | Off |
| URL | `https://leonifelheim.tv/level38/overlay/party` |
| Width / Height | 1920 / 1080; 1280 / 720 is also tested |
| Custom frame rate | Start at 60; actual OBS performance must be checked on Leo's machine |
| Custom CSS | None required; this page supplies transparency itself |
| Transform | Native Browser Source dimensions; avoid stretching/scaling the whole source |
| Refresh when scene becomes active | Off for continuity; manual refresh is safe |
| Shutdown source when not visible | Off for continuity, or On to unload unused browser resources |

OBS documents that shutdown unloads an invisible source, and scene-active refresh reloads its page. Those properties are described in the [official Browser Source documentation](https://obsproject.com/kb/browser-source). For this implementation, unloading the OBS source does not remove viewers: their `/level38` tabs own presence. Reloading fetches a fresh snapshot and new local positions; a live socket reconnect retains existing avatar state where the same presence IDs survive.

Test before streaming: sign in as OWNER in an ordinary browser, open the 1/5/15/30 preview links in Party Overlay controls, try vote/victory preview buttons, then check the normal source in OBS's preview with your own opted-in viewer tab. Toggle visibility, refresh that tab and the Browser Source, and confirm the nickname/appearance stays consistent. Opt out afterward if desired. Owner previews require an owner cookie and are not intended as the public OBS URL. No elevated OBS permissions or operator key in a URL is needed.

## 19. Automated tests

- Build and `npm test`: 35 passing unit tests, including deterministic multi-tab/grace/stale/expiry/privacy/ordering checks and external-clock sprite reuse.
- Full PostgreSQL integration suite ran serially: 47 passing tests at that run. A later targeted serial run passed seven party/readiness tests, adding the real process-restart case (48 integration tests now exist).
- Upgrade test applies all pre-5.0 migrations to a new isolated schema, inserts legacy identities, checks readiness is unavailable, deploys the additive migration, then checks unchanged legacy columns, true visibility/default settings, healthy readiness and idempotent migration deployment.
- Existing browser suites: original, Phase 3.6, 3.7, 3.8, 3.9 and existing Twitch mock all pass. Mock Twitch tests do not enable live Twitch or change its configuration.
- Both new Chrome tests pass. The main case covers live cookies, actual page join/toggle, multiple tabs, refresh, 1/5/15/30 crowds at both target dimensions, 35-member overflow, safe nickname rendering, ENTRY/ALWAYS/OFF, hide/show, real vote hop, real quest celebration, repeated disconnect/reconnect, owner-only isolated previews, reduced motion and ES/EN public/control UI.
- A focused Chrome case checks blocked-PNG fallback without identity changes, image recovery on reconnect, no RAF restart from disconnected visibility events, and the genuine durable finale reaction.
- JavaScript syntax checks pass for all 12 new/modified JS/CJS files. `git diff --check` and a whitespace check including untracked files pass. Final diff review found only the intended Phase 5 changes; assets, quest content, environment and production configuration are unchanged.

Logs and screenshots are ignored under `dist/phase50-*`; no test fixtures, credentials or screenshot collection is part of production runtime assets.

## 20. Browser QA

Real installed Chrome renders 1920×1080 and 1280×720 crowds of 1, 5, 15 and 30. The 35-member case keeps 30 stable avatars and shows `+5 PARTY MEMBERS`. Captures and assertions check transparent computed backgrounds, 16×24 native PNGs rendered at 32×48, pixelated sampling, in-bounds sprites, independent phases, both facing directions, and no document overflow. Representative captures include Faris Thief, Krile Thief and Cid; the unchanged asset validator also checks their audited dimensions/padding.

Visual inspection found and corrected right-edge crowd clustering by changing arrival placement and viewport scaling. Repeated offline QA also exposed image resources that could remain failed after reconnection; snapshot recovery now recreates those resources without respawning avatars. The final captures distribute characters over shallow lanes, retain the shared foot baseline, and limit labels cleanly. Screenshots for the visibility explanation and controls were inspected in ES/EN at phone and desktop sizes. The test verifies literal markup-like nickname text never creates HTML elements.

Artifacts: `dist/phase50-visual-qa/`, with `results.json`, all crowd sizes, vote/quest reactions, owner previews, bilingual UI and the final stress capture. Screenshot transparency is encoded in PNG alpha; a viewer may display that transparent area against black. **This is Chrome QA, not actual OBS/CEF testing or a guaranteed OBS FPS result.**

## 21. Additive migration

`prisma/migrations/202609150009_level38_party_presence/migration.sql` adds:

- `Participant.streamVisible BOOLEAN NOT NULL DEFAULT true`.
- `Event.partyEnabled BOOLEAN NOT NULL DEFAULT true`.
- `Event.partyNameMode TEXT NOT NULL DEFAULT 'ENTRY'`, checked against OFF/ENTRY/ALWAYS.
- `Event.partyMaxVisible INTEGER NOT NULL DEFAULT 30`, checked from 1 to 50.

It does not change existing classes, variants, nicknames, sessions, votes, quest content or progress. No presence table or continuous heartbeat writes were introduced. The default makes the new overlay available without a separate enablement flag; an operator can hide it globally using the audited control. Readiness now probes the required event and participant columns so a missing migration cannot be mistaken for a healthy release.

## 22. Exact future production rollout

This is documentation only; none of these production actions was performed.

1. Review this local change, then separately authorize its commit/push/deployment.
2. Use the existing single-instance deployment configuration and existing database connection; keep Twitch disabled and leave quest content unchanged.
3. Build the approved revision with `npm ci --include=dev && npm run build`.
4. Before the new application starts, apply the existing pre-deploy command: `npm run db:migrate` (Prisma migrate deploy). It must include migration `202609150009_level38_party_presence`. Do not use migrate reset/dev/db push.
5. Start the new application with `npm start`; confirm `/healthz` is healthy and `npm run db:status` reports current migrations.
6. Open `/level38/control`, verify Party Overlay settings/counts and try the isolated OWNER preview. No reseed, participant reset, key rotation or variant backfill is needed for this phase.
7. Join from an ordinary browser, verify ES/EN opt-out/in, refresh and a second tab. Open the public overlay and confirm one avatar with the stored identity.
8. Add the OBS Browser Source using the settings above, test it in preview, then choose the desired global enabled/name/cap settings through normal audited controls.

The migration itself establishes the preference/configuration defaults. No production participant backfill command is necessary. Existing Phase 3.9 `classId`/`variantId` values remain authoritative.

## 23. Remaining limitations

- Single Node instance only until shared presence and cross-instance socket delivery are implemented together.
- Physical OBS, its CEF renderer, scene switching on Leo's actual setup, and physical mobile browsers were not available for testing. Chrome viewport tests do not establish OBS FPS.
- A reconnect within grace retains identity; a complete process/source restart can redistribute local positions and replay entry presentation. No attempt is made to persist movement.
- Grace counts can include a recently disconnected viewer for roughly 45–50 seconds; browsers that suspend heartbeats may temporarily leave and re-register. The public page requires a working WebSocket for party presence; its normal gameplay connection remains independent.
- Movement uses lightweight avoidance; dense crowds may pause/turn often. The optional 50 cap is safety-bounded, while stress QA targets the requested 30. Labels are deliberately shortened visually when crowded.
- Owner preview labels are simple debugging labels; preview mode is isolated and cannot create live presences. No public demo injection endpoint exists.
- Asset permission status remains the previously documented UNKNOWN. This phase reuses approved local Phase 3.9 assets and makes no new legal claim.
- No Twitch player embed, chat-driven actions, player-controlled movement or physics engine was added.

## 24. Files added/modified

Added:

- `prisma/migrations/202609150009_level38_party_presence/migration.sql`
- `src/modules/level38/party-presence.ts`
- `src/modules/level38/party-runtime.ts`
- `src/views/level38/party-overlay.ejs`
- `src/views/level38/party-controls.ejs`
- `public/css/level38-party.css`
- `public/js/level38/party-overlay.js`
- `public/js/level38/party-viewer.js`
- `public/js/level38/party-control.js`
- `tests/level38-party.test.cjs`
- `tests/integration/party.test.cjs`
- `tests/visual/level38-phase50.cjs`
- `docs/level38-phase50-party-overlay.md`

Modified:

- `prisma/schema.prisma`
- `src/modules/level38/{index,controller,routes,service,state}.ts`
- `src/views/level38/{index,control}.ejs`
- `public/css/level38.css`
- `public/js/level38/{sprites,public,control,common,translations}.js`
- `tests/integration/phase3.test.cjs` (session DTO assertion now includes `streamVisible`)

No sprite PNG/manifest, quest-content file, dependency/lockfile, environment file, production configuration or Twitch implementation file changed.
