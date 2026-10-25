import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginFog from "./LoginFog.tsx";

const { startFog } = vi.hoisted(() => ({
  startFog:
    vi.fn<(canvas: HTMLCanvasElement, onShown: () => void) => () => void>(),
}));
vi.mock("./fogScene.ts", () => ({ startFog }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  startFog.mockReset();
});

describe("login fog", () => {
  it("adds nothing to the page without WebGL 2", () => {
    const { container } = render(<LoginFog />);

    expect(container.firstChild).toBeNull();
  });

  it("starts in a canvas hidden from screen readers, appears once drawn, and stops with the page", async () => {
    vi.stubGlobal("WebGL2RenderingContext", class {});
    const stop = vi.fn();
    startFog.mockReturnValue(stop);
    const { container, unmount } = render(<LoginFog />);
    const fog = container.firstChild as HTMLElement;
    const canvas = fog.querySelector("canvas");

    expect(fog.getAttribute("aria-hidden")).toBe("true");
    expect(fog.dataset.shown).toBe("false");
    await waitFor(() => expect(startFog).toHaveBeenCalledOnce());
    expect(startFog.mock.calls[0][0]).toBe(canvas);

    act(() => startFog.mock.calls[0][1]());
    expect(fog.dataset.shown).toBe("true");

    unmount();
    expect(stop).toHaveBeenCalledOnce();
    expect(canvas?.isConnected).toBe(false);
  });

  it("leaves the page without fog when WebGL can't start", async () => {
    vi.stubGlobal("WebGL2RenderingContext", class {});
    startFog.mockImplementation(() => {
      throw new Error("No WebGL context");
    });
    const { container } = render(<LoginFog />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
