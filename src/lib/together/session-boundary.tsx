import { useEffect, useState, type ReactNode } from "react";
import {
  getSessionPhotos,
  getSessionStrip,
  getTogetherLink,
  getTogetherRound,
  setTogetherRound,
  resetSession,
  setSessionPhotos,
  setSessionStrip,
} from "../strip/session";
import { renderStrip } from "../strip/render";
import { credentialsFromLink } from "./live-types";
import { combinePhotos, roomApi } from "./client";
import type { RoomPhotos, RoomView } from "./types";
import { startVisiblePolling } from "./poll";
export function SharedSessionBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let polling: ReturnType<typeof startVisiblePolling> | undefined;
    const returnToBooth = (link: string) => {
      if (cancelled) return;
      resetSession();
      window.location.replace(link);
    };
    const restore = async () => {
      const credentials = credentialsFromLink(getTogetherLink());
      if (credentials) {
        try {
          const link = getTogetherLink()!;
          const room = await roomApi<RoomView>(`/${credentials.id}`, credentials.token);
          if (cancelled) return;
          const previousRound = getTogetherRound();
          if (
            !room.host ||
            !room.guest ||
            (previousRound !== null && previousRound !== room.round)
          ) {
            returnToBooth(link);
            return;
          }
          setTogetherRound(room.round);
          const watch = async () => {
            const latest = await roomApi<RoomView>(`/${credentials.id}`, credentials.token);
            if (!cancelled && latest.round !== room.round) {
              returnToBooth(link);
              polling?.stop();
            }
          };
          polling = startVisiblePolling(watch, { interval: () => 5000, immediate: false });
          if (!getSessionPhotos().length) {
            const photos = await roomApi<RoomPhotos>(
              `/${credentials.id}?photos=1`,
              credentials.token,
            );
            if (photos.host.length !== 4 || photos.guest.length !== 4) {
              returnToBooth(link);
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
      polling?.stop();
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
