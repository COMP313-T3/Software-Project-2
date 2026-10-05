import { useEffect, useRef } from "react";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "../../content/legal.ts";
import styles from "./LegalDialog.module.css";
import { LEGAL_DOCUMENTS, type LegalDocumentName } from "./legalDocuments.ts";

interface LegalDialogProps {
  /** The document to show, or null when the pop-up is closed. */
  document: LegalDocumentName | null;
  onClose: () => void;
}

/**
 * Pop-up with the Terms and Conditions or the Privacy Policy, so reading them during sign-up
 * doesn't lose what was typed.
 */
export default function LegalDialog({
  document: name,
  onClose,
}: LegalDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = name ? LEGAL_DOCUMENTS[name] : null;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (name && !element.open) element.showModal();
    if (!name && element.open) element.close();
  }, [name]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="legalTitle"
      onClose={onClose}
    >
      {shown && (
        <>
          <div className={styles.header}>
            <div>
              <h2 id="legalTitle">{shown.title}</h2>
              <p>
                Version {LEGAL_VERSION}, effective {LEGAL_EFFECTIVE_DATE}
              </p>
            </div>
            <button type="button" className={styles.close} onClick={onClose}>
              Close
            </button>
          </div>
          <div className={styles.body}>
            <shown.Content />
          </div>
        </>
      )}
    </dialog>
  );
}
