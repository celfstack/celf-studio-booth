export type BoothRole = "host" | "guest";
export interface Contribution {
  name: string;
  photos: string[];
  submittedAt: number;
  submissionId: string;
}
export interface RoomMeta {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  hostHash: string;
  guestHash: string;
}
export interface RoomView {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  role: BoothRole;
  host: { name: string; submittedAt: number } | null;
  guest: { name: string; submittedAt: number } | null;
  inviteToken?: string;
}
export interface RoomPhotos {
  host: string[];
  guest: string[];
}
export const ROOM_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
export const PHOTO_WIDTH = 540;
export const PHOTO_HEIGHT = 810;
export const MAX_PHOTO_LENGTH = 180_000;
