// In-memory, client-only session shared between the booth page (capture)
// and the print page (develop + download). Nothing is persisted or uploaded;
// a page refresh simply starts a fresh session.

export interface StripResult {
  url: string;
  blob: Blob;
  border?: "classic" | "thick" | "none";
}

interface BoothSession {
  photos: Array<ImageBitmap | HTMLImageElement>;
  strip: StripResult | null;
}

const session: BoothSession = { photos: [], strip: null };

export function setSessionPhotos(
  photos: Array<ImageBitmap | HTMLImageElement>,
) {
  session.photos = photos;
}

export function getSessionPhotos(): Array<ImageBitmap | HTMLImageElement> {
  return session.photos;
}

export function setSessionStrip(strip: StripResult) {
  if (session.strip) URL.revokeObjectURL(session.strip.url);
  session.strip = strip;
}

export function getSessionStrip(): StripResult | null {
  return session.strip;
}

export function resetSession() {
  if (session.strip) URL.revokeObjectURL(session.strip.url);
  session.photos = [];
  session.strip = null;
}
