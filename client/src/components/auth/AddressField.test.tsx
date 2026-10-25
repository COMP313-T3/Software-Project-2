import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findPlace } from "../../lib/geocodeApi.ts";
import { suggestAddresses, type LatLngLiteral } from "../../lib/googleMaps.ts";
import AddressField from "./AddressField.tsx";
import type { PinnedLocation } from "./MapPickerDialog.tsx";

vi.mock("../../lib/googleMaps.ts", () => ({
  GOOGLE_MAPS_API_KEY: "key-for-tests",
  GOOGLE_MAP_ID: "DEMO_MAP_ID",
  newSuggestionSession: vi.fn(async () => ({})),
  suggestAddresses: vi.fn(),
  loadGoogleMaps: vi.fn(() => Promise.reject(new Error("offline"))),
  toLatLngLiteral: vi.fn(),
}));

vi.mock("../../lib/geocodeApi.ts", () => ({
  findPlace: vi.fn(),
  findAddressAt: vi.fn(),
}));

const QUEEN_STREET = {
  placeId: "place-queen",
  text: { text: "123 Queen St W, Toronto, ON, Canada" },
  mainText: { text: "123 Queen St W" },
  secondaryText: { text: "Toronto, ON, Canada" },
};
const FOUND = {
  address: "123 Queen Street West, Toronto, ON",
  postalCode: "M5H 2N2",
  country: "CA",
  location: { lat: 43.6513, lng: -79.3832 },
};

const pinned = vi.fn<(pinned: PinnedLocation) => void>();

function Harness() {
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<LatLngLiteral | null>(null);
  return (
    <AddressField
      value={address}
      onChange={(text) => {
        setAddress(text);
        setLocation(null);
      }}
      onPinned={(found) => {
        pinned(found);
        if (found.address) setAddress(found.address);
        setLocation(found.location);
      }}
      location={location}
    />
  );
}

function addressInput() {
  return screen.getByRole("combobox", { name: "Address" }) as HTMLInputElement;
}

beforeEach(() => {
  vi.mocked(suggestAddresses).mockResolvedValue([QUEEN_STREET]);
  vi.mocked(findPlace).mockResolvedValue(FOUND);
  pinned.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("AddressField", () => {
  it("suggests addresses with Google's credit and fills the form from the one picked", async () => {
    render(<Harness />);

    fireEvent.change(addressInput(), { target: { value: "123 Que" } });
    const list = await screen.findByRole("listbox", {
      name: "Address suggestions",
    });
    expect(screen.getByText("Google Maps")).toBeTruthy();
    expect(addressInput().getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(within(list).getByRole("option", { name: /123 Queen/ }));

    await vi.waitFor(() => expect(pinned).toHaveBeenCalledWith(FOUND));
    expect(findPlace).toHaveBeenCalledWith("place-queen");
    expect(addressInput().value).toBe("123 Queen Street West, Toronto, ON");
    expect(
      screen.getByRole("button", { name: "Pin saved. Edit on map" }),
    ).toBeTruthy();
  });

  it("picks a suggestion with the arrow keys and Enter", async () => {
    render(<Harness />);

    fireEvent.change(addressInput(), { target: { value: "123 Que" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(addressInput(), { key: "ArrowDown" });
    expect(addressInput().getAttribute("aria-activedescendant")).toBe(
      "addressSuggestions-0",
    );
    fireEvent.keyDown(addressInput(), { key: "Enter" });

    await vi.waitFor(() => expect(pinned).toHaveBeenCalledWith(FOUND));
  });

  it("waits for a few letters and drops the pin when the address is retyped", async () => {
    render(<Harness />);

    fireEvent.change(addressInput(), { target: { value: "12" } });
    expect(suggestAddresses).not.toHaveBeenCalled();

    fireEvent.change(addressInput(), { target: { value: "123 Que" } });
    fireEvent.click(await screen.findByRole("option", { name: /123 Queen/ }));
    await screen.findByRole("button", { name: "Pin saved. Edit on map" });

    fireEvent.change(addressInput(), { target: { value: "45 King St" } });
    expect(screen.getByRole("button", { name: "Choose on map" })).toBeTruthy();
  });

  it("opens the map pop-up and explains when Google Maps can't load", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Choose on map" }));

    const dialog = screen.getByRole("dialog", { name: "Choose your location" });
    expect(
      await within(dialog).findByText(/Google Maps couldn't load/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});
