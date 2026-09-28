import { createFileRoute } from "@tanstack/react-router";
import {
  readBody,
  readRoom,
  removeRoom,
  roomResponse,
  submitPhotos,
} from "../lib/together/service.server";
export const Route = createFileRoute("/api/together/$roomId")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        roomResponse(request, (token) =>
          readRoom(params.roomId, token, new URL(request.url).searchParams.get("photos") === "1"),
        ),
      POST: ({ request, params }) =>
        roomResponse(request, async (token) =>
          submitPhotos(params.roomId, token, await readBody(request)),
        ),
      DELETE: ({ request, params }) =>
        roomResponse(request, (token) => removeRoom(params.roomId, token)),
    },
  },
});
