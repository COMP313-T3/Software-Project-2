import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAddressAt, findPlace } from "../lib/geocodeApi.ts";
import { loadGoogleMaps, suggestAddresses } from "../lib/googleMaps.ts";
import { createGym, getGym, listAdminCandidates, listGyms, updateGym, type GymDetails } from "../lib/gymsApi.ts";
import { fakeGoogleMaps } from "../test/fakeGoogleMaps.ts";
import GymDetailsPage from "./GymDetailsPage.tsx";
import GymsPage from "./GymsPage.tsx";

vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "admin-account", role: "ADMIN", email: "admin@example.com" } }),
}));
vi.mock("../lib/gymsApi.ts", () => ({
  createGym: vi.fn(), listGyms: vi.fn(), getGym: vi.fn(), updateGym: vi.fn(), deactivateGym: vi.fn(),
  assignGymAdmin: vi.fn(), removeGymAdmin: vi.fn(), activateGym: vi.fn(), listAdminCandidates: vi.fn(), getGymAdmin: vi.fn(),
}));
vi.mock("../lib/googleMaps.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/googleMaps.ts")>(),
  GOOGLE_MAPS_API_KEY: "key-for-tests",
  loadGoogleMaps: vi.fn(),
  newSuggestionSession: vi.fn(async () => ({})),
  suggestAddresses: vi.fn(),
}));
vi.mock("../lib/geocodeApi.ts", () => ({ findPlace: vi.fn(), findAddressAt: vi.fn() }));

const gymId = "507f1f77bcf86cd799439011";
const TORONTO = { lat: 43.6532, lng: -79.3832 };
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };
const BATHURST = {
  placeId: "place-bathurst",
  text: { text: "1 Bathurst St, Toronto, ON, Canada" },
  mainText: { text: "1 Bathurst St" },
  secondaryText: { text: "Toronto, ON, Canada" },
};
const FOUND = { address: "1 Bathurst St, Toronto, ON", postalCode: "M5V 3W8", country: "CA", location: HOGTOWN };
const DROPPED = { lat: 43.6455, lng: -79.4119 };
const FOUND_AT_DROP = { address: "100 Strachan Ave, Toronto, ON", postalCode: "M6K 3C3", country: "CA", location: DROPPED };
const gym: GymDetails = {
  gymId, name: "Hogtown Bouldering", location: "Toronto", status: "ACTIVE", coordinates: TORONTO, administrators: [],
};

let google = fakeGoogleMaps();

function openAddGym() {
  render(<MemoryRouter><GymsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Add gym" }));
}
async function openGymEditor(details: GymDetails = gym) {
  vi.mocked(getGym).mockResolvedValue(details);
  render(<MemoryRouter initialEntries={[`/admin/gyms/${gymId}`]}>
    <Routes><Route path="/admin/gyms/:gymId" element={<GymDetailsPage />} /></Routes>
  </MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Edit gym" }));
}
function locationInput() { return screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement; }
function typeLocation(value: string) { fireEvent.change(locationInput(), { target: { value } }); }
async function pickSuggestion() {
  typeLocation("1 Bath");
  fireEvent.click(await screen.findByRole("option", { name: /1 Bathurst St/ }));
  await waitFor(() => expect(locationInput().value).toBe(FOUND.address));
}
/** Opens Choose on map, drags the pin to DROPPED, and uses that spot once its address is found. */
async function dropPinOnMap(mapButton: string) {
  fireEvent.click(screen.getByRole("button", { name: mapButton }));
  const dialog = screen.getByRole("dialog", { name: "Choose the gym's location" });
  await within(dialog).findByText("1 Bathurst St, Toronto, ON, M5V 3W8");
  const marker = google.markers[0];
  act(() => {
    marker.position = DROPPED;
    marker.dispatchEvent(new Event("gmp-dragend"));
  });
  await within(dialog).findByText("100 Strachan Ave, Toronto, ON, M6K 3C3");
  fireEvent.click(within(dialog).getByRole("button", { name: "Use this location" }));
  return dialog;
}

beforeEach(() => {
  google = fakeGoogleMaps();
  vi.mocked(loadGoogleMaps).mockReset().mockResolvedValue(google.api);
  vi.mocked(suggestAddresses).mockReset().mockResolvedValue([BATHURST]);
  vi.mocked(findPlace).mockReset().mockResolvedValue(FOUND);
  vi.mocked(findAddressAt).mockReset().mockImplementation(async point => (point === DROPPED ? FOUND_AT_DROP : FOUND));
  vi.mocked(listGyms).mockReset().mockResolvedValue({ gyms: [], total: 0, page: 1, limit: 20 });
  vi.mocked(createGym).mockReset().mockResolvedValue({ gymId, name: "Hogtown Bouldering", location: FOUND.address, status: "ACTIVE" });
  vi.mocked(updateGym).mockReset().mockImplementation(async (_id, input) => ({ ...gym, ...input, coordinates: input.coordinates ?? null }));
  vi.mocked(listAdminCandidates).mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe("US-004 Add gym map pin", () => {
  it("saves the address and pin of a suggestion picked as the location is typed", async () => {
    openAddGym();
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: "Hogtown Bouldering" } });

    await pickSuggestion();

    expect(findPlace).toHaveBeenCalledWith("place-bathurst");
    expect(screen.getByRole("button", { name: "Pin saved. Edit on map" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    await screen.findByText("Hogtown Bouldering was added successfully.");
    expect(createGym).toHaveBeenCalledExactlyOnceWith({
      name: "Hogtown Bouldering", location: FOUND.address, status: "ACTIVE", coordinates: HOGTOWN,
    });
  });

  it("saves a pin chosen on the map, worded for the gym, with the address found there", async () => {
    openAddGym();
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: "Hogtown Bouldering" } });
    await pickSuggestion();

    const dialog = await dropPinOnMap("Pin saved. Edit on map");

    expect(within(dialog).getByText(/The gym's competitions use this pin on the map and in distance searches/)).toBeTruthy();
    expect(google.markers[0].title).toBe("The gym's location. Drag it, or click the map.");
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(locationInput().value).toBe(FOUND_AT_DROP.address);
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    await waitFor(() => expect(createGym).toHaveBeenCalledExactlyOnceWith({
      name: "Hogtown Bouldering", location: FOUND_AT_DROP.address, status: "ACTIVE", coordinates: DROPPED,
    }));
  });

  it("drops the pin when the location is typed again, and keeps the text required", async () => {
    openAddGym();
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: "Hogtown Bouldering" } });
    await pickSuggestion();

    typeLocation("");
    expect(screen.getByRole("button", { name: "Choose on map" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    const error = screen.getByText("Enter a location.");
    expect(error.getAttribute("role")).toBe("alert");
    expect(locationInput().getAttribute("aria-describedby")).toBe(error.id);
    expect(locationInput().getAttribute("aria-invalid")).toBe("true");

    typeLocation("Toronto");
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    await waitFor(() => expect(createGym).toHaveBeenCalledExactlyOnceWith({
      name: "Hogtown Bouldering", location: "Toronto", status: "ACTIVE",
    }));
  });
});

describe("US-005 Gym details map pin", () => {
  it("shows whether the gym has a map pin", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, coordinates: null });
    render(<MemoryRouter initialEntries={[`/admin/gyms/${gymId}`]}>
      <Routes><Route path="/admin/gyms/:gymId" element={<GymDetailsPage />} /></Routes>
    </MemoryRouter>);

    const term = await screen.findByText("Map pin");
    expect(term.nextElementSibling?.textContent).toBe("Not set");
  });

  it("removes the saved pin when the location is typed again", async () => {
    await openGymEditor();
    expect(screen.getByRole("button", { name: "Pin saved. Edit on map" })).toBeTruthy();

    typeLocation("Downtown Toronto");
    expect(screen.getByRole("button", { name: "Choose on map" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText("Gym details saved successfully.");
    expect(updateGym).toHaveBeenCalledExactlyOnceWith(
      gymId, { location: "Downtown Toronto", coordinates: null }, expect.any(AbortSignal),
    );
    expect(screen.getByText("Map pin").nextElementSibling?.textContent).toBe("Not set");
  });

  it("saves the address and pin of a picked suggestion", async () => {
    await openGymEditor({ ...gym, coordinates: null });

    await pickSuggestion();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText("Gym details saved successfully.");
    expect(updateGym).toHaveBeenCalledExactlyOnceWith(
      gymId, { location: FOUND.address, coordinates: HOGTOWN }, expect.any(AbortSignal),
    );
  });

  it("saves only the pin when it moves and the address stays the same", async () => {
    await openGymEditor({ ...gym, location: FOUND_AT_DROP.address });
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await dropPinOnMap("Pin saved. Edit on map");

    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await screen.findByText("Gym details saved successfully.");
    expect(updateGym).toHaveBeenCalledExactlyOnceWith(gymId, { coordinates: DROPPED }, expect.any(AbortSignal));
  });

  it("starts the map at the saved pin", async () => {
    await openGymEditor();

    fireEvent.click(screen.getByRole("button", { name: "Pin saved. Edit on map" }));

    await waitFor(() => expect(google.maps).toHaveLength(1));
    expect(google.maps[0].options.center).toEqual(TORONTO);
    expect(google.markers[0].position).toEqual(TORONTO);
  });
});
