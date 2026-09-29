# Together in Celf Studio

## Experience

The homepage has lowercase just me / together buttons and the original click to step in action. Together creates a private room immediately. `/together` redirects back
to the homepage with Together selected; there is no separate landing or name gate.
The original solo camera, printing, backgrounds, filters and decoration tools remain.

The shared camera uses the Solo booth’s dark background, cream faceplate,
Look here / Smile sign, four photo slots, star shutter and flash control. A compact
row above it contains an optional nickname and Copy invite button; full invitation
URLs and the previous introductory/status copy are not displayed. The camera opens
automatically on entry, with manual retry if access is denied. The creator
is the left half; the invitee is the right. Both can enable their cameras and see
one another live (video only). Each presses Ready, then either starts the shared
four-photo countdown. Either can cancel. Each reviews and saves their own half;
individual retakes and uploads remain available. If someone is away, either side
can save first and use the same invitation for the other to finish later.

Once both halves are saved, both devices automatically open the existing strip
developing screen. Returning through the invitation also goes straight there.
The explicit “back to our booth” action reopens the camera with saved thumbnails and the invite button. The old return-link/privacy panel has been removed. From the print, both can open the
existing decoration editor.
Canvas, layout, border, effect, paper and individual stars/gems/prints are shared.
Named cursors show where the other person is working. Each device can download;
refreshing restores the paired photos and saved decoration state. The editor
shows saving/reconnection status and warns before leaving with unsaved changes.
Undo reverses this person's changes only when the partner hasn't subsequently
changed that same item. Simultaneous changes to different objects are preserved;
conflicting changes to the same object use the last accepted server update.

## Architecture

TanStack Start + React; server routes under `/api/together`.

- `POST /api/together`: create room (name optional).
- `GET/POST/DELETE /api/together/$roomId`: status, immutable contribution, deletion.
  `?photos=1` loads the four half-frames for each side.
- `POST /api/together/$roomId/sync`: authenticated presence, WebRTC signaling,
  atomic countdown scheduling and per-field/per-entity decoration patches.
- `GET /api/together/$roomId/sync`: short-lived ICE server configuration.

Live video uses peer-to-peer WebRTC, a host-offer/guest-answer exchange, a negotiated
video transceiver and a data channel for fast cursor movement. Server polling
(1.2 seconds between completed requests) handles signaling, presence, durable
edits and fallback cursors. Peers are recreated when the other tab's instance
changes; Retry live reconnects after failure. Video tracks stop on leaving or
hiding the capture page. Photos are persisted only when Save my half is pressed.

Countdown creation is atomic and requires two recent, connected, ready cameras.
It schedules the first shutter five seconds ahead; both devices estimate server
clock offset and use absolute deadlines for all four frames, 3.7 seconds apart.
A missed deadline cancels rather than silently filling mismatched poses. Browser
scheduling/network jitter can still produce small differences; this is not
hardware-synchronized capture.

Production uses Upstash Redis REST (`UPSTASH_REDIS_REST_URL/TOKEN` or
`KV_REST_API_URL/TOKEN`). Lua transactions merge collaboration fields and publish
contributions atomically. Local development uses `.local/together.sqlite` with
transactions. Production refuses the local fallback. All records expire after
seven days, and either participant can delete them. Live presence is treated as
offline after 6.5 seconds without an update.

Room IDs are 128 random bits; role capabilities are 256 bits, held in URL fragments
and Authorization headers. Stored capabilities are hashed. Never log or include
capability links in analytics. API replies are private/no-store; room pages are
noindex. Role-based validation, rate limits, body limits, JPEG dimensions and
bounded editor patches are enforced. Anyone with a guest link can join that
side, see saved photos and delete the room; share invitations privately.

## Deployment requirements

1. Link Vercel project `celf-studio-booth` in team `celfstudio`.
2. Upstash Redis resource celf-together is connected to production, preview and development. The Free plan was selected with automatic upgrades disabled; KV_REST_API_URL/TOKEN are provisioned by Vercel.
3. Set server-only `TURN_KEY_ID` and `TURN_API_TOKEN` for a Cloudflare Realtime TURN
   key. The API issues one-hour relay credentials. Without these, STUN can connect
   compatible networks, but restrictive networks may need the turn-taking flow.
4. Deploy, then verify the real invite on two devices on separate networks,
   including a TURN-relayed connection. Localhost invites only work on one machine.

Vercel is linked/authenticated and the storage terms are accepted. Production Redis was verified with both contributions, shared edits, an atomic countdown, and cleanup. TURN relay credentials remain unconfigured; direct STUN connections and asynchronous contributions are available.
Cloudflare reference: https://developers.cloudflare.com/realtime/turn/generate-credentials/

## Verification

Node 24. `pnpm test:together`, `pnpm exec playwright test`, `pnpm build`.
Browser tests use two independent contexts, simulated cameras and generated photos.
They cover live previews/countdown/cancel, guest-first submission, asynchronous
joining, shared decorations/cursors, refresh, both downloads, privacy/deletion,
solo regression, retakes and denied-camera upload recovery. Hardware cameras and
cross-network relay behavior still need a deployed smoke test.

Latest verification: seven server tests passed; all four browser flows passed
across the final focused runs, including independent object dragging, late camera
activation, guest refresh/reconnection and returning to Solo with a prior shared
session. TypeScript and the production build passed. Targeted lint has no errors
and one pre-existing `stripRenderRevision` hook-dependency warning in the editor.

## Strip-only canvas export

The decoration editor offers Just the strip alongside Portrait and Story. It hides paper and layout controls, renders the existing strip upright at 1200 × 3600 before decorations, and exports a PNG with transparent margins trimmed. Frames, filters, lace, stars and gems remain available; the checkerboard is preview-only. Canvas edits retain their choices when switching back to Portrait or Story. The format choice is accepted by the shared editor so both participants can use it. Save renders on a separate canvas to keep selection handles out of downloads. The mobile header keeps Back, Undo and Save on one line.

Verified with a browser test that decodes downloaded PNGs (plain strip, transparent decorated strip, and opaque portrait), seven server tests including shared format persistence, TypeScript, build, and mobile/desktop visual checks.

## Returning to a completed booth

Explicit back-to-booth links now show the same camera interface even after a contribution has been saved. The saved photo thumbnails and Return to our strip action remain available. The star becomes Take another strip, which creates a fresh booth and invitation while preserving the previous room/photos/decorations. Saved contributions cannot be accidentally resubmitted or overwritten; shared countdown events are ignored in the completed camera view. The fresh booth starts with the usual empty capture slots. Verified in the complete two-browser create/join/decorate/download flow, including camera return, reopening the existing strip, starting another booth, and recovering the untouched original. TypeScript, targeted lint and production build passed.

Release verification: all 13 browser tests, all 7 server tests and the production build passed. GitHub feature branch pushed; release published through main after production storage verification.
