import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CompetitionDisplayPage from "./CompetitionDisplayPage.tsx";
import { emptyDisplay, type DisplayGateway } from "../lib/displayCustomization.ts";
let role = "GYM_ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({ useSession: () => ({ user: { userId: "actor", role, email: "sample@example.com" } }) }));
const id = "507f1f77bcf86cd799439011";
let gateway: DisplayGateway;
const loader = vi.fn(async () => ({ _id: id, name: "Sample Open" }));
beforeEach(() => {
  role = "GYM_ADMIN"; loader.mockClear();
  gateway = { localPreviewFiles: true, load: vi.fn().mockResolvedValue({ competitionId: id, settings: emptyDisplay() }), save: vi.fn().mockImplementation(async (competitionId, settings) => ({ competitionId, settings })) };
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test-logo"), revokeObjectURL: vi.fn() }));
});
afterEach(cleanup);
function open(api: DisplayGateway | null = gateway) {
  return render(<MemoryRouter initialEntries={[`/gym-admin/competitions/${id}/display`]}><Routes><Route path="/gym-admin/competitions/:competitionId/display" element={<CompetitionDisplayPage gateway={api ?? undefined} loadCompetition={loader} />} /></Routes></MemoryRouter>);
}
async function ready() { await screen.findByRole("heading", { name: "Live preview" }); }
function selectLogo() { fireEvent.change(screen.getByLabelText("Local logo preview"), { target: { files: [new File(["test"], "logo.png", { type: "image/png" })] } }); }
it.each(["ADMIN", "CLIMBER", "VISITOR"])("blocks private settings for %s", async denied => { role = denied; open(); expect(screen.getByText("Gym administrator access required")).toBeTruthy(); expect(loader).not.toHaveBeenCalled(); });
it("loads selected competition's saved assets and preview", async () => {
  vi.mocked(gateway.load).mockResolvedValue({ competitionId: id, settings: { logo: { src: "https://example.com/logo.png", name: "Saved logo" }, background: null, sponsors: [{ src: "https://example.com/sponsor.png", name: "Saved sponsor" }] } });
  open(); await ready(); expect(screen.getByRole("img", { name: "Saved logo" })).toBeTruthy(); expect(screen.getByRole("img", { name: "Saved sponsor" })).toBeTruthy();
  expect(gateway.load).toHaveBeenCalledWith(id, expect.any(AbortSignal)); expect(screen.getByText(/Sample rankings for layout only/)).toBeTruthy();
});
it("updates logo preview immediately, saves the file through the boundary, then clears dirty state", async () => {
  open(); await ready(); selectLogo(); expect(screen.getByRole("img", { name: "logo.png" }).getAttribute("src")).toBe("blob:test-logo");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" })); await screen.findByText("Display settings saved.");
  expect(gateway.save).toHaveBeenCalledWith(id, expect.objectContaining({ logo: expect.objectContaining({ file: expect.any(File) }) }), expect.any(AbortSignal)); expect(screen.queryByText("Unsaved changes")).toBeNull();
});
it("discards changed assets and clears previews without saving", async () => {
  open(); await ready(); selectLogo(); fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.queryByRole("img", { name: "logo.png" })).toBeNull(); expect(gateway.save).not.toHaveBeenCalled();
});
it("rejects non-preview files without creating URLs", async () => {
  open(); await ready(); fireEvent.change(screen.getByLabelText("Local logo preview"), { target: { files: [new File(["test"], "bad.html", { type: "text/html" })] } });
  expect(await screen.findByText("Choose PNG, JPEG or WebP images for the preview.")).toBeTruthy(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("removes only the selected sponsor", async () => {
  vi.mocked(gateway.load).mockResolvedValue({ competitionId: id, settings: { ...emptyDisplay(), sponsors: [{ src: "https://example.com/a", name: "Sponsor A" }, { src: "https://example.com/b", name: "Sponsor B" }] } });
  open(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Remove sponsor 1: Sponsor A" })); expect(screen.queryByRole("img", { name: "Sponsor A" })).toBeNull(); expect(screen.getByRole("img", { name: "Sponsor B" })).toBeTruthy();
});
it("never announces a failed save as successful and preserves the draft", async () => {
  vi.mocked(gateway.save).mockRejectedValue(new Error("private details")); open(); await ready(); selectLogo(); fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert"); expect(screen.queryByText("Display settings saved.")).toBeNull(); expect(screen.getByRole("img", { name: "logo.png" })).toBeTruthy(); expect(screen.queryByText(/private details/)).toBeNull();
});
it("locks repeat saves until the server confirms", async () => {
  let finish!: (value: Awaited<ReturnType<DisplayGateway["save"]>>) => void;
  vi.mocked(gateway.save).mockReturnValue(new Promise(resolve => { finish = resolve; })); open(); await ready(); selectLogo(); fireEvent.click(screen.getByRole("button", { name: "Save changes" })); fireEvent.click(screen.getByRole("button", { name: "Saving…" })); expect(gateway.save).toHaveBeenCalledTimes(1);
  await act(async () => finish({ competitionId: id, settings: emptyDisplay() }));
});
it("does not apply a snapshot for another competition", async () => { vi.mocked(gateway.load).mockResolvedValue({ competitionId: "another", settings: emptyDisplay() }); open(); await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Live preview" })).toBeNull(); });
it("releases local image URLs on leaving the page", async () => { const mounted = open(); await ready(); selectLogo(); mounted.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-logo"); });
it("supports setting an existing image reference", async () => {
  open(); await ready(); fireEvent.change(screen.getByLabelText("Gym or event logo"), { target: { value: "https://example.com/new.png" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Preview image" })[0]);
  expect(screen.getByRole("img", { name: "Event logo" }).getAttribute("src")).toBe("https://example.com/new.png");
});
