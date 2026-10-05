import { useEffect, useRef, useState } from "react";
import { findAddressAt, type FoundLocation } from "../../lib/geocodeApi.ts";
import {
  GOOGLE_MAP_ID,
  loadGoogleMaps,
  toLatLngLiteral,
  type LatLngLiteral,
} from "../../lib/googleMaps.ts";
import styles from "./MapPickerDialog.module.css";

const TORONTO: LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
const LOOKUP_DELAY_MS = 400;
const LOCATE_TIMEOUT_MS = 10_000;

/** A pin dropped on the map, with whatever address Google found for it. */
export type PinnedLocation = Partial<Omit<FoundLocation, "location">> & {
  location: LatLngLiteral;
};

interface MapPickerDialogProps {
  open: boolean;
  /** Where the pin starts: the saved pin, or Toronto when there is none. */
  start: LatLngLiteral | null;
  onClose: () => void;
  onConfirm: (pinned: PinnedLocation) => void;
}

type MapState = "loading" | "ready" | "failed";

/**
 * Pop-up map for choosing a location: drag the pin or click the map, or use the device's
 * location. The map only loads when the pop-up opens. Give it a new key each time it opens so
 * it starts fresh.
 */
export default function MapPickerDialog({
  open,
  start,
  onClose,
  onConfirm,
}: MapPickerDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const moveTo = useRef<(position: LatLngLiteral) => void>(() => undefined);
  const [state, setState] = useState<MapState>("loading");
  const [pin, setPin] = useState<LatLngLiteral>(start ?? TORONTO);
  const [lookup, setLookup] = useState<{
    pin: LatLngLiteral;
    found: FoundLocation | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const found = lookup?.pin === pin ? lookup.found : null;
  const looking = lookup?.pin !== pin;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open || !mapElement.current) return;
    const container = mapElement.current;
    const first = start ?? TORONTO;
    let active = true;

    async function build() {
      const maps = await loadGoogleMaps();
      const [{ Map }, { AdvancedMarkerElement }, { ColorScheme }] =
        await Promise.all([
          maps.importLibrary("maps"),
          maps.importLibrary("marker"),
          maps.importLibrary("core"),
        ]);
      if (!active) return;

      const map = new Map(container, {
        center: first,
        zoom: start ? 15 : 11,
        mapId: GOOGLE_MAP_ID,
        colorScheme: ColorScheme.DARK,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      const marker = new AdvancedMarkerElement({
        map,
        position: first,
        gmpDraggable: true,
        title: "Your location. Drag it, or click the map.",
      });

      moveTo.current = (position) => {
        marker.position = position;
        map.panTo(position);
        setPin(position);
      };
      marker.addEventListener("gmp-dragend", () => {
        const position = toLatLngLiteral(marker.position);
        if (position) setPin(position);
      });
      map.addListener("click", (event) => {
        const position = toLatLngLiteral(event.latLng);
        if (position) moveTo.current(position);
      });
      setState("ready");
    }

    build().catch(() => {
      if (active) setState("failed");
    });

    return () => {
      active = false;
      moveTo.current = () => undefined;
      container.replaceChildren();
    };
  }, [open, start]);

  useEffect(() => {
    if (!open || state !== "ready") return;
    let active = true;
    const timer = window.setTimeout(() => {
      findAddressAt(pin)
        .catch(() => null)
        .then((result) => {
          if (active) setLookup({ pin, found: result });
        });
    }, LOOKUP_DELAY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, state, pin]);

  function locateDevice() {
    if (!("geolocation" in navigator)) {
      setNote("This device can't share its location. Drag the pin instead.");
      return;
    }
    setNote("Finding you...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNote("");
        moveTo.current({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => setNote("We couldn't get your location. Drag the pin instead."),
      { timeout: LOCATE_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }

  function confirm() {
    onConfirm({
      location: pin,
      address: found?.address,
      postalCode: found?.postalCode,
      country: found?.country,
    });
  }

  let addressLine = "Looking up the address...";
  if (!looking) {
    addressLine = found
      ? [found.address, found.postalCode].filter(Boolean).join(", ")
      : "No address found here. You can still use this spot.";
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="mapPickerTitle"
      onClose={onClose}
    >
      <div className={styles.header}>
        <h2 id="mapPickerTitle">Choose your location</h2>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.help}>
        Drag the pin or click the map. We use it to suggest competitions near
        you.
      </p>
      <div className={styles.mapArea}>
        <div ref={mapElement} className={styles.map} />
        {state !== "ready" && (
          <p className={styles.mapState} role="status">
            {state === "loading"
              ? "Loading the map..."
              : "Google Maps couldn't load. Close this and type your address instead."}
          </p>
        )}
      </div>
      <p className={styles.found} aria-live="polite">
        {state === "ready" ? addressLine : ""}
      </p>
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={locateDevice}
          disabled={state !== "ready"}
        >
          Use my current location
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={confirm}
          disabled={state !== "ready"}
        >
          Use this location
        </button>
      </div>
    </dialog>
  );
}
