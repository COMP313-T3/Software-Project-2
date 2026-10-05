import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionTiming } from "./sessionApi.ts";
import {
  createSessionTimer,
  type SessionTimerOptions,
} from "./sessionTimer.ts";

const MINUTE = 60 * 1000;
const START = new Date("2026-10-05T14:00:00Z").getTime();
const HOUR_LEFT: SessionTiming = { expiresIn: 3600, limitReached: false };

function setup(options: Partial<SessionTimerOptions> = {}) {
  let canWarn = true;
  const keepAlive = vi.fn(
    async (idleSeconds: number): Promise<SessionTiming> => ({
      expiresIn: 3600 - idleSeconds,
      limitReached: false,
    }),
  );
  const onWarning = vi.fn();
  const onExpire = vi.fn();
  const broadcast = vi.fn();
  const timer = createSessionTimer({
    keepAlive,
    isSessionOver: (error) => error === "session over",
    canWarn: () => canWarn,
    onWarning,
    onExpire,
    broadcast,
    ...options,
  });
  return {
    timer,
    keepAlive,
    onWarning,
    onExpire,
    broadcast,
    setCanWarn(value: boolean) {
      canWarn = value;
    },
  };
}

function lastWarning(onWarning: ReturnType<typeof vi.fn>) {
  return onWarning.mock.calls.at(-1)?.[0];
}

async function wait(minutes: number) {
  await vi.advanceTimersByTimeAsync(minutes * MINUTE);
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session timer", () => {
  it("warns 2 minutes before an idle session ends, then ends it once the server agrees", async () => {
    const { timer, onWarning, onExpire, keepAlive } = setup();
    timer.start(HOUR_LEFT, START);

    await wait(57.9);
    expect(onWarning).not.toHaveBeenCalled();

    await wait(0.1);
    expect(lastWarning(onWarning)).toEqual({
      endsAt: START + 60 * MINUTE,
      limitReached: false,
    });
    expect(keepAlive).not.toHaveBeenCalled();

    await wait(2);
    expect(keepAlive).toHaveBeenCalledExactlyOnceWith(60 * 60);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(lastWarning(onWarning)).toBeNull();
  });

  it("keeps going at the deadline when the server says another tab kept the session alive", async () => {
    const keepAlive = vi.fn(async () => ({
      expiresIn: 30 * 60,
      limitReached: false,
    }));
    const { timer, onWarning, onExpire } = setup({ keepAlive });
    timer.start(HOUR_LEFT, START);

    await wait(60);

    expect(keepAlive).toHaveBeenCalledOnce();
    expect(onExpire).not.toHaveBeenCalled();
    expect(lastWarning(onWarning)).toBeNull();
    await wait(28);
    expect(lastWarning(onWarning)).toEqual({
      endsAt: START + 90 * MINUTE,
      limitReached: false,
    });
  });

  it("ends the session at the deadline when the server can't be reached", async () => {
    const { timer, onExpire } = setup({
      keepAlive: () => Promise.reject(new Error("offline")),
    });
    timer.start(HOUR_LEFT, START);

    await wait(60);

    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("keeps timing after a keep-alive fails while the user is active", async () => {
    let fail: (reason: unknown) => void = () => {};
    const keepAlive = vi
      .fn<(idleSeconds: number) => Promise<SessionTiming>>()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      )
      .mockRejectedValue(new Error("offline"));
    const { timer, onExpire } = setup({ keepAlive });
    timer.start(HOUR_LEFT, START);
    vi.setSystemTime(START + 5 * MINUTE);
    timer.activity(Date.now());
    timer.activity(Date.now() + 1000);

    fail(new Error("offline"));
    await wait(56);

    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("sends a keep-alive for activity at most every 5 minutes", async () => {
    const { timer, keepAlive } = setup();
    timer.start(HOUR_LEFT, START);
    const activeAt = async (minutes: number) => {
      vi.setSystemTime(START + minutes * MINUTE);
      timer.activity(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    };

    await activeAt(1);
    await activeAt(4);
    expect(keepAlive).not.toHaveBeenCalled();

    await activeAt(5);
    await activeAt(9);
    expect(keepAlive).toHaveBeenCalledOnce();

    await activeAt(10);
    expect(keepAlive).toHaveBeenCalledTimes(2);
    expect(keepAlive).toHaveBeenLastCalledWith(0);
  });

  it("sends a keep-alive instead of warning when there was activity since the last one", async () => {
    const { timer, keepAlive, onWarning, onExpire } = setup();
    timer.start(HOUR_LEFT, START);
    timer.activity(START + 2 * MINUTE);

    await wait(58);

    expect(keepAlive).toHaveBeenCalledWith(56 * 60);
    expect(onWarning).not.toHaveBeenCalled();

    await wait(2);
    expect(lastWarning(onWarning)).toEqual({
      endsAt: START + 62 * MINUTE,
      limitReached: false,
    });
    await wait(2);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("keeps the session going each time Stay logged in is chosen", async () => {
    const { timer, keepAlive, onWarning, onExpire } = setup();
    timer.start(HOUR_LEFT, START);

    for (let round = 1; round <= 12; round += 1) {
      await wait(58);
      expect(lastWarning(onWarning)).toMatchObject({ limitReached: false });

      timer.stay();
      await vi.advanceTimersByTimeAsync(0);

      expect(lastWarning(onWarning)).toBeNull();
    }
    expect(keepAlive).toHaveBeenCalledTimes(12);
    expect(keepAlive).toHaveBeenLastCalledWith(0);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("can't extend a session that reached its hard limit", async () => {
    const keepAlive = vi.fn(async () => ({
      expiresIn: Math.max(0, (START + 10 * MINUTE - Date.now()) / 1000),
      limitReached: true,
    }));
    const { timer, onWarning, onExpire } = setup({ keepAlive });
    timer.start({ expiresIn: 600, limitReached: true }, START);
    timer.activity(START + 1 * MINUTE);

    await wait(8);

    expect(keepAlive).not.toHaveBeenCalled();
    expect(lastWarning(onWarning)).toEqual({
      endsAt: START + 10 * MINUTE,
      limitReached: true,
    });
    await wait(2);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("tells the other tabs about each keep-alive", async () => {
    const { timer, broadcast } = setup();
    timer.start(HOUR_LEFT, START);
    vi.setSystemTime(START + 5 * MINUTE);

    timer.activity(Date.now());
    await vi.advanceTimersByTimeAsync(0);

    expect(broadcast).toHaveBeenCalledWith({
      type: "extended",
      endsAt: START + 65 * MINUTE,
      limitReached: false,
      reportedActivity: START + 5 * MINUTE,
      sentAt: START + 5 * MINUTE,
    });
  });

  it("follows another tab's keep-alive, closing its own warning", async () => {
    const { timer, onWarning, keepAlive } = setup();
    timer.start(HOUR_LEFT, START);
    await wait(58);
    expect(lastWarning(onWarning)).not.toBeNull();

    timer.receive({
      type: "extended",
      endsAt: Date.now() + 60 * MINUTE,
      limitReached: false,
      reportedActivity: Date.now(),
      sentAt: Date.now(),
    });

    expect(lastWarning(onWarning)).toBeNull();
    await wait(57);
    expect(lastWarning(onWarning)).toBeNull();
    await wait(1);
    expect(lastWarning(onWarning)).not.toBeNull();
    expect(keepAlive).not.toHaveBeenCalled();
  });

  it("counts activity in another tab when the warning is due", async () => {
    const { timer, keepAlive, onWarning } = setup();
    timer.start(HOUR_LEFT, START);
    timer.receive({ type: "activity", at: START + 3 * MINUTE });

    await wait(58);

    expect(keepAlive).toHaveBeenCalledWith(55 * 60);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("ends the session when the tab comes back after it ran out and the server agrees", async () => {
    const { timer, onExpire, keepAlive } = setup();
    timer.start(HOUR_LEFT, START);
    vi.setSystemTime(START + 70 * MINUTE);

    timer.recheck();
    await vi.advanceTimersByTimeAsync(0);

    expect(keepAlive).toHaveBeenCalledExactlyOnceWith(70 * 60);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("checks with the server when the tab comes back, reporting the real idle time", () => {
    const { timer, keepAlive } = setup();
    timer.start(HOUR_LEFT, START);
    vi.setSystemTime(START + 20 * MINUTE);

    timer.recheck();
    timer.recheck();

    expect(keepAlive).toHaveBeenCalledOnce();
    expect(keepAlive).toHaveBeenCalledWith(20 * 60);
  });

  it("ends the session when a keep-alive finds it already over", async () => {
    const { timer, onExpire } = setup({
      keepAlive: () => Promise.reject("session over"),
    });
    timer.start(HOUR_LEFT, START);

    timer.activity(START + 5 * MINUTE);
    await vi.advanceTimersByTimeAsync(0);

    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("warns instead of trying again when a keep-alive can't reach the server", async () => {
    const keepAlive = vi.fn(() => Promise.reject(new Error("offline")));
    const { timer, onWarning, onExpire } = setup({ keepAlive });
    timer.start(HOUR_LEFT, START);
    timer.activity(START + 2 * MINUTE);

    await wait(58);

    expect(keepAlive).toHaveBeenCalledOnce();
    expect(lastWarning(onWarning)).toMatchObject({ limitReached: false });
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("doesn't warn on pages that don't need a login, where any activity near the end keeps it going", async () => {
    const { timer, onWarning, keepAlive, onExpire, setCanWarn } = setup();
    setCanWarn(false);
    timer.start(HOUR_LEFT, START);

    await wait(59);
    expect(onWarning).not.toHaveBeenCalled();

    timer.activity(Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(keepAlive).toHaveBeenCalledWith(0);

    await wait(60);
    expect(onWarning).not.toHaveBeenCalled();
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("doesn't keep pinging near a hard limit on pages without the warning", async () => {
    const keepAlive = vi.fn(async () => ({
      expiresIn: Math.max(0, (START + 10 * MINUTE - Date.now()) / 1000),
      limitReached: true,
    }));
    const { timer, setCanWarn } = setup({ keepAlive });
    setCanWarn(false);
    timer.start({ expiresIn: 600, limitReached: true }, START);
    await wait(9);

    for (let second = 0; second < 30; second += 1) {
      vi.setSystemTime(Date.now() + 1000);
      timer.activity(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    }

    expect(keepAlive).toHaveBeenCalledOnce();
  });

  it("tells the other tabs when it starts", () => {
    const { timer, broadcast } = setup();

    timer.start(HOUR_LEFT, START);

    expect(broadcast).toHaveBeenCalledWith({
      type: "extended",
      endsAt: START + 60 * MINUTE,
      limitReached: false,
      reportedActivity: START,
      sentAt: START,
    });
  });

  it("shows the warning when a page that needs a login opens in the last minutes", async () => {
    const { timer, onWarning, setCanWarn } = setup();
    setCanWarn(false);
    timer.start(HOUR_LEFT, START);
    await wait(59);

    setCanWarn(true);
    timer.pageChanged();

    expect(lastWarning(onWarning)).toEqual({
      endsAt: START + 60 * MINUTE,
      limitReached: false,
    });
  });

  it("does nothing once stopped", async () => {
    const { timer, onWarning, onExpire, keepAlive } = setup();
    timer.start(HOUR_LEFT, START);

    timer.stop();
    timer.activity(START + 10 * MINUTE);
    await wait(120);

    expect(onWarning).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
    expect(keepAlive).not.toHaveBeenCalled();
  });
});
