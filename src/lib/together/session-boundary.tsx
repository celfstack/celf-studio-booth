import { useEffect, useState, type ReactNode } from "react";
import {
  getSessionPhotos,
  getSessionStrip,
  getTogetherLink,
  setSessionPhotos,
  setSessionStrip,
} from "../strip/session";
import { renderStrip } from "../strip/render";
import { credentialsFromLink } from "./live-types";
import { combinePhotos, roomApi } from "./client";
import type { RoomPhotos } from "./types";
export function SharedSessionBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const credentials = credentialsFromLink(getTogetherLink());
      if (credentials && !getSessionPhotos().length) {
        try {
          const photos = await roomApi<RoomPhotos>(
            `/${credentials.id}?photos=1`,
            credentials.token,
          );
          if (photos.host.length !== 4 || photos.guest.length !== 4) {
            window.location.replace(getTogetherLink()!);
            return;
          }
          const paired = await combinePhotos(photos);
          if (cancelled) return;
          setSessionPhotos(paired);
          if (!getSessionStrip()) {
            const strip = await renderStrip(paired, "classic");
            if (cancelled) {
              URL.revokeObjectURL(strip.url);
              return;
            }
            setSessionStrip(strip);
          }
        } catch (e) {
          if (!cancelled)
            setError(e instanceof Error ? e.message : "Could not restore the shared strip.");
          return;
        }
      }
      if (!cancelled) setReady(true);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);
  if (error)
    return (
      <main className="together-page">
        <p role="alert">{error}</p>
        <a href={getTogetherLink() || "/"}>Return to your booth</a>
      </main>
    );
  return ready ? (
    children
  ) : (
    <p className="p-8 text-center" role="status">
      Opening your strip…
    </p>
  );
}
