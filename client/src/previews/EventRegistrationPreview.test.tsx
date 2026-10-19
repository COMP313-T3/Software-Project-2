import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import * as sessionApi from "../lib/sessionApi.ts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.clearAllMocks(); fetchMock.mockReset().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function renderPreview(search = "") { return render(<MemoryRouter initialEntries={["/__preview/event-registration" + search]}><App /></MemoryRouter>); }
async function ready() { return screen.findByRole("heading", { name: "TopSend Preview Open" }); }
function scenario(value: string) { fireEvent.change(screen.getByLabelText("Preview scenario"), { target: { value } }); }

describe("US-028 isolated development preview", () => {
  it("renders with a clear sample-data banner without a login or any API call", async () => {
    renderPreview(); await ready(); expect(screen.getByText("Frontend preview — sample data only.")).toBeTruthy();
    expect(sessionApi.fetchCsrfToken).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("simulates confirmation without sending or saving a real registration", async () => {
    renderPreview(); await ready(); fireEvent.click(screen.getByRole("radio", { name: "Open division" }));
    fireEvent.click(screen.getByRole("button", { name: "Register for competition" }));
    expect(await screen.findByRole("heading", { name: "Registration confirmed" })).toBeTruthy(); expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload preview" })); expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Open division" })).toBeTruthy();
  });
  it.each(["closed", "full", "unknown", "empty", "ineligible"])("demonstrates disabled registration in scenario %s", async value => {
    renderPreview("?scenario=" + value); await ready(); expect((screen.getByRole("button", { name: "Register for competition" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows loading and error states and can return to the form", async () => {
    renderPreview("?scenario=loading"); expect(await screen.findByText("Loading event details…")).toBeTruthy();
    scenario("load-error"); expect(screen.getByRole("heading", { name: "Event unavailable" })).toBeTruthy();
    scenario("open"); await ready(); expect(screen.getByRole("form", { name: "Competition registration" })).toBeTruthy();
  });
  it("shows sample server validation and retains the chosen division", async () => {
    renderPreview("?scenario=submit-error"); await ready(); fireEvent.click(screen.getByRole("radio", { name: "Open division" }));
    fireEvent.click(screen.getByRole("button", { name: "Register for competition" }));
    expect(await screen.findByText("This is a sample validation error for the selected division.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Open division" }) as HTMLInputElement).checked).toBe(true); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels a pending preview when its scenario changes", async () => {
    renderPreview(); await ready(); fireEvent.click(screen.getByRole("radio", { name: "Open division" })); fireEvent.click(screen.getByRole("button", { name: "Register for competition" }));
    expect(screen.getByRole("button", { name: "Registering…" })).toBeTruthy(); scenario("closed");
    await waitFor(() => expect(screen.getByRole("button", { name: "Register for competition" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
