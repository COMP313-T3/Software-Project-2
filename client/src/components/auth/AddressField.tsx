import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { findPlace } from "../../lib/geocodeApi.ts";
import {
  GOOGLE_MAPS_API_KEY,
  newSuggestionSession,
  suggestAddresses,
  type LatLngLiteral,
  type PlacePrediction,
} from "../../lib/googleMaps.ts";
import styles from "./AuthForm.module.css";
import MapPickerDialog, { type PinnedLocation } from "./MapPickerDialog.tsx";

const SUGGEST_DELAY_MS = 250;
const MIN_LETTERS = 3;
const LIST_ID = "addressSuggestions";

interface AddressFieldProps {
  value: string;
  /** Called as the address is typed. */
  onChange: (value: string) => void;
  /** Called with the address parts and the pin after a suggestion or the map is used. */
  onPinned: (pinned: PinnedLocation) => void;
  /** The saved pin, if any. Typing a new address clears it. */
  location: LatLngLiteral | null;
  /** Message shown under the field. */
  error?: string;
  inputRef?: (el: HTMLElement | null) => void;
}

/**
 * Address input with Google's suggestions as you type and a Choose on map button. Without a
 * Google Maps key it's a plain text input.
 */
export default function AddressField({
  value,
  onChange,
  onPinned,
  location,
  error,
  inputRef,
}: AddressFieldProps) {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSession, setMapSession] = useState(0);
  const session = useRef<object | null>(null);
  const latestQuery = useRef("");
  const timer = useRef(0);
  const mapsEnabled = GOOGLE_MAPS_API_KEY !== "";

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function lookUp(query: string) {
    try {
      session.current ??= await newSuggestionSession();
      const results = await suggestAddresses(query, session.current);
      if (latestQuery.current !== query) return;
      setSuggestions(results);
      setHighlighted(-1);
      setOpen(results.length > 0);
    } catch {
      setOpen(false);
    }
  }

  function type(text: string) {
    onChange(text);
    window.clearTimeout(timer.current);
    latestQuery.current = text.trim();
    if (!mapsEnabled || latestQuery.current.length < MIN_LETTERS) {
      setOpen(false);
      return;
    }
    const query = latestQuery.current;
    timer.current = window.setTimeout(() => {
      void lookUp(query);
    }, SUGGEST_DELAY_MS);
  }

  async function choose(prediction: PlacePrediction) {
    setOpen(false);
    session.current = null;
    latestQuery.current = "";
    onChange(prediction.text.text);
    try {
      const found = await findPlace(prediction.placeId);
      if (found) onPinned(found);
    } catch {
      return;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted(
        (current) => (current + step + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" && highlighted >= 0) {
      event.preventDefault();
      void choose(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor="address">Address</label>
        {mapsEnabled && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setMapSession((session) => session + 1);
              setMapOpen(true);
            }}
          >
            {location ? "Pin saved. Edit on map" : "Choose on map"}
          </button>
        )}
      </div>
      <div className={styles.combo}>
        <input
          ref={inputRef}
          id="address"
          name="address"
          autoComplete="street-address"
          placeholder="Start typing your street and city"
          role={mapsEnabled ? "combobox" : undefined}
          aria-autocomplete={mapsEnabled ? "list" : undefined}
          aria-expanded={mapsEnabled ? open : undefined}
          aria-controls={mapsEnabled ? LIST_ID : undefined}
          aria-activedescendant={
            open && highlighted >= 0 ? `${LIST_ID}-${highlighted}` : undefined
          }
          aria-describedby="addressError"
          aria-invalid={error ? true : undefined}
          required
          value={value}
          onChange={(event) => type(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
        {open && (
          <div className={styles.suggestions}>
            <ul id={LIST_ID} role="listbox" aria-label="Address suggestions">
              {suggestions.map((prediction, index) => (
                <li
                  key={prediction.placeId}
                  id={`${LIST_ID}-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void choose(prediction)}
                  onMouseEnter={() => setHighlighted(index)}
                >
                  <span className={styles.suggestionMain}>
                    {prediction.mainText?.text ?? prediction.text.text}
                  </span>
                  {prediction.secondaryText && (
                    <span className={styles.suggestionMore}>
                      {prediction.secondaryText.text}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className={styles.attribution}>Google Maps</p>
          </div>
        )}
      </div>
      <span className={styles.error} id="addressError">
        {error}
      </span>
      {mapsEnabled && (
        <MapPickerDialog
          key={mapSession}
          open={mapOpen}
          start={location}
          onClose={() => setMapOpen(false)}
          onConfirm={(pinned) => {
            setMapOpen(false);
            onPinned(pinned);
          }}
        />
      )}
    </div>
  );
}
