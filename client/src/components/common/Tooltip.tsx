import { useEffect, useId, useState, type ReactNode } from "react";

interface TooltipProps {
  /** What the tooltip says. */
  text: string;
  /** Renders the control it describes, given the ID for the control's aria-describedby. */
  children: (describedBy: string) => ReactNode;
}

/**
 * A short note above a control, shown while the control is hovered or focused. It stays while
 * the pointer is over the note, and Esc hides it. Screen readers get it through aria-describedby
 * whether or not it's showing.
 */
export default function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      className="relative"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children(id)}
      <div
        role="tooltip"
        id={id}
        hidden={!open}
        className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-2"
      >
        <p className="m-0 w-max max-w-[min(260px,calc(100vw-48px))] rounded-lg border border-[rgba(239,230,216,0.16)] bg-[#1b130e] px-3 py-2 text-[13px] leading-snug text-[#efe6d8] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)]">
          {text}
        </p>
      </div>
    </div>
  );
}
