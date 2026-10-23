import AddressField from "../auth/AddressField.tsx";
import type { MapPickerText, PinnedLocation } from "../auth/MapPickerDialog.tsx";
import type { LatLngLiteral } from "../../lib/googleMaps.ts";
import styles from "./StartingPlaceField.module.css";

const PLACE_MAP_TEXT: MapPickerText = {
  title: "Choose a starting point",
  help: "Drag the pin or click the map. Distances to competitions are measured from here.",
  pin: "The starting point. Drag it, or click the map.",
  unavailable: "Google Maps couldn't load. Close this and choose another starting point.",
};

const INPUT = {
  placeholder: "Search for an address or place",
  autoComplete: "off",
  maxLength: 200,
};

interface StartingPlaceFieldProps {
  /** The place as typed or chosen. */
  value: string;
  /** Called as the place is typed. Typing means the place isn't chosen yet. */
  onChange: (value: string) => void;
  /** Called with the place's name and point once it's chosen from the suggestions or the map. */
  onChosen: (name: string, point: LatLngLiteral) => void;
  /** The chosen place's point, if any. */
  point: LatLngLiteral | null;
  /** Message shown under the field. */
  error?: string;
}

/** Four decimal places, about 11 m, which is plenty for distances to gyms. */
function rounded(point: LatLngLiteral): LatLngLiteral {
  return { lat: Number(point.lat.toFixed(4)), lng: Number(point.lng.toFixed(4)) };
}

/**
 * The place a search starts from on Discover competitions (US-025 criterion 6): the sign-up
 * address field, with Google's suggestions and Choose on map, worded for a starting point. Only
 * offered with a Google Maps key, since a typed place needs them to become a point.
 */
export default function StartingPlaceField({
  value,
  onChange,
  onChosen,
  point,
  error,
}: StartingPlaceFieldProps) {
  return (
    <AddressField
      value={value}
      onChange={onChange}
      onPinned={(pinned: PinnedLocation) =>
        onChosen(pinned.address?.trim() || "A point on the map", rounded(pinned.location))
      }
      location={point}
      error={error}
      hint={point ? `Starting from ${value || "a point on the map"}.` : "Pick a suggestion, or choose the point on the map."}
      label="Place"
      inputProps={INPUT}
      classes={styles}
      alertError
      mapText={PLACE_MAP_TEXT}
    />
  );
}
