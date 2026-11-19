import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReveal } from "./useReveal.ts";

function Block() {
  const { ref, state } = useReveal<HTMLDivElement>(0.35);
  return (
    <div ref={ref} data-testid="block" data-state={state}>
      Block
    </div>
  );
}

type Report = (entries: Partial<IntersectionObserverEntry>[]) => void;

function installObserver() {
  const observer = { report: null as Report | null, options: undefined as IntersectionObserverInit | undefined };
  class FakeIntersectionObserver {
    constructor(callback: (entries: IntersectionObserverEntry[]) => void, options?: IntersectionObserverInit) {
      observer.report = (entries) => callback(entries as IntersectionObserverEntry[]);
      observer.options = options;
    }
    observe = () => undefined;
    disconnect = () => undefined;
  }
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  return observer;
}

function entry(ratio: number, top: number): Partial<IntersectionObserverEntry> {
  return {
    intersectionRatio: ratio,
    isIntersecting: ratio > 0,
    boundingClientRect: new DOMRect(0, top, 100, 300),
    rootBounds: new DOMRect(0, 96, 1000, 608),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useReveal", () => {
  it("starts hidden, shows once enough of the block is on screen, and leaves through the top", () => {
    const observer = installObserver();
    render(<Block />);
    const block = screen.getByTestId("block");
    expect(block.dataset.state).toBe("before");
    expect(observer.options?.rootMargin).toBe("-12% 0px -12% 0px");

    act(() => observer.report?.([entry(0.2, 650)]));
    expect(block.dataset.state).toBe("before");

    act(() => observer.report?.([entry(0.6, 400)]));
    expect(block.dataset.state).toBe("in");

    act(() => observer.report?.([entry(0.1, 20)]));
    expect(block.dataset.state).toBe("after");

    act(() => observer.report?.([entry(0.5, 120)]));
    expect(block.dataset.state).toBe("in");
  });

  it("shows the block straight away in a browser without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Block />);
    expect(screen.getByTestId("block").dataset.state).toBe("in");
  });
});
