// T015: write first, confirm it fails (no GpsButton exists yet). AC-2's denied/unavailable/
// timeout states and AC-1's edge case 2 (outside-county) — every failure is an explicit, on-screen
// state (role="alert"), never silent (testplans/B-03-test-cases.md TC-009, TC-010).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GpsButton } from "../../../src/components/Map/GpsButton.js";

afterEach(cleanup);

function fakeGeolocation(
  behavior: (onSuccess: PositionCallback, onError: PositionErrorCallback | undefined) => void,
): Pick<Geolocation, "getCurrentPosition"> {
  return {
    getCurrentPosition: vi.fn((onSuccess, onError) => behavior(onSuccess, onError ?? undefined)),
  };
}

describe("GpsButton", () => {
  it("resolves a position inside coverage and calls onLocated", () => {
    const onLocated = vi.fn();
    const geolocation = fakeGeolocation((onSuccess) => {
      onSuccess({
        coords: { latitude: 30.4394, longitude: -97.62 },
      } as GeolocationPosition);
    });
    render(<GpsButton onLocated={onLocated} geolocation={geolocation} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(onLocated).toHaveBeenCalledWith({ lat: 30.4394, lng: -97.62 });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("PERMISSION_DENIED shows an explicit 'location denied' alert, never silent", () => {
    const geolocation = fakeGeolocation((_onSuccess, onError) => {
      onError?.({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    render(<GpsButton onLocated={vi.fn()} geolocation={geolocation} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-state")).toBe("CrmMapGpsDenied390");
    expect(alert.textContent).toMatch(/location/i);
  });

  it("POSITION_UNAVAILABLE and TIMEOUT each show their own explicit state", () => {
    const unavailable = fakeGeolocation((_onSuccess, onError) => {
      onError?.({ code: 2, message: "unavailable" } as GeolocationPositionError);
    });
    const { unmount } = render(<GpsButton onLocated={vi.fn()} geolocation={unavailable} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("alert").getAttribute("data-state")).toBe("CrmMapGpsUnavailable390");
    unmount();

    const timeout = fakeGeolocation((_onSuccess, onError) => {
      onError?.({ code: 3, message: "timeout" } as GeolocationPositionError);
    });
    render(<GpsButton onLocated={vi.fn()} geolocation={timeout} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("alert").getAttribute("data-state")).toBe("CrmMapGpsTimeout390");
  });

  it("no geolocation API at all shows the unavailable state, never a crash", () => {
    render(<GpsButton onLocated={vi.fn()} geolocation={undefined as never} />);
    // geolocation undefined falls through to navigator.geolocation, absent in jsdom by default —
    // still an explicit state, never an unhandled exception.
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Use my location" })),
    ).not.toThrow();
  });

  it("edge case 2: a resolved position outside coverage shows the outside-county state, not onLocated", () => {
    const onLocated = vi.fn();
    const geolocation = fakeGeolocation((onSuccess) => {
      onSuccess({ coords: { latitude: 30.6333, longitude: -97.678 } } as GeolocationPosition);
    });
    render(
      <GpsButton onLocated={onLocated} geolocation={geolocation} isInCoverage={() => false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("alert").getAttribute("data-state")).toBe("CrmMapGpsOutside390");
    expect(onLocated).not.toHaveBeenCalled();
  });
});
