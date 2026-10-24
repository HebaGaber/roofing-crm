// The map's view switch (boards CrmMap1440 and CrmMap390): "Map + cards" or "List", a two-way
// segmented control. Render-only; Map.tsx owns the `view` URL key (Candidates/useMapViewParam).
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import type { MapView } from "./Candidates/index.js";
import styles from "./ViewToggle.module.css";

export interface ViewToggleProps {
  readonly view: MapView;
  readonly onChange: (view: MapView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps): ReactElement {
  return (
    <div role="group" aria-label="View" className={styles.group}>
      <button
        type="button"
        className={`${styles.segment} ${view === "map" ? styles.on : ""}`}
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
      >
        <Icon name="map" size="medium" />
        <span className={styles.label}>Map + cards</span>
      </button>
      <button
        type="button"
        className={`${styles.segment} ${view === "list" ? styles.on : ""}`}
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <Icon name="table_rows" size="medium" />
        <span className={styles.label}>List</span>
      </button>
    </div>
  );
}
