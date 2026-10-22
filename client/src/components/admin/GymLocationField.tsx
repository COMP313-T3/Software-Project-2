import type { LatLngLiteral } from "../../lib/googleMaps.ts";
import AddressField from "../auth/AddressField.tsx";
import type { MapPickerText, PinnedLocation } from "../auth/MapPickerDialog.tsx";
import styles from "./GymLocationField.module.css";

const GYM_MAP_TEXT: MapPickerText = {
  title: "Choose the gym's location",
  help: "Drag the pin or click the map. The gym's competitions use this pin on the map and in distance searches.",
  pin: "The gym's location. Drag it, or click the map.",
  unavailable: "Google Maps couldn't load. Close this and type the address instead.",
};

const INPUT = {
  placeholder: "Start typing the gym's address",
  autoComplete: "off",
  maxLength: 200,
};

interface GymLocationFieldProps {
  /** The location as typed. */
  value: string;
  /** Called as the location is typed. */
  onChange: (value: string) => void;
  /** Called with the address and the pin after a suggestion or the map is used. */
  onPinned: (pinned: PinnedLocation) => void;
  /** The gym's map pin, if any. Typing in the field clears it. */
  pin: LatLngLiteral | null;
  /** Message shown under the field. */
  error?: string;
  inputRef?: (el: HTMLElement | null) => void;
}

/**
 * A gym's Location field for the Add gym and Edit gym forms: the sign-up address field, with
 * Google's address suggestions and Choose on map, worded for a gym and styled like the admin
 * forms. The location text is required and the pin is optional. Without a Google Maps key it's
 * a plain text field.
 */
export default function GymLocationField({
  value,
  onChange,
  onPinned,
  pin,
  error,
  inputRef,
}: GymLocationFieldProps) {
  return (
    <AddressField
      value={value}
      onChange={onChange}
      onPinned={onPinned}
      location={pin}
      error={error}
      inputRef={inputRef}
      label="Location"
      inputProps={INPUT}
      classes={styles}
      alertError
      mapText={GYM_MAP_TEXT}
    />
  );
}
