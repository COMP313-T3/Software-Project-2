import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultChange } from "../../lib/scorecardApi.ts";
import AttemptCircles from "./AttemptCircles.tsx";

function renderCircles(attempts: number, sent: boolean, { maxAttempts = 5, busy = false } = {}) {
  const onChange = vi.fn((_change: ResultChange | null) => {});
  const { container } = render(
    <AttemptCircles
      title="Problem 3"
      attempts={attempts}
      sent={sent}
      maxAttempts={maxAttempts}
      busy={busy}
      onChange={onChange}
    />,
  );
  const circles = [...container.querySelectorAll<HTMLElement>("[data-state]")];
  return { onChange, circles };
}

const names = () => screen.queryAllByRole("button").map((button) => button.getAttribute("aria-label"));

afterEach(cleanup);

describe("US-031 the attempt circles of a problem", () => {
  it("draws one circle for each allowed attempt, numbered while unused", () => {
    const { circles } = renderCircles(0, false);

    expect(circles.map((circle) => circle.dataset.state)).toEqual(["unused", "unused", "unused", "unused", "unused"]);
    expect(circles.map((circle) => circle.textContent)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("fills the failed attempts and the top, and keeps the unused circles numbered", () => {
    const { circles } = renderCircles(3, true);

    expect(circles.map((circle) => circle.dataset.state)).toEqual(["failed", "failed", "sent", "unused", "unused"]);
    expect(circles.map((circle) => circle.textContent)).toEqual(["", "", "", "4", "5"]);
  });

  it("follows the competition's own attempt limit", () => {
    expect(renderCircles(0, false, { maxAttempts: 8 }).circles).toHaveLength(8);
  });

  it("makes every circle of an unfinished problem a button named for what it does", () => {
    renderCircles(2, false);

    expect(names()).toEqual([
      "Go back to 1 attempt on Problem 3",
      "Clear attempt 2 on Problem 3",
      "Mark 3 attempts on Problem 3",
      "Mark 4 attempts on Problem 3",
      "Mark 5 attempts on Problem 3",
    ]);
  });

  it("marks the tapped circle and the ones before it", () => {
    const { onChange } = renderCircles(1, false);

    fireEvent.click(screen.getByRole("button", { name: "Mark 4 attempts on Problem 3" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ attempts: 4, sent: false });
  });

  it("clears the last marked circle when it's tapped again", () => {
    const { onChange } = renderCircles(3, false);

    fireEvent.click(screen.getByRole("button", { name: "Clear attempt 3 on Problem 3" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ attempts: 2, sent: false });
  });

  it("clears the result when the only marked circle is tapped again", () => {
    const { onChange } = renderCircles(1, false);

    fireEvent.click(screen.getByRole("button", { name: "Clear attempt 1 on Problem 3" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("only lets the top of a sent problem be tapped, to take it back", () => {
    const { onChange, circles } = renderCircles(3, true);

    expect(names()).toEqual(["Take back the send on Problem 3"]);
    expect(circles.filter((circle) => circle.hasAttribute("data-locked")).map((circle) => circle.tagName)).toEqual([
      "SPAN",
      "SPAN",
      "SPAN",
      "SPAN",
    ]);
    expect(circles[0].getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Take back the send on Problem 3" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ attempts: 2, sent: false });
  });

  it("ignores taps while a result is being saved, without taking the circles out of the tab order", () => {
    const { onChange } = renderCircles(2, false, { busy: true });
    const circle = screen.getByRole("button", { name: "Mark 3 attempts on Problem 3" }) as HTMLButtonElement;

    fireEvent.click(circle);

    expect(onChange).not.toHaveBeenCalled();
    expect(circle.getAttribute("aria-disabled")).toBe("true");
    expect(circle.disabled).toBe(false);
  });
});
