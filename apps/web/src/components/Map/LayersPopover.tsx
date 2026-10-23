// B-03 Layers popover (CRM-HANDOFF §4.2/E-72): switches for the two live CRM layers this story
// owns — aged-roof markers and open/stalled permit markers — plus the permit-coverage-gap note.
// No "My leads" layer: leads don't exist yet (B-07). Render-only; the caller (Map.tsx) owns the
// on/off state so it can keep it in the URL's `layers` key (CRM-HANDOFF §6).
import { Icon, IconButton, Popover } from "@crm/ui";
import { useId, useState, type ReactElement } from "react";
import styles from "./LayersPopover.module.css";

export interface LayersState {
  readonly roofs: boolean;
  readonly permits: boolean;
  readonly gaps: boolean;
}

export interface LayersPopoverProps {
  readonly value: LayersState;
  readonly onChange: (value: LayersState) => void;
}

const ROWS: readonly {
  readonly key: keyof LayersState;
  readonly label: string;
  readonly hint: string;
}[] = [
  { key: "roofs", label: "Aged roofs", hint: "Roof-age markers, coloured by confidence" },
  {
    key: "permits",
    label: "Open and stalled permits",
    hint: "Coloured by status; ringed when open > 5 yrs",
  },
  {
    key: "gaps",
    label: "Permit coverage gaps",
    hint: "Where CountyLens has not published permits",
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
          {ROWS.map((row) => (
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
        </Popover>
      </div>
    </div>
  );
}
