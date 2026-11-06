import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LeaderboardAppearance from "./LeaderboardAppearance.tsx";
import { displayGateway, getPublicDisplay } from "../../lib/displaySettingsApi.ts";
vi.mock("../../lib/displaySettingsApi.ts", () => ({ displayGateway: { load: vi.fn() }, getPublicDisplay: vi.fn() }));
beforeEach(() => { vi.mocked(displayGateway.load).mockReset(); vi.mocked(getPublicDisplay).mockReset(); });
afterEach(cleanup);
it("renders public saved branding around unchanged standings", async () => {
  vi.mocked(getPublicDisplay).mockResolvedValue({ competitionId: "event", settings: { logo: { src: "https://example.com/logo.png", name: "Event logo" }, background: null, sponsors: [] } });
  render(<LeaderboardAppearance competitionId="event" managed={false} title="Open"><p>Official score 280</p></LeaderboardAppearance>);
  expect(await screen.findByRole("img", { name: "Event logo" })).toBeTruthy(); expect(screen.getByText("Official score 280")).toBeTruthy();
  expect(displayGateway.load).not.toHaveBeenCalled();
});
it("keeps official scores visible when branding cannot load", async () => {
  vi.mocked(getPublicDisplay).mockRejectedValue(new Error("offline"));
  render(<LeaderboardAppearance competitionId="event" managed={false} title="Open"><p>Official score 280</p></LeaderboardAppearance>);
  await screen.findByText(/Display images are unavailable/); expect(screen.getByText("Official score 280")).toBeTruthy();
});
it("uses the protected endpoint for a managed draft preview", async () => {
  vi.mocked(displayGateway.load).mockResolvedValue({ competitionId: "event", settings: { logo: null, background: null, sponsors: [] } });
  render(<LeaderboardAppearance competitionId="event" managed title="Open"><p>Standings</p></LeaderboardAppearance>);
  expect(displayGateway.load).toHaveBeenCalledWith("event", expect.any(AbortSignal)); expect(getPublicDisplay).not.toHaveBeenCalled();
});
