// T015 (B-03, US1): "Use my location" (AC-1's GPS centre point, AC-2's denied/unavailable
// fallback). Every failure is an explicit, on-screen state — never a silent catch and never a
// blank map (constitution: a typed state, not an undefined one) — matching the prototype's
// CrmMapGpsDenied390 / CrmMapGpsUnavailable390 / CrmMapGpsOutside390 states (plan.md). Exact
// on-screen copy is confirmed against the design before G7 (testplans/B-03-test-cases.md GAP-2);
// this file asserts the behaviour and a close reading of the story's own wording in the meantime.
import { useCallback, useId, useState, type ReactElement } from "react";
import styles from "./GpsButton.module.css";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export type GpsState = "idle" | "locating" | "denied" | "unavailable" | "timeout" | "outsideCounty";

export interface GpsButtonProps {
  /** Called once a position is resolved and `isInCoverage` accepts it. */
  readonly onLocated: (point: LatLng) => void;
  /** AC-1's edge case 2 (outside Travis County): true when the point is inside the covered
   *  county. Defaults to "always inside" so a caller that has no coverage check yet still works. */
  readonly isInCoverage?: (point: LatLng) => boolean;
  /** Test-only seam: replaces `navigator.geolocation.getCurrentPosition` so Vitest never calls a
   *  real browser geolocation API. Defaults to `navigator.geolocation`. */
  readonly geolocation?: Pick<Geolocation, "getCurrentPosition">;
}

const STATE_TEXT: Readonly<Record<Exclude<GpsState, "idle">, string>> = {
  locating: "GPS: finding your location",
  denied: "GPS: location off, drop a pin instead",
  unavailable: "GPS: location unavailable, drop a pin instead",
  timeout: "GPS: location timed out, drop a pin instead",
  outsideCounty: "GPS: outside Travis County",
};

const STATE_NAME: Readonly<Record<Exclude<GpsState, "idle">, string>> = {
  locating: "CrmMapGpsLocating390",
  denied: "CrmMapGpsDenied390",
  unavailable: "CrmMapGpsUnavailable390",
  timeout: "CrmMapGpsTimeout390",
  outsideCounty: "CrmMapGpsOutside390",
};

export function GpsButton({
  onLocated,
  isInCoverage = () => true,
  geolocation,
}: GpsButtonProps): ReactElement {
  const [state, setState] = useState<GpsState>("idle");
  const id = useId();

  const handleClick = useCallback(() => {
    const geo =
      geolocation ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation);
    if (geo === undefined) {
      setState("unavailable");
      return;
    }
    setState("locating");
    geo.getCurrentPosition(
      (position) => {
        const point: LatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isInCoverage(point)) {
          setState("outsideCounty");
          return;
        }
        setState("idle");
        onLocated(point);
      },
      (error) => {
        // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
        if (error.code === 1) setState("denied");
        else if (error.code === 3) setState("timeout");
        else setState("unavailable");
      },
    );
  }, [geolocation, isInCoverage, onLocated]);

  const describedBy = state === "idle" ? undefined : `${id}-state`;

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        aria-describedby={describedBy}
      >
        Use my location
      </button>
      {state === "idle" ? null : (
        <p
          id={`${id}-state`}
          role={state === "locating" ? "status" : "alert"}
          data-state={STATE_NAME[state]}
          className={state === "locating" ? styles.locating : styles.error}
        >
          {STATE_TEXT[state]}
        </p>
      )}
    </div>
  );
}
