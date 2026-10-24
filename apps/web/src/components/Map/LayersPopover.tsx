// B-03 Layers popover (CRM-HANDOFF §4.2/E-72): the four layers the design lists. Two are live
// switches — Aged roofs (hexagons by median roof age when zoomed out, a marker per property when
// zoomed in) and Open and stalled permits (count clusters by open duration when zoomed out, a
// marker per permit when zoomed in). Two cannot be drawn from what is published, so they are
// shown disabled with the reason instead of being hidden or faked: Permit coverage gaps (contract/v1
// publishes no coverage areas) and My leads (lead markers are not built on the map yet).
// Render-only; the caller (Map.tsx) owns the on/off state.
import { Icon, IconButton, Popover } from "@crm/ui";
import { useId, useState, type ReactElement } from "react";
import styles from "./LayersPopover.module.css";

export interface LayersState {
  readonly roofs: boolean;
  readonly permits: boolean;
  /** Kept for the URL/state shape; never drawn (see UNAVAILABLE below). */
  readonly gaps: boolean;
}

export interface LayersPopoverProps {
  readonly value: LayersState;
  readonly onChange: (value: LayersState) => void;
}

const LIVE: readonly {
  readonly key: "roofs" | "permits";
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    key: "roofs",
    label: "Aged roofs",
    hint: "Hexagons by median roof age when zoomed out; a marker per property when zoomed in",
  },
  {
    key: "permits",
    label: "Open and stalled permits",
    hint: "Clusters by open duration when zoomed out; a marker per permit when zoomed in",
  },
];

const UNAVAILABLE: readonly {
  readonly id: string;
  readonly label: string;
  readonly why: string;
}[] = [
  {
    id: "leads",
    label: "My leads",
    why: "Lead markers are not drawn on the map yet. Open Leads to see them.",
  },
  {
    id: "gaps",
    label: "Permit coverage gaps",
    why: "CountyLens publishes no permit-coverage areas in contract/v1, so gaps cannot be outlined.",
  },
];

export function LayersPopover({ value, onChange }: LayersPopoverProps): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={styles.wrapper}>
      <IconButton
        icon="layers"
        label="Layers"
        active={open}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      />
      <div id={id}>
        <Popover open={open} onClose={() => setOpen(false)} label="Layers">
          <h4 className={styles.heading}>
            <Icon name="layers" size="small" />
            Layers
          </h4>
          {LIVE.map((row) => (
            <label key={row.key} className={styles.row}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={value[row.key]}
                onChange={(e) => onChange({ ...value, [row.key]: e.target.checked })}
              />
              <span>
                <span className={styles.label}>{row.label}</span>
                <span className={styles.hint}>{row.hint}</span>
              </span>
            </label>
          ))}
          {UNAVAILABLE.map((row) => (
            <label key={row.id} className={`${styles.row} ${styles.disabled}`}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={false}
                disabled
                aria-describedby={`${id}-${row.id}-why`}
              />
              <span>
                <span className={styles.label}>{row.label}</span>
                <span id={`${id}-${row.id}-why`} className={styles.hint}>
                  {row.why}
                </span>
              </span>
            </label>
          ))}
        </Popover>
      </div>
    </div>
  );
}
