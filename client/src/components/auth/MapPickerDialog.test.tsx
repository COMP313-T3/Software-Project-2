import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAddressAt } from "../../lib/geocodeApi.ts";
import { loadGoogleMaps, type LatLngLiteral } from "../../lib/googleMaps.ts";
import { fakeGoogleMaps } from "../../test/fakeGoogleMaps.ts";
import AddressField from "./AddressField.tsx";
import type { MapPickerText } from "./MapPickerDialog.tsx";

vi.mock("../../lib/googleMaps.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/googleMaps.ts")>()),
  GOOGLE_MAPS_API_KEY: "key-for-tests",
  loadGoogleMaps: vi.fn(),
  newSuggestionSession: vi.fn(async () => ({})),
  suggestAddresses: vi.fn(async () => []),
}));
vi.mock("../../lib/geocodeApi.ts", () => ({ findPlace: vi.fn(), findAddressAt: vi.fn() }));

const GYM_TEXT: MapPickerText = {
  title: "Choose the gym's location",
  help: "Drag the pin or click the map to fill in the gym's address.",
  pin: "The gym's location. Drag it, or click the map.",
  unavailable: "Google Maps couldn't load. Close this and type the address instead.",
};
const LAKE: LatLngLiteral = { lat: 43.62, lng: -79.37 };
const FOUND = { address: "1 Bathurst St, Toronto, ON", postalCode: "M5V 3W8", country: "CA", location: { lat: 43.6383, lng: -79.4006 } };

let google = fakeGoogleMaps();

function addressFields(needsAddress: boolean, onPinned = vi.fn()) {
  render(
    <>
      <AddressField value="" onChange={() => undefined} onPinned={() => undefined} location={null} />
      <AddressField
        id="requestGymAddress"
        label="Gym address"
        value=""
        onChange={() => undefined}
        onPinned={onPinned}
        location={null}
        mapText={GYM_TEXT}
        mapNeedsAddress={needsAddress}
      />
    </>,
  );
  return onPinned;
}

async function openGymMap() {
  fireEvent.click(screen.getAllByRole("button", { name: "Choose on map" })[1]);
  const dialog = screen.getByRole("dialog", { name: "Choose the gym's location" });
  await within(dialog).findByText("1 Bathurst St, Toronto, ON, M5V 3W8");
  return dialog;
}

function dragPinTo(position: LatLngLiteral) {
  const marker = google.markers[0];
  act(() => {
    marker.position = position;
    marker.dispatchEvent(new Event("gmp-dragend"));
  });
}

beforeEach(() => {
  google = fakeGoogleMaps();
  vi.mocked(loadGoogleMaps).mockReset().mockResolvedValue(google.api);
  vi.mocked(findAddressAt).mockReset().mockImplementation(async (point) => (point === LAKE ? null : FOUND));
});
afterEach(cleanup);

describe("Map pop-up", () => {
  it("has its own title, so two address fields on a page each name their own pop-up", async () => {
    addressFields(false);

    const dialog = await openGymMap();

    const titles = Array.from(document.querySelectorAll("dialog"), (element) => element.getAttribute("aria-labelledby"));
    expect(new Set(titles).size).toBe(2);
    expect(within(dialog).getByRole("heading", { name: "Choose the gym's location" }).id).toBe(dialog.getAttribute("aria-labelledby"));
  });

  it("keeps Use this location off where no address is found, for a form that keeps only the address", async () => {
    const pinned = addressFields(true);
    const dialog = await openGymMap();
    const use = within(dialog).getByRole("button", { name: "Use this location" }) as HTMLButtonElement;
    expect(use.disabled).toBe(false);

    dragPinTo(LAKE);
    expect(use.disabled).toBe(true);
    expect(await within(dialog).findByText("No address found here. Move the pin onto a building.")).toBeTruthy();
    expect(use.disabled).toBe(true);
    fireEvent.click(use);
    expect(pinned).not.toHaveBeenCalled();

    dragPinTo(FOUND.location);
    await within(dialog).findByText("1 Bathurst St, Toronto, ON, M5V 3W8");
    fireEvent.click(use);
    expect(pinned).toHaveBeenCalledWith(expect.objectContaining({ address: FOUND.address }));
    expect(screen.getAllByRole("button", { name: "Choose on map" })).toHaveLength(2);
  });

  it("still lets a form that keeps the pin use a spot with no address", async () => {
    const pinned = addressFields(false);
    const dialog = await openGymMap();

    dragPinTo(LAKE);
    expect(await within(dialog).findByText("No address found here. You can still use this spot.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use this location" }));
    expect(pinned).toHaveBeenCalledWith({ location: LAKE, address: undefined, postalCode: undefined, country: undefined });
  });
});
