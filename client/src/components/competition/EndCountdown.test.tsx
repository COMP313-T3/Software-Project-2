import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EndCountdown from "./EndCountdown.tsx";

const ENDS_AT = "2026-11-14T23:00:00.000Z";
const clock = () => document.querySelector("[role='timer'] [aria-hidden='true']")?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T20:45:30.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the countdown to a competition's end (AC-021)", () => {
  it("says when scoring closes, in Toronto time, and the hours, minutes and seconds left", () => {
    render(<EndCountdown endsAt={ENDS_AT} endTime="18:00" />);

    expect(screen.getByText(/^Scoring closes at 6:00 p\.m\./).textContent).toBe("Scoring closes at 6:00 p.m. (Toronto time)");
    expect(clock()).toBe("2:14:30");
  });

  it("says scoring closes at the end of the day for a competition without an end time", () => {
    render(<EndCountdown endsAt={ENDS_AT} endTime={null} />);

    expect(screen.getByText(/^Scoring closes at the end of the day/)).toBeTruthy();
  });

  it("reads the time left to a screen reader as one sentence, in a timer that doesn't interrupt", () => {
    render(<EndCountdown endsAt={ENDS_AT} endTime="18:00" />);

    const timer = screen.getByRole("timer", { name: "Time until scoring closes" });
    expect(timer.textContent).toContain("2 hours and 14 minutes left");
    expect(timer.getAttribute("aria-live")).toBeNull();
    expect(screen.getByRole("region", { name: "When scoring closes" })).toBeTruthy();
  });

  it("counts down every second", () => {
    render(<EndCountdown endsAt={ENDS_AT} endTime="18:00" />);

    act(() => void vi.advanceTimersByTime(1000));
    expect(clock()).toBe("2:14:29");
    act(() => void vi.advanceTimersByTime(60_000));
    expect(clock()).toBe("2:13:29");
  });

  it("at the end, says scoring is closed and asks the page to read the server's answer, then again more slowly", () => {
    vi.setSystemTime(new Date("2026-11-14T22:59:58.000Z"));
    const onDue = vi.fn();
    render(<EndCountdown endsAt={ENDS_AT} endTime="18:00" onDue={onDue} />);
    expect(onDue).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2000));

    expect(onDue).toHaveBeenCalledOnce();
    expect(screen.getByText(/^Scoring is closed/)).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Results are final. This page updates by itself in a moment.");
    act(() => void vi.advanceTimersByTime(2000));
    expect(onDue).toHaveBeenCalledTimes(2);
    act(() => void vi.advanceTimersByTime(3000));
    expect(onDue).toHaveBeenCalledTimes(2);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onDue).toHaveBeenCalledTimes(3);
  });

  it("stops asking once the page takes it away", () => {
    vi.setSystemTime(new Date("2026-11-14T23:00:01.000Z"));
    const onDue = vi.fn();
    const { unmount } = render(<EndCountdown endsAt={ENDS_AT} onDue={onDue} />);
    expect(onDue).toHaveBeenCalledOnce();

    unmount();
    act(() => void vi.advanceTimersByTime(60_000));

    expect(onDue).toHaveBeenCalledOnce();
  });
});
