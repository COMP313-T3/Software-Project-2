import { useEffect, useId, useState, type ReactNode } from "react";

type Placement = "top" | "bottom-end";

const PLACEMENTS: Record<Placement, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 pb-2",
  "bottom-end": "top-full right-0 pt-2",
};

interface TooltipProps {
  /** What the tooltip says. */
  text: string;
  /** Renders the control it describes, given the ID for the control's aria-describedby. */
  children: (describedBy: string) => ReactNode;
  /** Centered above the control, or below it and lined up with its right edge. */
  placement?: Placement;
  /**
   * Opens on focus only when the browser shows that focus, so a button that gets focus back
   * after a tap doesn't show the note.
   */
  focusVisibleOnly?: boolean;
}

function showsFocus(target: EventTarget): boolean {
  try {
    return !(target instanceof Element) || target.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * A short note next to a control, shown while the control is hovered or focused. It stays while
 * the pointer is over the note, and Esc hides it. Screen readers get it through aria-describedby
 * whether or not it's showing.
 */
export default function Tooltip({
  text,
  children,
  placement = "top",
  focusVisibleOnly = false,
}: TooltipProps) {
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
      onFocus={(event) => {
        if (!focusVisibleOnly || showsFocus(event.target)) setOpen(true);
      }}
      onBlur={() => setOpen(false)}
    >
      {children(id)}
      <div
        role="tooltip"
        id={id}
        hidden={!open}
        className={`absolute z-10 ${PLACEMENTS[placement]}`}
      >
        <p className="m-0 w-max max-w-[min(260px,calc(100vw-48px))] rounded-lg border border-[rgba(239,230,216,0.16)] bg-[#1b130e] px-3 py-2 text-[13px] leading-snug text-[#efe6d8] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)]">
          {text}
        </p>
      </div>
    </div>
  );
}
