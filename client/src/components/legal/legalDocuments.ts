import type { ComponentType } from "react";
import PrivacyContent from "./PrivacyContent.tsx";
import TermsContent from "./TermsContent.tsx";

export type LegalDocumentName = "terms" | "privacy";

/** The legal pages: their titles, their own URLs, and their text. */
export const LEGAL_DOCUMENTS: Record<
  LegalDocumentName,
  { title: string; path: string; Content: ComponentType }
> = {
  terms: {
    title: "Terms and Conditions",
    path: "/terms",
    Content: TermsContent,
  },
  privacy: {
    title: "Privacy Policy",
    path: "/privacy",
    Content: PrivacyContent,
  },
};
