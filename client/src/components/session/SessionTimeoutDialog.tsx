import { useEffect, useRef, useState } from "react";
import type { SessionWarning } from "../../lib/sessionTimer.ts";

interface SessionTimeoutDialogProps {
  /** When the session ends, and whether staying can extend it. */
  warning: SessionWarning;
  /** Keeps the session going. */
  onStay: () => void;
  /** Logs out now. */
  onLogOut: () => Promise<void>;
}

const BUTTON =
  "min-h-12 cursor-pointer rounded-xl text-[15.5px] leading-none font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fdc914]";

function countdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Warning that the session is about to end, with a countdown. Stay logged in has focus first,
 * and Esc does the same, including when the browser closes the dialog on a second Esc. Once the
 * session reached its hard limit it can't be extended, so only Log out is offered.
 */
export default function SessionTimeoutDialog({
  warning,
  onStay,
  onLogOut,
}: SessionTimeoutDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const closingOnPurpose = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const { endsAt, limitReached } = warning;
  const timeLeft = countdown(endsAt - now);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    closingOnPurpose.current = false;
    if (!element.open) element.showModal();
    return () => {
      closingOnPurpose.current = true;
      element.close();
    };
  }, []);

  useEffect(() => {
    firstButton.current?.focus();
  }, [limitReached]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  function logOut() {
    onLogOut().catch(() => undefined);
  }

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby="sessionWarningTitle"
      aria-describedby="sessionWarningText"
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-[20px] border border-[rgba(239,230,216,0.16)] bg-[#17110d] p-6 font-['Archivo',sans-serif] text-[#efe6d8] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85)] backdrop:bg-[rgba(8,6,4,0.72)] backdrop:backdrop-blur-[4px]"
      onCancel={(event) => {
        event.preventDefault();
        if (!limitReached) onStay();
      }}
      onClose={() => {
        if (closingOnPurpose.current || dialog.current?.open !== false) return;
        if (!limitReached) onStay();
      }}
    >
      <h2
        id="sessionWarningTitle"
        className="m-0 text-xl leading-tight font-bold"
      >
        {limitReached ? "Your session is ending" : "You'll be logged out soon"}
      </h2>
      <p
        id="sessionWarningText"
        className="mt-2 mb-0 text-[14.5px] leading-normal text-[#b8a998]"
      >
        {limitReached
          ? "You've been logged in for as long as a session can last, so you'll be logged out in "
          : "You haven't been active for a while. For your security, you'll be logged out in "}
        <strong className="font-semibold text-[#efe6d8] tabular-nums">
          {timeLeft}
        </strong>
        {limitReached ? ". Log in again to keep going." : "."}
      </p>
      <div
        className={`mt-6 grid gap-2.5 ${limitReached ? "grid-cols-1" : "grid-cols-[1fr_2fr]"}`}
      >
        <button
          ref={limitReached ? firstButton : undefined}
          type="button"
          className={`${BUTTON} border border-[rgba(239,230,216,0.16)] bg-transparent text-[#efe6d8] hover:bg-[rgba(239,230,216,0.06)]`}
          onClick={logOut}
        >
          Log out
        </button>
        {!limitReached && (
          <button
            ref={firstButton}
            type="button"
            className={`${BUTTON} border-0 bg-[#fdc914] text-[#17120b] hover:bg-[#ffd84d]`}
            onClick={onStay}
          >
            Stay logged in
          </button>
        )}
      </div>
    </dialog>
  );
}
