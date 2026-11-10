import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Leaderboard, MyEntry } from "../../lib/leaderboardApi.ts";
import { MY_ROW_ID } from "../../lib/leaderboardText.ts";
import { boardFixture } from "../../test/leaderboardFixtures.ts";
import MyStanding from "./MyStanding.tsx";

function climberBoard(entry: Partial<MyEntry> = {}): Leaderboard {
  const board = boardFixture("climber");
  board.myEntry = { ...board.myEntry!, ...entry };
  return board;
}

function renderStanding(board: Leaderboard = climberBoard()) {
  return render(<MyStanding board={board} />);
}

const panel = () => within(screen.getByRole("region", { name: "Your position" }));
const announcement = () => screen.getByRole("status").textContent;

function addMyRow() {
  const table = document.createElement("table");
  table.innerHTML = `<tbody><tr id="${MY_ROW_ID}" tabindex="-1"><td>Ben Sender</td></tr></tbody>`;
  document.body.append(table);
  const row = document.getElementById(MY_ROW_ID)!;
  row.scrollIntoView = vi.fn();
  return { row, remove: () => table.remove() };
}

afterEach(() => cleanup());

describe("US-032 #32.4 the Climber's own position", () => {
  it("shows the Climber's place, division, points, and how far they are behind 1st place", () => {
    renderStanding();

    expect(panel().getByText("2nd")).toBeTruthy();
    expect(panel().getByText("Tied")).toBeTruthy();
    expect(panel().getByText("of 3 Climbers in Open")).toBeTruthy();
    expect(panel().getByText("80 points")).toBeTruthy();
    expect(panel().getByText("100 points behind 1st place.")).toBeTruthy();
  });

  it("also names the nearest place above when it isn't 1st", () => {
    renderStanding(climberBoard({ rank: 4, tied: false, of: 6, totalScore: 60, pointsBehindLeader: 120, placeAbove: { rank: 2, pointsBehind: 20 } }));

    expect(panel().getByText("4th")).toBeTruthy();
    expect(panel().queryByText("Tied")).toBeNull();
    expect(panel().getByText("120 points behind 1st place.")).toBeTruthy();
    expect(panel().getByText("20 points behind 2nd place.")).toBeTruthy();
  });

  it.each([
    [false, "You're in the lead."],
    [true, "You share 1st place."],
  ])("says when the Climber is in 1st place (tied: %s)", (tied, message) => {
    renderStanding(climberBoard({ rank: 1, tied, totalScore: 180, pointsBehindLeader: 0, placeAbove: null }));

    expect(panel().getByText("1st")).toBeTruthy();
    expect(panel().getByText(message)).toBeTruthy();
  });

  it("says everyone is level before the first official result", () => {
    const board = climberBoard({ rank: 1, tied: true, totalScore: 0, problemsRecorded: 0, pointsBehindLeader: 0, placeAbove: null });
    board.lastResultAt = null;
    renderStanding(board);

    expect(panel().getByText("No official results yet, so everyone shares 1st place for now.")).toBeTruthy();
  });

  it("says when the Climber has no official results of their own yet", () => {
    renderStanding(climberBoard({ rank: 3, tied: false, totalScore: 0, problemsRecorded: 0, pointsBehindLeader: 180, placeAbove: { rank: 2, pointsBehind: 80 } }));

    expect(panel().getByText("You don't have any official results yet.")).toBeTruthy();
    expect(panel().getByText("80 points behind 2nd place.")).toBeTruthy();
  });

  it.each([
    ["WAITLIST", { _id: "open", name: "Open" }, "You're on the waitlist, so you're not ranked. You'll appear here if your place is confirmed."],
    ["PENDING", { _id: "open", name: "Open" }, "Your place isn't confirmed yet, so you're not ranked. You'll appear here once it is."],
    ["CONFIRMED", null, "You're not ranked because your registration doesn't have a division in this competition."],
  ] as const)("explains why a Climber with a %s registration isn't ranked", (status, division, message) => {
    const board = boardFixture("climber");
    board.myEntry = null;
    board.myRegistration = { status, division };
    renderStanding(board);

    expect(panel().getByText(message)).toBeTruthy();
    expect(panel().queryByRole("button", { name: "Show my row" })).toBeNull();
  });

  it("tells a Climber who didn't register that they aren't on the leaderboard", () => {
    renderStanding(boardFixture("public"));

    expect(panel().getByText("You're not registered for this competition, so you're not on its leaderboard.")).toBeTruthy();
  });

  it("announces nothing when the position first loads", () => {
    renderStanding();

    expect(announcement()).toBe("");
    expect(panel().queryByText(/from/)).toBeNull();
  });

  it("shows and announces a move up or down when the ranking changes", () => {
    const { rerender } = renderStanding();

    rerender(<MyStanding board={climberBoard({ rank: 1, tied: false })} />);
    expect(panel().getByText("Up from 2nd")).toBeTruthy();
    expect(announcement()).toBe("You moved up to 1st place.");

    rerender(<MyStanding board={climberBoard({ rank: 3, tied: false })} />);
    expect(panel().getByText("Down from 1st")).toBeTruthy();
    expect(announcement()).toBe("You moved down to 3rd place.");
  });

  it("keeps the announcement when an update leaves the place the same", () => {
    const { rerender } = renderStanding();
    rerender(<MyStanding board={climberBoard({ rank: 1, tied: false })} />);

    rerender(<MyStanding board={climberBoard({ rank: 1, tied: false, totalScore: 200 })} />);

    expect(announcement()).toBe("You moved up to 1st place.");
    expect(panel().getByText("200 points")).toBeTruthy();
  });

  it("doesn't call a move to another division a move up or down", () => {
    const { rerender } = renderStanding(climberBoard({ rank: 5, of: 6 }));

    rerender(<MyStanding board={climberBoard({ rank: 1, tied: false, of: 1, division: { _id: "youth", name: "Youth" } })} />);

    expect(panel().queryByText(/from/)).toBeNull();
    expect(panel().getByText("of 1 Climber in Youth")).toBeTruthy();
    expect(announcement()).toBe("You're now ranked 1st in Youth.");
  });

  it("announces when the Climber becomes ranked, and when they stop being ranked", () => {
    const waiting = boardFixture("climber");
    waiting.myEntry = null;
    waiting.myRegistration = { status: "WAITLIST", division: { _id: "open", name: "Open" } };
    const { rerender } = renderStanding(waiting);

    rerender(<MyStanding board={climberBoard({ rank: 4, tied: false, of: 4 })} />);
    expect(announcement()).toBe("You're now ranked 4th in Open.");
    expect(panel().queryByText(/from/)).toBeNull();

    rerender(<MyStanding board={waiting} />);
    expect(announcement()).toBe("You're no longer ranked.");
  });

  it("gives the Climber's row its focus back when a live update moves it", () => {
    const { row, remove } = addMyRow();
    const { rerender } = renderStanding();
    fireEvent.click(panel().getByRole("button", { name: "Show my row" }));
    row.blur();

    rerender(<MyStanding board={climberBoard({ rank: 3, tied: false })} />);

    expect(document.activeElement).toBe(row);
    remove();
  });

  it("leaves focus alone after the Climber clicks somewhere else", () => {
    const { row, remove } = addMyRow();
    const { rerender } = renderStanding();
    fireEvent.click(panel().getByRole("button", { name: "Show my row" }));
    fireEvent.pointerDown(document.body);
    row.blur();

    rerender(<MyStanding board={climberBoard({ rank: 3, tied: false })} />);

    expect(document.activeElement).toBe(document.body);
    remove();
  });

  it("scrolls to the Climber's row and focuses it, without motion when reduced motion is asked for", () => {
    const { row, remove } = addMyRow();
    renderStanding();

    fireEvent.click(panel().getByRole("button", { name: "Show my row" }));

    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    expect(document.activeElement).toBe(row);
    remove();
  });

  it("scrolls smoothly when reduced motion isn't asked for", () => {
    const { row, remove } = addMyRow();
    const motion = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    renderStanding();

    fireEvent.click(panel().getByRole("button", { name: "Show my row" }));

    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    motion.mockRestore();
    remove();
  });
});
