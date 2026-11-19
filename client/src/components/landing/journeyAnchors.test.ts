import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureJourneyAnchors } from "./journeyAnchors.ts";

function mark(step: number, top: number, height: number, align?: "top") {
  const element = document.createElement("div");
  element.dataset.journeyStep = String(step);
  if (align) element.dataset.journeyAlign = align;
  element.getBoundingClientRect = () => new DOMRect(0, top, 100, height);
  document.body.append(element);
  return element;
}

beforeEach(() => {
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(10000);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("measureJourneyAnchors", () => {
  it("anchors the hand-off at the top of the screen and each section at the middle", () => {
    mark(-1, 4800, 1, "top");
    mark(0, 6400, 1200);
    mark(1, 7600, 1200);

    expect(measureJourneyAnchors()).toEqual([4800, 6600, 7800]);
  });

  it("orders anchors by step, whatever order they appear in on the page", () => {
    mark(1, 7600, 1200);
    mark(-1, 4800, 1, "top");
    mark(0, 6400, 1200);

    expect(measureJourneyAnchors()).toEqual([4800, 6600, 7800]);
  });

  it("measures from the top of the page when it's already scrolled", () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(3000);
    mark(-1, 1800, 1, "top");
    mark(0, 3400, 1200);

    expect(measureJourneyAnchors()).toEqual([4800, 6600]);
  });

  it("pulls anchors past the end of the page back to the last scroll position, keeping them in order", () => {
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(9000);
    mark(-1, 4800, 1, "top");
    mark(0, 8100, 1200);
    mark(1, 8600, 1400);

    expect(measureJourneyAnchors()).toEqual([4800, 8200, 8200]);
  });
});
