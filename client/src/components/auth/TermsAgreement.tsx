import { useState, type MouseEvent } from "react";
import LegalDialog from "../legal/LegalDialog.tsx";
import {
  LEGAL_DOCUMENTS,
  type LegalDocumentName,
} from "../legal/legalDocuments.ts";
import styles from "./AuthForm.module.css";

interface TermsAgreementProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Message shown under the checkbox. */
  error?: string;
  /** Receives the checkbox, so a check can move focus to it. */
  checkboxRef?: (el: HTMLInputElement | null) => void;
}

/**
 * The "I agree" checkbox for the Terms and Conditions and the Privacy Policy. Each link opens
 * the document in a pop-up, and still has its own page for opening in a new tab.
 */
export default function TermsAgreement({
  checked,
  onChange,
  error,
  checkboxRef,
}: TermsAgreementProps) {
  const [showing, setShowing] = useState<LegalDocumentName | null>(null);

  function show(name: LegalDocumentName) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setShowing(name);
    };
  }

  return (
    <div className={styles.field}>
      <div className={styles.agreement}>
        <input
          ref={checkboxRef}
          type="checkbox"
          id="acceptedTerms"
          name="acceptedTerms"
          checked={checked}
          aria-describedby="acceptedTermsError"
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label htmlFor="acceptedTerms">
          I agree to the{" "}
          <a href={LEGAL_DOCUMENTS.terms.path} onClick={show("terms")}>
            Terms and Conditions
          </a>{" "}
          and the{" "}
          <a href={LEGAL_DOCUMENTS.privacy.path} onClick={show("privacy")}>
            Privacy Policy
          </a>
          .
        </label>
      </div>
      <span className={styles.error} id="acceptedTermsError">
        {error}
      </span>
      <LegalDialog document={showing} onClose={() => setShowing(null)} />
    </div>
  );
}
