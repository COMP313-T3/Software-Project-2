import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import theme from "../layout/theme.module.css";
import StartCountdown, { NotStartedYet } from "./StartCountdown.tsx";

const STARTS_AT = "2026-11-14T15:00:00.000Z";
const units = () => [...document.querySelectorAll("[aria-hidden='true'] strong")].map((unit) => unit.textContent);
const labels = () => [...document.querySelectorAll("[aria-hidden='true'] span")].map((label) => label.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T11:54:55.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the countdown to a competition's start (AC-021)", () => {
  it("says when the competition starts, in Toronto time, and shows the days, hours, minutes and seconds left", () => {
    render(<StartCountdown startsAt={STARTS_AT} date="2026-11-14" startTime="10:00" />);
    expect(screen.getByText(/^Starts Nov 14, 2026 at 10:00 a\.m\./).textContent).toBe(
      "Starts Nov 14, 2026 at 10:00 a.m. (Toronto time)",
    );
    expect(units()).toEqual(["2", "03", "05", "05"]);
    expect(labels()).toEqual(["Days", "Hours", "Minutes", "Seconds"]);
  });

  it("reads the time left to a screen reader as one sentence, in a timer that doesn't interrupt", () => {
    render(<StartCountdown startsAt={STARTS_AT} />);
    const timer = screen.getByRole("timer", { name: "Time until the competition starts" });
    expect(timer.textContent).toContain("2 days, 3 hours and 5 minutes left");
    expect(timer.getAttribute("aria-live")).toBeNull();
  });

  it("counts down every second, and drops the days once less than a day is left", () => {
    render(<StartCountdown startsAt={STARTS_AT} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(units()).toEqual(["2", "03", "05", "04"]);
    act(() => void vi.setSystemTime(new Date("2026-11-14T13:59:58.000Z")));
    act(() => void vi.advanceTimersByTime(1000));
    expect(units()).toEqual(["01", "00", "01"]);
    expect(labels()).toEqual(["Hours", "Minutes", "Seconds"]);
    expect(screen.getByRole("timer").textContent).toContain("1 hour left");
  });

  it("says Day for a single day", () => {
    vi.setSystemTime(new Date("2026-11-13T14:00:00.000Z"));
    render(<StartCountdown startsAt={STARTS_AT} />);
    expect(units()).toEqual(["1", "01", "00", "00"]);
    expect(labels()[0]).toBe("Day");
  });

  it("shows the start in Toronto time from the moment alone, when the page has no date", () => {
    render(<StartCountdown startsAt={STARTS_AT} />);
    expect(screen.getByText(/^Starts/).textContent).toBe("Starts Nov 14, 2026, 10:00 a.m. (Toronto time)");
  });

  it("shows the date alone for a competition without a start time", () => {
    render(<StartCountdown startsAt="2026-11-14T05:00:00.000Z" date="2026-11-14" startTime={null} />);
    expect(screen.getByText(/^Starts/).textContent).toBe("Starts Nov 14, 2026 (Toronto time)");
  });

  it("asks the page to check with the server when the start comes, then again with longer waits", () => {
    vi.setSystemTime(new Date("2026-11-14T14:59:58.000Z"));
    const onDue = vi.fn();
    render(<StartCountdown startsAt={STARTS_AT} onDue={onDue} />);
    expect(onDue).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");

    act(() => void vi.advanceTimersByTime(2000));
    expect(onDue).toHaveBeenCalledTimes(1);
    expect(units()).toEqual(["00", "00", "00"]);
    expect(screen.getByRole("timer").textContent).toContain("Starting now");
    expect(screen.getByRole("status").textContent).toBe("Starting now. This page opens by itself in a moment.");

    act(() => void vi.advanceTimersByTime(1999));
    expect(onDue).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(onDue).toHaveBeenCalledTimes(2);
    act(() => void vi.advanceTimersByTime(4000));
    expect(onDue).toHaveBeenCalledTimes(3);
    act(() => void vi.advanceTimersByTime(8000));
    expect(onDue).toHaveBeenCalledTimes(4);
    act(() => void vi.advanceTimersByTime(16000));
    expect(onDue).toHaveBeenCalledTimes(5);
    act(() => void vi.advanceTimersByTime(30000));
    expect(onDue).toHaveBeenCalledTimes(6);
    act(() => void vi.advanceTimersByTime(30000));
    expect(onDue).toHaveBeenCalledTimes(7);
  });

  it("asks right away when the page opens after the start, and uses the newest callback", () => {
    vi.setSystemTime(new Date("2026-11-14T15:00:05.000Z"));
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<StartCountdown startsAt={STARTS_AT} onDue={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    view.rerender(<StartCountdown startsAt={STARTS_AT} onDue={second} />);
    act(() => void vi.advanceTimersByTime(2000));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops asking once the page takes the countdown away", () => {
    vi.setSystemTime(new Date("2026-11-14T15:00:00.000Z"));
    const onDue = vi.fn();
    const view = render(<StartCountdown startsAt={STARTS_AT} onDue={onDue} />);
    expect(onDue).toHaveBeenCalledTimes(1);
    view.unmount();
    act(() => void vi.advanceTimersByTime(120000));
    expect(onDue).toHaveBeenCalledTimes(1);
  });

  it("reads the time again when a phone brings the page back from the background", () => {
    const onDue = vi.fn();
    render(<StartCountdown startsAt={STARTS_AT} onDue={onDue} />);
    vi.setSystemTime(new Date("2026-11-14T15:10:00.000Z"));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(units()).toEqual(["00", "00", "00"]);
    expect(onDue).toHaveBeenCalledTimes(1);
  });
});

describe("a page that opens at the start, before it (AC-021)", () => {
  it("says why it's closed, counts down, and keeps the links the Climber can still use", () => {
    const onDue = vi.fn();
    render(
      <MemoryRouter>
        <div className={theme.theme}>
          <NotStartedYet startsAt={STARTS_AT} subject="Your scorecard" onDue={onDue}>
            <a href="/my-events/1/registration">Registration status</a>
          </NotStartedYet>
        </div>
      </MemoryRouter>,
    );
    const panel = screen.getByRole("region", { name: "This competition hasn't started yet" });
    expect(panel.textContent).toContain(
      "Your scorecard opens when the competition starts. You don't need to refresh: this page opens by itself.",
    );
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Registration status" })).toBeTruthy();
    expect(onDue).not.toHaveBeenCalled();
  });
});
