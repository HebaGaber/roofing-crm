// Selecting a property on the map (a marker, a result or candidate row, `?sel=`, "Open on map",
// "Show on map") centres the map on it, close enough to see it, in the part of the map the rep can
// see. Pure helpers: where the camera goes, and how much of the canvas is covered. The search pin
// and the radius are never touched.

/** The zoom a selected property is shown at, unless the map is already closer. */
export const FOCUS_ZOOM = 16;
/** The drawer's width from 1280 px (Map.module.css `.drawerSlot`); below it the drawer is a full-
 *  height sheet. */
export const DRAWER_WIDTH_PX = 440;
const FLY_DURATION_MS = 700;

export interface FocusPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** How much of the map canvas the rep cannot see once the drawer opens. From 1280 px the panes sit
 *  beside the map (they are not over it), so only the part of the 440 px right-edge drawer that
 *  reaches past the results pane covers it (`drawerOverlap`, measured; the whole drawer when the
 *  size is unknown), never more than two thirds. Below it the drawer is a full-height sheet that hides everything, so
 *  the marker is centred in the strip the results sheet leaves (right for when the drawer closes). */
export function focusPadding(input: {
  readonly wide: boolean;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly sheetHeight: number;
  /** Pixels of the map the drawer covers from 1280 px; defaults to the whole drawer width. */
  readonly drawerOverlap?: number;
}): FocusPadding {
  if (input.wide) {
    const cap = input.mapWidth > 0 ? Math.floor((input.mapWidth * 2) / 3) : DRAWER_WIDTH_PX;
    const overlap = Math.max(0, input.drawerOverlap ?? DRAWER_WIDTH_PX);
    return { top: 0, right: Math.min(overlap, cap), bottom: 0, left: 0 };
  }
  const cap = input.mapHeight > 0 ? Math.floor(input.mapHeight * 0.6) : input.sheetHeight;
  return { top: 0, right: 0, bottom: Math.min(Math.max(0, input.sheetHeight), cap), left: 0 };
}

export interface FocusCamera {
  readonly kind: "fly" | "jump";
  /** [lng, lat] */
  readonly center: [number, number];
  readonly zoom: number;
  readonly padding: FocusPadding;
  readonly duration: number;
}

/** The camera for a selected property: at least `FOCUS_ZOOM` (the current zoom when closer), flying
 *  smoothly, or jumping with `prefers-reduced-motion`. */
export function focusCamera(input: {
  readonly point: { readonly lat: number; readonly lng: number };
  readonly currentZoom: number;
  readonly padding: FocusPadding;
  readonly reducedMotion: boolean;
}): FocusCamera {
  return {
    kind: input.reducedMotion ? "jump" : "fly",
    center: [input.point.lng, input.point.lat],
    zoom: Math.max(input.currentZoom, FOCUS_ZOOM),
    padding: input.padding,
    duration: input.reducedMotion ? 0 : FLY_DURATION_MS,
  };
}
