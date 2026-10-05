import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import formStyles from "./AuthForm.module.css";
import styles from "./DateOfBirthField.module.css";

const EARLIEST_YEAR = 1900;
const CALENDAR_HEIGHT = 340;
const SHORT_DATE = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" });

function fromIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface DateOfBirthFieldProps {
  /** Id of the button, which the field's label points to. */
  id: string;
  /** Id of the field's visible label. */
  labelId: string;
  /** The chosen date as YYYY-MM-DD, or an empty string. */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Receives the button, so a check can move focus to it. */
  buttonRef?: (el: HTMLElement | null) => void;
}

/**
 * Date of birth picker: a button that looks like the other fields and opens a calendar with
 * month and year dropdowns. Days after today can't be picked.
 */
export default function DateOfBirthField({
  id,
  labelId,
  value,
  onChange,
  invalid,
  describedBy,
  buttonRef,
}: DateOfBirthFieldProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [today] = useState(() => new Date());
  const selected = value ? fromIsoDate(value) : undefined;
  const valueId = `${id}Value`;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !popover.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open && button.current) {
      const box = button.current.getBoundingClientRect();
      const roomBelow = window.innerHeight - box.bottom;
      setAbove(roomBelow < CALENDAR_HEIGHT && box.top > roomBelow);
    }
    setOpen((shown) => !shown);
  }

  function select(date: Date | undefined) {
    if (!date) return;
    onChange(toIsoDate(date));
    setOpen(false);
    button.current?.focus();
  }

  return (
    <div className={styles.field}>
      <button
        ref={(el) => {
          button.current = el;
          buttonRef?.(el);
        }}
        id={id}
        type="button"
        className={formStyles.dateButton}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        data-empty={!value}
        onClick={toggle}
      >
        <span id={valueId}>
          {value ? SHORT_DATE.format(fromIsoDate(value)) : "Select a date"}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
          <path d="M3 8.5h14M7 2.75v3.5M13 2.75v3.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={popover}
          className={styles.popover}
          data-above={above}
          role="dialog"
          aria-label="Choose your date of birth"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={select}
            captionLayout="dropdown"
            reverseYears
            startMonth={new Date(EARLIEST_YEAR, 0)}
            endMonth={today}
            defaultMonth={selected ?? today}
            disabled={{ after: today }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
