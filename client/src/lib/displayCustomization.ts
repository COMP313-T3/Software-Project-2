/** US021 frontend values. This is not an HTTP/upload contract; the backend adapter is pending. */
export interface DisplayImage { src: string; name: string; file?: File; reference?: string }
export interface DisplaySettings { logo: DisplayImage | null; background: DisplayImage | null; sponsors: DisplayImage[] }
export interface DisplaySnapshot { competitionId: string; settings: DisplaySettings }
export interface DisplayGateway {
  localPreviewFiles?: boolean;
  load: (competitionId: string, signal: AbortSignal) => Promise<DisplaySnapshot>;
  save: (competitionId: string, draft: DisplaySettings, signal: AbortSignal) => Promise<DisplaySnapshot>;
}
export const emptyDisplay = (): DisplaySettings => ({ logo: null, background: null, sponsors: [] });
/** Browser preview support only. Final upload types/limits will follow the backend contract. */
export const PREVIEW_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const imageIdentity = (image: DisplayImage | null) => image?.src ?? "";
export function sameDisplay(a: DisplaySettings, b: DisplaySettings) {
  return imageIdentity(a.logo) === imageIdentity(b.logo) && imageIdentity(a.background) === imageIdentity(b.background) &&
    a.sponsors.length === b.sponsors.length && a.sponsors.every((image, index) => imageIdentity(image) === imageIdentity(b.sponsors[index]));
}
