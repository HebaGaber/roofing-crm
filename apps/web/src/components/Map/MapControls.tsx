// B-03 map controls (CRM-HANDOFF §4.2/§10 keyboard model A-4): zoom +/- and a recentre control,
// stacked top-right of the map the way every CrmMap board shows them. Drives the live MapLibre
// instance through CrmMap's own imperative handle (CrmMap.tsx) — never a second source of truth
// for zoom/center. Render-only.
import { IconButton } from "@crm/ui";
import type { ReactElement } from "react";
import type { CrmMapHandle } from "./CrmMap.js";
import styles from "./MapControls.module.css";

export interface MapControlsProps {
  readonly mapRef: { readonly current: CrmMapHandle | null };
  /** "Recentre" — E-67: with a pin/GPS point, re-fits that view; with none, returns to the
   *  whole-county view. */
  readonly recenterLabel?: string;
}

export function MapControls({
  mapRef,
  recenterLabel = "Recentre",
}: MapControlsProps): ReactElement {
  return (
    <div className={styles.stack}>
      <IconButton icon="add" label="Zoom in" onClick={() => mapRef.current?.zoomIn()} />
      <IconButton icon="remove" label="Zoom out" onClick={() => mapRef.current?.zoomOut()} />
      <IconButton
        icon="my_location"
        label={recenterLabel}
        onClick={() => mapRef.current?.recenter()}
      />
    </div>
  );
}
