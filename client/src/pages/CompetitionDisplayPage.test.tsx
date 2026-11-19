import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CompetitionDisplayPage from "./CompetitionDisplayPage.tsx";
import { backgroundImage } from "../lib/displayBackgrounds.ts";
import { emptyDisplay, type DisplayGateway } from "../lib/displayCustomization.ts";
import { liveUpdates } from "../test/liveUpdates.ts";
let role = "GYM_ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({ useSession: () => ({ user: { userId: "actor", role, email: "sample@example.com" } }) }));
const id = "507f1f77bcf86cd799439011";
let gateway: DisplayGateway;
const loader = vi.fn(async () => ({ _id: id, name: "Sample Open" }));
const savedLogo = { competitionId: id, settings: { ...emptyDisplay(), logo: { src: "https://example.com/logo.png", name: "Saved logo" } } };
const changed = [{ topic: "competitions", competitionId: id }];
let live: ReturnType<typeof liveUpdates>;
beforeEach(() => {
  live = liveUpdates();
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
it("follows the settings another Gym Admin saves", async () => {
  open(); await ready(); vi.mocked(gateway.load).mockResolvedValue(savedLogo); await live.announce(changed);
  expect(await screen.findByRole("img", { name: "Saved logo" })).toBeTruthy(); expect(screen.queryByText("Unsaved changes")).toBeNull();
  expect(screen.queryByText("Loading display settings…")).toBeNull();
});
it("doesn't reload over a preview with unsaved changes, and reloads once they're discarded", async () => {
  open(); await ready(); selectLogo(); vi.mocked(gateway.load).mockResolvedValue(savedLogo); await live.announce(changed);
  expect(gateway.load).toHaveBeenCalledOnce(); expect(screen.getByRole("img", { name: "logo.png" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" })); expect(await screen.findByRole("img", { name: "Saved logo" })).toBeTruthy();
});
it("keeps the settings when a reload fails, and ignores another competition's changes", async () => {
  vi.mocked(gateway.load).mockResolvedValueOnce(savedLogo); open(); await screen.findByRole("img", { name: "Saved logo" });
  await live.announce([{ topic: "competitions", competitionId: "507f1f77bcf86cd799439099" }]); expect(gateway.load).toHaveBeenCalledOnce();
  vi.mocked(gateway.load).mockRejectedValueOnce(new Error("offline")); await live.announce(null); await waitFor(() => expect(gateway.load).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("img", { name: "Saved logo" })).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
});
it("replaces the preview with the saved settings when asked after a failed save", async () => {
  vi.mocked(gateway.save).mockRejectedValue(new Error("lost answer")); open(); await ready(); selectLogo(); fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert"); vi.mocked(gateway.load).mockResolvedValue(savedLogo);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved settings" }));
  expect(await screen.findByRole("img", { name: "Saved logo" })).toBeTruthy(); expect(screen.queryByRole("img", { name: "logo.png" })).toBeNull();
  expect(screen.queryByText("Unsaved changes")).toBeNull();
});
it("does not apply a snapshot for another competition", async () => { vi.mocked(gateway.load).mockResolvedValue({ competitionId: "another", settings: emptyDisplay() }); open(); await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Live preview" })).toBeNull(); });
it("releases local image URLs on leaving the page", async () => { const mounted = open(); await ready(); selectLogo(); mounted.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-logo"); });
it("supports setting an existing image reference", async () => {
  open(); await ready(); fireEvent.change(screen.getByLabelText("Gym or event logo"), { target: { value: "https://example.com/new.png" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Preview image" })[0]);
  expect(screen.getByRole("img", { name: "Event logo" }).getAttribute("src")).toBe("https://example.com/new.png");
});
it("offers TopSend's own backgrounds, with plain white as the default and nothing to upload", async () => {
  open(); await ready();
  const picker = within(screen.getByRole("group", { name: "Display background" }));
  expect(picker.getAllByRole("radio").map(radio => radio.closest("label")?.textContent)).toEqual(["Plain white", "Mountains", "Sea", "Jungle", "Forest", "Desert", "Night sky"]);
  expect((picker.getByRole("radio", { name: "Plain white" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByLabelText("Local background preview")).toBeNull();
  expect(document.getElementById("reference-background")).toBeNull();
});
it("previews and saves a chosen background by its name", async () => {
  open(); await ready();
  fireEvent.click(screen.getByRole("radio", { name: "Jungle" }));
  expect([...document.querySelectorAll("img")].some(image => image.getAttribute("src")?.includes("jungle"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" })); await screen.findByText("Display settings saved.");
  expect(gateway.save).toHaveBeenCalledWith(id, expect.objectContaining({ background: expect.objectContaining({ reference: "jungle" }) }), expect.any(AbortSignal));
});
it("shows the saved background as chosen, and plain white removes it", async () => {
  vi.mocked(gateway.load).mockResolvedValue({ competitionId: id, settings: { ...emptyDisplay(), background: backgroundImage("sea") } });
  open(); await ready();
  expect((screen.getByRole("radio", { name: "Sea" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Plain white" }));
  expect(screen.getByText("Unsaved changes")).toBeTruthy();
  expect([...document.querySelectorAll("img")].some(image => image.getAttribute("src")?.includes("sea"))).toBe(false);
});

