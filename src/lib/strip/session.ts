// In-memory, client-only session shared between the booth page (capture)
// and the print/editor pages. This bridge stays in memory; shared-room
// persistence lives separately in lib/together. Refresh resets this local print session.

export interface StripResult {
  url: string;
  blob: Blob;
  border?: "classic" | "thick" | "none";
}

interface BoothSession {
  photos: Array<ImageBitmap | HTMLImageElement>;
  strip: StripResult | null;
  togetherLink: string | null;
}

const session: BoothSession = { photos: [], strip: null, togetherLink: null };

export function setSessionPhotos(photos: Array<ImageBitmap | HTMLImageElement>) {
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

export function setTogetherLink(link: string) {
  session.togetherLink = link;
  try {
    sessionStorage.setItem("celf-active-together", link);
  } catch {
    /* optional */
  }
}
export function getTogetherLink() {
  if (session.togetherLink) return session.togetherLink;
  try {
    return sessionStorage.getItem("celf-active-together");
  } catch {
    return null;
  }
}

export function resetSession() {
  if (session.strip) URL.revokeObjectURL(session.strip.url);
  session.photos = [];
  session.strip = null;
  session.togetherLink = null;
  try {
    sessionStorage.removeItem("celf-active-together");
  } catch {
    /* optional */
  }
}
