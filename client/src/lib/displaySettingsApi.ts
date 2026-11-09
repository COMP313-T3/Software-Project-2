import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";
import { backgroundImage } from "./displayBackgrounds.ts";
import { type DisplayGateway, type DisplayImage, type DisplaySnapshot } from "./displayCustomization.ts";

const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
export function displayReference(value: string): string {
  const reference = value.trim();
  if (!reference || reference.length > 2048 || /[\s\\]/.test(reference)) throw new Error("Enter an image URL or asset reference of up to 2048 characters.");
  const url = new URL(reference, base + "/");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) image URL or an existing asset reference.");
  return reference;
}
export function referenceImage(reference: string, name: string): DisplayImage {
  const checked = displayReference(reference);
  return { reference: checked, src: new URL(checked, base + "/").href, name };
}
export function checkedDisplay(value: unknown, competitionId: string): DisplaySnapshot {
  if (!value || typeof value !== "object" || !("competitionId" in value) || value.competitionId !== competitionId || !("displaySettings" in value)) throw new Error("Display settings did not match this competition.");
  const settings = value.displaySettings as Record<string, unknown>;
  if (!settings || !(settings.logo === null || typeof settings.logo === "string") || !(settings.background === null || typeof settings.background === "string") || !Array.isArray(settings.sponsors) || !settings.sponsors.every(v => typeof v === "string")) throw new Error("Invalid display settings.");
  return { competitionId, settings: {
    logo: settings.logo === null ? null : referenceImage(settings.logo as string, "Event logo"),
    background: backgroundImage(settings.background as string | null),
    sponsors: (settings.sponsors as string[]).map((value, index) => referenceImage(value, `Sponsor ${index + 1}`)),
  } };
}
const path = (id: string) => `/api/gym-admin/competitions/${encodeURIComponent(id)}/display-settings`;
export const displayGateway: DisplayGateway = {
  load: async (id, signal) => checkedDisplay(await withAccessToken(token => apiRequest(path(id), { signal, headers: { Authorization: `Bearer ${token}` } })), id),
  save: async (id, draft, signal) => {
    const ref = (image: DisplayImage) => { if (image.file) throw new Error("Upload is not available."); return displayReference(image.reference ?? image.src); };
    const body = { logo: draft.logo ? ref(draft.logo) : null, background: backgroundImage(draft.background?.reference)?.reference ?? null, sponsors: draft.sponsors.map(ref) };
    return checkedDisplay(await withAccessToken(token => apiRequest(path(id), { method: "PUT", body, signal, headers: { Authorization: `Bearer ${token}` } })), id);
  },
};
export async function getPublicDisplay(id: string, signal: AbortSignal) {
  return checkedDisplay(await apiRequest(`/api/competitions/${encodeURIComponent(id)}/display-settings`, { signal }), id);
}
