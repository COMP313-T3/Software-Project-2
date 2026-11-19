import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followChanges, forgetLiveChanges, updatesSocketUrl, type PageChange } from "./liveChanges.ts";
import { getRealtimeAccessToken } from "./sessionClient.ts";

vi.unmock("./liveChanges.ts");
vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ getRealtimeAccessToken: vi.fn() }));

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  handlers = new Map<string, Handler>();
  connected = false;
  connects = 0;
  credentials: unknown = null;
  /** What the server answers the next connection attempts with: a refusal, or nothing to accept it. */
  refusals: unknown[] = [];
  readonly url: string;
  readonly options: { auth: (callback: (value: unknown) => void) => void };

  constructor(url: string, options: FakeSocket["options"]) {
    this.url = url;
    this.options = options;
  }

  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
    return this;
  }

  receive(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  connect() {
    this.connects += 1;
    this.options.auth((value) => {
      this.credentials = value;
      const refusal = this.refusals.shift();
      if (refusal) {
        this.receive("connect_error", Object.assign(new Error("refused"), { data: refusal }));
        return;
      }
      this.connected = true;
      this.receive("connect");
    });
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }
}

let sockets: FakeSocket[];
let nextRefusals: unknown[];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function listen(userId = "user-one") {
  const heard: (PageChange[] | null)[] = [];
  const stop = followChanges(userId, (changes) => heard.push(changes));
  return { heard, stop };
}

beforeEach(() => {
  sockets = [];
  nextRefusals = [];
  vi.mocked(getRealtimeAccessToken).mockReset().mockResolvedValue("access-token");
  vi.mocked(io).mockReset().mockImplementation(((url: string, options: FakeSocket["options"]) => {
    const socket = new FakeSocket(url, options);
    socket.refusals = nextRefusals;
    sockets.push(socket);
    return socket;
  }) as unknown as typeof io);
});

afterEach(() => {
  forgetLiveChanges();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the live page updates' address", () => {
  it("is the page's own origin when the API isn't on another one", () => {
    expect(updatesSocketUrl("")).toBe("/updates");
  });

  it("is the API's origin when it's on another one", () => {
    expect(updatesSocketUrl("https://api.topsend.example/api")).toBe("https://api.topsend.example/updates");
  });
});

describe("following the live page updates", () => {
  it("connects with the user's access token when the first page listens", async () => {
    listen();
    await settle();

    expect(io).toHaveBeenCalledOnce();
    expect(sockets[0].url).toBe("/updates");
    expect(sockets[0].credentials).toEqual({ token: "access-token" });
    expect(sockets[0].connected).toBe(true);
  });

  it("tells the page what changed, with the competition when the server names it", async () => {
    const { heard } = listen();
    await settle();

    sockets[0].receive("updates:changed", {
      changes: [{ topic: "competitions", competitionId: "c1" }, { topic: "gyms" }],
    });

    expect(heard).toEqual([[{ topic: "competitions", competitionId: "c1" }, { topic: "gyms" }]]);
  });

  it("shares one connection between every page that listens", async () => {
    const first = listen();
    const second = listen();
    await settle();

    sockets[0].receive("updates:changed", { changes: [{ topic: "users" }] });

    expect(io).toHaveBeenCalledOnce();
    expect(first.heard).toEqual([[{ topic: "users" }]]);
    expect(second.heard).toEqual([[{ topic: "users" }]]);
  });

  it("stops telling a page that stopped listening", async () => {
    const first = listen();
    const second = listen();
    await settle();

    first.stop();
    sockets[0].receive("updates:changed", { changes: [{ topic: "users" }] });

    expect(first.heard).toEqual([]);
    expect(second.heard).toEqual([[{ topic: "users" }]]);
  });

  it("ignores a message that isn't a list of changes, and anything in one but its topic and competition", async () => {
    const { heard } = listen();
    await settle();

    sockets[0].receive("updates:changed", undefined);
    sockets[0].receive("updates:changed", { changes: "everything" });
    sockets[0].receive("updates:changed", { changes: [null, { competitionId: "c1" }, { topic: 7 }] });
    sockets[0].receive("updates:changed", { changes: [{ topic: "results", competitionId: 9, score: 500 }] });

    expect(heard).toEqual([[{ topic: "results" }]]);
  });

  it("keeps telling the other pages when one page's reload throws", async () => {
    followChanges("user-one", () => {
      throw new Error("page broke");
    });
    const { heard } = listen();
    await settle();

    sockets[0].receive("updates:changed", { changes: [{ topic: "gyms" }] });

    expect(heard).toEqual([[{ topic: "gyms" }]]);
  });
});

describe("keeping the connection between pages", () => {
  it("keeps it for the next page when the last page stops listening", async () => {
    vi.useFakeTimers();
    const first = listen();
    await vi.advanceTimersByTimeAsync(0);

    first.stop();
    await vi.advanceTimersByTimeAsync(500);
    const second = listen();
    await vi.advanceTimersByTimeAsync(5000);
    sockets[0].receive("updates:changed", { changes: [{ topic: "gyms" }] });

    expect(io).toHaveBeenCalledOnce();
    expect(sockets[0].connected).toBe(true);
    expect(second.heard).toEqual([[{ topic: "gyms" }]]);
  });

  it("closes it a moment after the last page stopped listening", async () => {
    vi.useFakeTimers();
    const { stop } = listen();
    await vi.advanceTimersByTimeAsync(0);

    stop();
    await vi.advanceTimersByTimeAsync(1100);

    expect(sockets[0].connected).toBe(false);
  });

  it("opens a new connection for the next page after it was closed", async () => {
    vi.useFakeTimers();
    const { stop } = listen();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(1100);

    listen();
    await vi.advanceTimersByTimeAsync(0);

    expect(io).toHaveBeenCalledTimes(2);
    expect(sockets[1].connected).toBe(true);
  });

  it("replaces a connection opened for another user", async () => {
    const before = listen("admin-one");
    await settle();
    before.stop();

    const after = listen("climber-two");
    await settle();
    sockets[0].receive("updates:changed", { changes: [{ topic: "users" }] });
    sockets[1].receive("updates:changed", { changes: [{ topic: "competitions" }] });

    expect(sockets[0].connected).toBe(false);
    expect(sockets[1].connected).toBe(true);
    expect(after.heard).toEqual([[{ topic: "competitions" }]]);
  });
});

describe("when the live page updates drop", () => {
  it("has every page reload once the connection is back, since changes may have been missed", async () => {
    const { heard } = listen();
    await settle();
    expect(heard).toEqual([]);

    sockets[0].receive("disconnect");
    sockets[0].receive("connect");

    expect(heard).toEqual([null]);
  });

  it("keeps the connection through a network problem, which Socket.IO retries by itself", async () => {
    const { heard } = listen();
    await settle();

    sockets[0].receive("connect_error", new Error("xhr poll error"));
    sockets[0].receive("updates:changed", { changes: [{ topic: "gyms" }] });

    expect(heard).toEqual([[{ topic: "gyms" }]]);
    expect(io).toHaveBeenCalledOnce();
  });

  it("renews an expired access token once and connects again", async () => {
    nextRefusals = [{ error: "TOKEN_EXPIRED", message: "Your login needs refreshing." }];
    const { heard } = listen();
    await settle();
    await settle();

    expect(getRealtimeAccessToken).toHaveBeenCalledWith(true);
    expect(sockets[0].connects).toBe(2);
    expect(sockets[0].connected).toBe(true);
    sockets[0].receive("updates:changed", { changes: [{ topic: "gyms" }] });
    expect(heard).toEqual([[{ topic: "gyms" }]]);
  });

  it("gives up when the renewed token is refused too", async () => {
    nextRefusals = [
      { error: "TOKEN_EXPIRED", message: "Your login needs refreshing." },
      { error: "TOKEN_EXPIRED", message: "Your login needs refreshing." },
    ];
    listen();
    await settle();
    await settle();

    expect(sockets[0].connects).toBe(2);
    expect(sockets[0].connected).toBe(false);
    expect(sockets[0].handlers.size).toBe(0);
  });

  it.each(["SESSION_EXPIRED", "ROLE_FORBIDDEN"])("stays closed when the server refuses it with %s", async (error) => {
    nextRefusals = [{ error, message: "No." }];
    listen();
    await settle();
    await settle();

    expect(sockets[0].connects).toBe(1);
    expect(sockets[0].handlers.size).toBe(0);
    expect(getRealtimeAccessToken).not.toHaveBeenCalledWith(true);
  });

  it("closes when the server says the login ended", async () => {
    const { heard } = listen();
    await settle();

    sockets[0].receive("updates:closed", { error: "SESSION_EXPIRED", message: "Your session expired." });

    expect(sockets[0].connected).toBe(false);
    expect(heard).toEqual([]);
  });

  it("closes when there's no access token to connect with", async () => {
    vi.mocked(getRealtimeAccessToken).mockRejectedValue(new Error("logged out"));
    listen();
    await settle();

    expect(sockets[0].connected).toBe(false);
    expect(sockets[0].handlers.size).toBe(0);
  });

  it("tries again for the next page after it gave up", async () => {
    nextRefusals = [{ error: "SESSION_EXPIRED", message: "No." }];
    const first = listen();
    await settle();
    first.stop();

    nextRefusals = [];
    listen();
    await settle();

    expect(io).toHaveBeenCalledTimes(2);
    expect(sockets[1].connected).toBe(true);
  });
});
