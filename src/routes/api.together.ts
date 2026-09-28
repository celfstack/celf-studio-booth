import { createFileRoute } from "@tanstack/react-router";
import { createRoom, readBody, roomResponse } from "../lib/together/service.server";
export const Route = createFileRoute("/api/together")({
  server: {
    handlers: {
      POST: ({ request }) =>
        roomResponse(request, async () =>
          createRoom(
            await readBody(request),
            process.env.VERCEL
              ? request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"
              : "local",
          ),
        ),
    },
  },
});
