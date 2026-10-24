// The map's mode chips (boards CrmMap1440 and CrmAsk*): Map | AI. Filters is the toolbar's own
// Filters button (it opens the phone sheet through `mode=filters`), so it is not repeated here.
// Names carry "mode" so they never collide with the Filters button or the Map + cards toggle.
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import type { MapMode } from "./mapMode.js";
import styles from "./ViewToggle.module.css";

export function ModeChips({
  mode,
  onChange,
}: {
  readonly mode: MapMode;
  readonly onChange: (mode: MapMode) => void;
}): ReactElement {
  const ai = mode === "ai";
  return (
    <div role="group" aria-label="Mode" className={styles.group}>
      <button
        type="button"
        className={`${styles.segment} ${ai ? "" : styles.on}`}
        aria-pressed={!ai}
        aria-label="Map mode"
        onClick={() => onChange("map")}
      >
        <Icon name="map" size="medium" />
        <span className={styles.label}>Map</span>
      </button>
      <button
        type="button"
        className={`${styles.segment} ${ai ? styles.on : ""}`}
        aria-pressed={ai}
        aria-label="AI mode"
        onClick={() => onChange("ai")}
      >
        <Icon name="auto_awesome" size="medium" />
        <span className={styles.label}>AI</span>
      </button>
    </div>
  );
}
