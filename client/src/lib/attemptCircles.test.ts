import { describe, expect, it } from "vitest";
import { attemptCircles, circleAction, topOnNextAttempt } from "./attemptCircles.ts";

const states = (attempts: number, sent: boolean, max = 5) =>
  attemptCircles(attempts, sent, max).map((circle) => circle.state);

const taps = (attempts: number, sent: boolean, max = 5) => attemptCircles(attempts, sent, max).map((circle) => circle.tap);

describe("US-031 a problem's attempt circles", () => {
  it("has one circle for each attempt the competition allows", () => {
    expect(attemptCircles(0, false, 5).map((circle) => circle.number)).toEqual([1, 2, 3, 4, 5]);
    expect(attemptCircles(0, false, 20)).toHaveLength(20);
    expect(attemptCircles(0, false, 1)).toHaveLength(1);
  });

  it("leaves every circle unused before the first attempt", () => {
    expect(states(0, false)).toEqual(["unused", "unused", "unused", "unused", "unused"]);
  });

  it("marks the attempts used as failed and leaves the rest unused", () => {
    expect(states(2, false)).toEqual(["failed", "failed", "unused", "unused", "unused"]);
    expect(states(5, false)).toEqual(["failed", "failed", "failed", "failed", "failed"]);
  });

  it("marks the last attempt as the top when the problem was sent", () => {
    expect(states(1, true)).toEqual(["sent", "unused", "unused", "unused", "unused"]);
    expect(states(3, true)).toEqual(["failed", "failed", "sent", "unused", "unused"]);
    expect(states(5, true)).toEqual(["failed", "failed", "failed", "failed", "sent"]);
  });

  it("never marks more circles than the competition allows", () => {
    expect(states(7, false, 3)).toEqual(["failed", "failed", "failed"]);
    expect(states(7, true, 3)).toEqual(["failed", "failed", "sent"]);
  });
});

describe("US-031 tapping an attempt circle", () => {
  it("marks an unused circle and every circle before it as failed", () => {
    expect(taps(0, false)).toEqual([
      { attempts: 1, sent: false },
      { attempts: 2, sent: false },
      { attempts: 3, sent: false },
      { attempts: 4, sent: false },
      { attempts: 5, sent: false },
    ]);
    expect(taps(2, false).slice(2)).toEqual([
      { attempts: 3, sent: false },
      { attempts: 4, sent: false },
      { attempts: 5, sent: false },
    ]);
  });

  it("clears the last marked circle when it's tapped again", () => {
    expect(taps(3, false)[2]).toEqual({ attempts: 2, sent: false });
    expect(taps(5, false)[4]).toEqual({ attempts: 4, sent: false });
  });

  it("clears the whole result when the only marked circle is tapped again", () => {
    expect(taps(1, false)[0]).toBeNull();
    expect(taps(1, true)[0]).toBeNull();
  });

  it("goes back to an earlier marked circle's attempts", () => {
    expect(taps(4, false).slice(0, 3)).toEqual([
      { attempts: 1, sent: false },
      { attempts: 2, sent: false },
      { attempts: 3, sent: false },
    ]);
  });

  it("takes back a top by tapping it, which leaves the attempts before it as failed", () => {
    expect(taps(3, true)[2]).toEqual({ attempts: 2, sent: false });
    expect(taps(5, true)[4]).toEqual({ attempts: 4, sent: false });
  });

  it("locks every other circle of a problem that was sent", () => {
    expect(taps(3, true)).toEqual([undefined, undefined, { attempts: 2, sent: false }, undefined, undefined]);
  });

  it("keeps the last circle of a result over the limit tappable", () => {
    expect(taps(7, false, 3)[2]).toEqual({ attempts: 2, sent: false });
  });
});

describe("US-031 Sent it on a problem with attempt circles", () => {
  it("records the top on the next attempt", () => {
    expect(topOnNextAttempt(0, false, 5)).toEqual({ attempts: 1, sent: true });
    expect(topOnNextAttempt(4, false, 5)).toEqual({ attempts: 5, sent: true });
  });

  it("isn't offered once the problem is sent or no attempts are left", () => {
    expect(topOnNextAttempt(2, true, 5)).toBeUndefined();
    expect(topOnNextAttempt(5, false, 5)).toBeUndefined();
  });
});

describe("US-031 what tapping a circle does, in words", () => {
  const actions = (attempts: number, sent: boolean) =>
    attemptCircles(attempts, sent, 4)
      .filter((circle) => circle.tap !== undefined)
      .map((circle) => circleAction(circle, "Problem 3"));

  it("names the attempts an unused circle marks", () => {
    expect(actions(0, false)).toEqual([
      "Mark 1 attempt on Problem 3",
      "Mark 2 attempts on Problem 3",
      "Mark 3 attempts on Problem 3",
      "Mark 4 attempts on Problem 3",
    ]);
  });

  it("names clearing the last attempt and going back to an earlier one", () => {
    expect(actions(3, false)).toEqual([
      "Go back to 1 attempt on Problem 3",
      "Go back to 2 attempts on Problem 3",
      "Clear attempt 3 on Problem 3",
      "Mark 4 attempts on Problem 3",
    ]);
  });

  it("names taking back the send", () => {
    expect(actions(2, true)).toEqual(["Take back the send on Problem 3"]);
  });
});
