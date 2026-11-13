import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadingAutomatically } from "../../lib/apiClient.ts";
import { followChanges, type ChangeListener, type PageChange } from "../../lib/liveChanges.ts";
import { RELOAD_GAP_MS, useLiveReload } from "./useLiveReload.ts";

let userId: string | undefined = "user-one";
vi.mock("../session/sessionContext.ts", () => ({
  useSession: () => ({ user: userId ? { userId, role: "CLIMBER", email: "person@example.com" } : null }),
}));
vi.mock("../../lib/apiClient.ts", async (original) => ({
  ...(await original<typeof import("../../lib/apiClient.ts")>()),
  reloadingAutomatically: vi.fn(),
}));

interface PageProps {
  reload: () => void;
  topics?: string[];
  competitionId?: string;
  paused?: boolean;
}

function Page({ reload, topics = ["competitions"], competitionId, paused }: PageProps) {
  useLiveReload(reload, { topics, competitionId, paused });
  return null;
}

let listener: ChangeListener | null;
const stop = vi.fn();

/** What the server announces to the page. */
function announce(changes: PageChange[] | null) {
  act(() => listener?.(changes));
}

function later(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  userId = "user-one";
  listener = null;
  stop.mockReset();
  vi.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
  vi.mocked(reloadingAutomatically).mockReset();
  vi.mocked(followChanges).mockReset().mockImplementation((_user, heard) => {
    listener = heard;
    return stop;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a page reloading itself when its data changes", () => {
  it("listens for the logged-in user", () => {
    render(<Page reload={vi.fn()} />);

    expect(followChanges).toHaveBeenCalledExactlyOnceWith("user-one", expect.any(Function));
  });

  it("reloads when a kind of data it shows changed", () => {
    const reload = vi.fn();
    render(<Page reload={reload} topics={["competitions", "gyms"]} />);

    announce([{ topic: "gyms" }]);

    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores changes to data it doesn't show", () => {
    const reload = vi.fn();
    render(<Page reload={reload} topics={["competitions"]} />);

    announce([{ topic: "users" }, { topic: "results", competitionId: "c1" }]);

    expect(reload).not.toHaveBeenCalled();
  });

  it("marks the reload as the page's own before it reads", () => {
    const order: string[] = [];
    vi.mocked(reloadingAutomatically).mockImplementation(() => void order.push("marked"));
    render(<Page reload={() => void order.push("reloaded")} />);

    announce([{ topic: "competitions" }]);

    expect(order).toEqual(["marked", "reloaded"]);
  });

  it("reloads after the live connection came back, whatever it shows", () => {
    const reload = vi.fn();
    render(<Page reload={reload} topics={["settings"]} />);

    announce(null);

    expect(reload).toHaveBeenCalledOnce();
  });

  it("uses the page's latest reload", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Page reload={first} />);
    rerender(<Page reload={second} />);

    announce([{ topic: "competitions" }]);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(followChanges).toHaveBeenCalledOnce();
  });
});

describe("a page about one competition", () => {
  it("reloads for a change to its own competition", () => {
    const reload = vi.fn();
    render(<Page reload={reload} competitionId="c1" />);

    announce([{ topic: "competitions", competitionId: "c1" }]);

    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores a change to another competition", () => {
    const reload = vi.fn();
    render(<Page reload={reload} competitionId="c1" />);

    announce([{ topic: "competitions", competitionId: "c2" }]);

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when the server doesn't say which competition changed, as for a Climber", () => {
    const reload = vi.fn();
    render(<Page reload={reload} competitionId="c1" />);

    announce([{ topic: "competitions" }]);

    expect(reload).toHaveBeenCalledOnce();
  });

  it("lets a page about every competition reload for any of them", () => {
    const reload = vi.fn();
    render(<Page reload={reload} />);

    announce([{ topic: "competitions", competitionId: "c2" }]);

    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("a burst of changes", () => {
  it("reloads right away for the first change, then once more after a moment", () => {
    const reload = vi.fn();
    render(<Page reload={reload} />);

    announce([{ topic: "competitions" }]);
    announce([{ topic: "competitions" }]);
    announce([{ topic: "competitions" }]);
    expect(reload).toHaveBeenCalledOnce();

    later(RELOAD_GAP_MS);
    expect(reload).toHaveBeenCalledTimes(2);

    later(RELOAD_GAP_MS * 3);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads right away again once things have been quiet", () => {
    const reload = vi.fn();
    render(<Page reload={reload} />);

    announce([{ topic: "competitions" }]);
    later(RELOAD_GAP_MS + 1);
    announce([{ topic: "competitions" }]);

    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("a page that's busy", () => {
  it("waits while a save is in progress or input isn't saved, then reloads once", () => {
    const reload = vi.fn();
    const { rerender } = render(<Page reload={reload} paused />);

    announce([{ topic: "competitions" }]);
    announce([{ topic: "competitions" }]);
    later(RELOAD_GAP_MS * 2);
    expect(reload).not.toHaveBeenCalled();

    rerender(<Page reload={reload} paused={false} />);

    expect(reload).toHaveBeenCalledOnce();
  });

  it("doesn't reload when it gets free and nothing changed meanwhile", () => {
    const reload = vi.fn();
    const { rerender } = render(<Page reload={reload} paused />);

    rerender(<Page reload={reload} paused={false} />);

    expect(reload).not.toHaveBeenCalled();
  });

  it("holds a reload that was waiting its turn when the page got busy", () => {
    const reload = vi.fn();
    const { rerender } = render(<Page reload={reload} />);
    announce([{ topic: "competitions" }]);
    announce([{ topic: "competitions" }]);
    expect(reload).toHaveBeenCalledOnce();

    rerender(<Page reload={reload} paused />);
    later(RELOAD_GAP_MS * 2);
    expect(reload).toHaveBeenCalledOnce();

    rerender(<Page reload={reload} paused={false} />);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("a page that closes or has no user", () => {
  it("stops listening when the page closes, and drops a reload that was waiting", () => {
    const reload = vi.fn();
    const { unmount } = render(<Page reload={reload} />);
    announce([{ topic: "competitions" }]);
    announce([{ topic: "competitions" }]);

    unmount();
    later(RELOAD_GAP_MS * 2);

    expect(stop).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("doesn't listen without a logged-in user", () => {
    userId = undefined;
    render(<Page reload={vi.fn()} />);

    expect(followChanges).not.toHaveBeenCalled();
  });
});
