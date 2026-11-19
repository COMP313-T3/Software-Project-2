import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppStorage } from "../../lib/appStorage.ts";
import EndWarning from "./EndWarning.tsx";

const ENDS_AT = "2026-11-14T23:00:00.000Z";
const at = (minutesBeforeEnd: number, seconds = 0) =>
  new Date(Date.parse(ENDS_AT) - minutesBeforeEnd * 60_000 - seconds * 1000);

function show(props: Partial<Parameters<typeof EndWarning>[0]> = {}) {
  return render(
    <MemoryRouter>
      <button type="button">Add attempt on Crimp Ladder</button>
      <EndWarning competitionId="bash" endsAt={ENDS_AT} endTime="18:00" {...props} />
    </MemoryRouter>,
  );
}
const warning = () => screen.queryByRole("alertdialog");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearAppStorage();
});

describe("the warnings before the competition ends (AC-024)", () => {
  it("opens 15 minutes before the end, says when scoring closes, and puts focus on Got it", () => {
    vi.setSystemTime(at(15, 3));
    show();
    act(() => void vi.advanceTimersByTime(1000));
    expect(warning()).toBeNull();

    act(() => void vi.advanceTimersByTime(2100));

    const dialog = screen.getByRole("alertdialog", { name: "15 minutes left" });
    expect(dialog.textContent).toContain("Scoring closes at 6:00 p.m. (Toronto time)");
    expect(dialog.textContent).toContain(
      "Record your last attempts now. When the time is up, your scorecard closes for good and you're taken to the final leaderboard.",
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Got it" }));
  });

  it("opens again 5 minutes before the end", () => {
    vi.setSystemTime(at(15));
    show();
    act(() => void vi.advanceTimersByTime(10));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(warning()).toBeNull();

    act(() => void vi.advanceTimersByTime(10 * 60_000 + 100));

    expect(screen.getByRole("alertdialog", { name: "5 minutes left" })).toBeTruthy();
  });

  it("closes with Got it and gives focus back to what had it", () => {
    vi.setSystemTime(at(14));
    show();
    const before = screen.getByRole("button", { name: "Add attempt on Crimp Ladder" });
    before.focus();
    act(() => void vi.advanceTimersByTime(10));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Got it" }));

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(warning()).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("shows the time actually left on a page opened late, and only the latest warning", () => {
    vi.setSystemTime(at(3, 10));
    show();
    act(() => void vi.advanceTimersByTime(10));

    expect(screen.getByRole("alertdialog", { name: "3 minutes left" })).toBeTruthy();
  });

  it("doesn't open a warning again on another page or after a reload", () => {
    vi.setSystemTime(at(12));
    const first = show();
    act(() => void vi.advanceTimersByTime(10));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    first.unmount();

    show({ scorecardPath: "/my-events/bash/scorecard" });
    act(() => void vi.advanceTimersByTime(10));

    expect(warning()).toBeNull();
  });

  it("offers My scorecard on the other pages of the event", () => {
    vi.setSystemTime(at(15));
    show({ scorecardPath: "/my-events/bash/scorecard?page=2" });
    act(() => void vi.advanceTimersByTime(10));

    const dialog = screen.getByRole("alertdialog", { name: "15 minutes left" });
    expect(dialog.textContent).toContain(
      "Record your last attempts on My scorecard now. When the time is up, your scorecard closes for good and the final leaderboard opens.",
    );
    expect(screen.getByRole("link", { name: "Open My scorecard" }).getAttribute("href")).toBe(
      "/my-events/bash/scorecard?page=2",
    );
  });

  it("says scoring closes at the end of the day for a competition without an end time", () => {
    vi.setSystemTime(at(15));
    show({ endTime: null });
    act(() => void vi.advanceTimersByTime(10));

    expect(warning()?.textContent).toContain("Scoring closes at the end of the day.");
  });

  it("checks again as soon as a page in the background is seen, since its timers can run late", () => {
    vi.setSystemTime(at(16));
    show();
    act(() => void vi.advanceTimersByTime(10));
    vi.setSystemTime(at(6));

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("alertdialog", { name: "6 minutes left" })).toBeTruthy();
  });

  it("opens nothing after the end", () => {
    vi.setSystemTime(new Date(Date.parse(ENDS_AT) + 1000));
    show();
    act(() => void vi.advanceTimersByTime(60_000));

    expect(warning()).toBeNull();
  });
});
