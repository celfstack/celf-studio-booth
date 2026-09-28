import { createFileRoute } from "@tanstack/react-router";
import { readBody, roomResponse } from "../lib/together/service.server";
import { syncRoom, iceConfig } from "../lib/together/live.server";
export const Route = createFileRoute("/api/together/$roomId/sync")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        roomResponse(request, async (token) =>
          syncRoom(params.roomId, token, await readBody(request)),
        ),
      GET: ({ request, params }) =>
        roomResponse(request, (token) => iceConfig(params.roomId, token)),
    },
  },
});
