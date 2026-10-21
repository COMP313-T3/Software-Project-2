import { formatTorontoDateTime } from "../../lib/dateFormat.ts";
import type { GymRequestContact } from "../../lib/gymRequestReviewApi.ts";

const NO_BREAK_SPACE = " ";

/**
 * A moment in Toronto time, such as "Oct 20, 2026, 9:15 a.m.", that wraps only between the date
 * and the time, never inside either, so narrow columns don't split "9:15" from "a.m.".
 *
 * @param value An ISO 8601 timestamp from the API.
 * @returns The readable date and time, or "Unavailable" when the value isn't a date.
 */
export function requestDateTime(value: string): string {
  const text = formatTorontoDateTime(value);
  const split = text.lastIndexOf(", ");
  if (split < 0) return text;
  const keepTogether = (part: string) => part.replaceAll(" ", NO_BREAK_SPACE);
  return `${keepTogether(text.slice(0, split + 1))} ${keepTogether(text.slice(split + 2))}`;
}

/**
 * The applicant's full name for headings and messages. Falls back to the email, since requests
 * saved before contact details were collected may have no name.
 *
 * @param contact The request's contact details.
 * @returns The name, the email, or "Name not given".
 */
export function applicantName(contact: GymRequestContact): string {
  const name = [contact.firstName, contact.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return name || contact.email || "Name not given";
}
