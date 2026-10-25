// The one segmented control above the map at three-pane widths (PO review): Map + cards | List |
// Ask AI, aria-pressed buttons in one group, exactly one selected, 48 px targets. Below those
// widths the phone toolbar keeps its two controls (ViewToggle and ModeChips).
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import styles from "./ViewToggle.module.css";

export type MapViewChoice = "cards" | "list" | "ai";

const OPTIONS: readonly { value: MapViewChoice; label: string; icon: string }[] = [
  { value: "cards", label: "Map + cards", icon: "map" },
  { value: "list", label: "List", icon: "table_rows" },
  { value: "ai", label: "Ask AI", icon: "auto_awesome" },
];

export function MapViewToggle({
  selected,
  onSelect,
}: {
  readonly selected: MapViewChoice;
  readonly onSelect: (choice: MapViewChoice) => void;
}): ReactElement {
  return (
    <div role="group" aria-label="View" className={styles.group}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.segment} ${selected === option.value ? styles.on : ""}`}
          aria-pressed={selected === option.value}
          onClick={() => onSelect(option.value)}
        >
          <Icon name={option.icon} size="medium" />
          <span className={styles.label}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
