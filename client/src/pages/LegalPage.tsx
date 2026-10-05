import { Link } from "react-router-dom";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "../content/legal.ts";
import {
  LEGAL_DOCUMENTS,
  type LegalDocumentName,
} from "../components/legal/legalDocuments.ts";

interface LegalPageProps {
  document: LegalDocumentName;
}

/**
 * Public page for the Terms and Conditions (/terms) or the Privacy Policy (/privacy).
 */
export default function LegalPage({ document: name }: LegalPageProps) {
  const { title, Content } = LEGAL_DOCUMENTS[name];

  return (
    <div className="min-h-dvh bg-[#0d0a08] font-['Archivo',sans-serif] text-[#efe6d8]">
      <title>{`${title} | TopSend`}</title>
      <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <Link
          to="/"
          className="text-sm text-[#b8a998] underline underline-offset-2"
        >
          Back to TopSend
        </Link>
        <h1 className="mt-6 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-[#b8a998]">
          Version {LEGAL_VERSION}, effective {LEGAL_EFFECTIVE_DATE}
        </p>
        <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-[#efe6d8]/85">
          <Content />
        </div>
      </main>
    </div>
  );
}
