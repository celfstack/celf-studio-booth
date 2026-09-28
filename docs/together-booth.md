# Together, anywhere

## Product decision

Ship a turn-based long-distance booth first. Four photos per person become four
paired rows, with the creator on the left and their invitee on the right. Both
people can download the same base strip and decorate their own copy in the
existing editor. The solo booth remains available from the original homepage.

This format works across time zones and unreliable connections. It deliberately
does not promise a live call, synchronized shutters, or collaborative decoration.
Those need a separate media/signaling layer and are a later iteration.

## User flow

1. The homepage keeps its existing solo booth and adds “Together, anywhere”.
2. The creator adds a name and opens a private seven-day room.
3. Capture four portrait half-frames, or upload four photos. Each camera shot has
   a three-second countdown. Cancel, individual retakes, and camera-denied upload
   recovery are supported. Preview cropping and mirroring match the saved photos.
4. Review all four before explicitly sharing them. Photos stay on the device
   until this action; a submitted side is final.
5. Copy the invitation. A different private return link belongs to the creator.
   The last room is remembered in the browser when local storage is available.
6. The invitee sees the creator’s saved pose beside their own camera. They capture
   and review their four photos, then submit. Only the first submission is accepted.
7. Both people see the completed strip on their room page. “Develop our strip”
   sends four paired image sources into the original printing pipeline.
8. Existing filters, borders, loose-print layouts, paper backgrounds, stars, gems,
   lace, and portrait/story export continue to work on the combined images.

## Architecture

- UI: `/together` and `/together/$roomId` (TanStack Start file routes).
- API: `POST /api/together`; authenticated `GET`, `POST`, and `DELETE` at
  `/api/together/$roomId`. `?photos=1` retrieves image payloads.
- Production storage: Upstash Redis REST, using either
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` or Vercel Marketplace’s
  `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Credentials remain server-side.
- Development/test storage: SQLite at `.local/together.sqlite`, ignored by Git.
  Production and Vercel environments refuse a filesystem fallback.
- Room, creator contribution, and invitee contribution have the same absolute
  expiry. Redis expires them automatically after seven days.
- Atomic publishing checks room existence and prevents duplicate-side overwrite.
  A submission ID makes retrying the same upload safe.
- 128-bit random room IDs; separate 256-bit role capabilities. Stored credentials
  are hashes. Capabilities live in URL fragments and Authorization headers, not
  query strings. API replies are private/no-store. Room pages are noindex and
  excluded from Vercel Analytics.
- Server validates four JPEGs, bounded payloads, and exact 540 × 810 dimensions.
  Each paired row is 1080 × 810; the original strip export is 1200 × 3600.
- Anyone with an invite can view the submitted photos, fill the guest side once,
  or delete the shared booth. The UI explains link access before sharing.
- Creation and authenticated requests are rate-limited. Cross-origin API browser
  requests are rejected. No email/SMS is sent automatically.

## Running and checking

Use Node 24, then `pnpm install`, `pnpm dev --host 127.0.0.1 --port 3100`.
For shared links across devices, deploy with the Redis environment variables.
Localhost links are only usable on this computer.

- `pnpm exec tsx --test tests/together.test.ts`: auth, invalid input, idempotency,
  competing submits, expiration/deletion, body limits and production configuration.
- `pnpm exec playwright install chromium`
- With the dev server running: `pnpm exec playwright test`
- `pnpm build`: TypeScript check plus production build.

Browser tests use synthetic colored photos and a fake camera. They cover separate
browser contexts, mobile width, shared printing/export, the existing decoration
editor, camera cancel/retake, denied permission, and the original solo upload flow.
Real-device Safari camera behavior still benefits from a manual check.

## Follow-on live mode

Keep the same room identity, role capabilities, and final strip pipeline. Add a
proper WebRTC provider with TURN relay, scoped room join tokens, a presence layer,
ready states, and a synchronized capture event with clock-offset handling. Each
participant captures their own camera locally at full quality, then submits the
four stills through the existing contribution API. If a call disconnects, the
turn-based path remains available. Do not use serverless function memory as a
signaling server or advertise live mode before that flow is verified.
