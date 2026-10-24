// B-03 results sheet (CRM-HANDOFF §4.2/§9.1, board CrmMapPin390): the "Matches N" header with the
// coverage-note info icon, wrapping the result card list. Replaces the bare `<ul>` the fixer pass
// left in place. Render-only — Map.tsx still owns the query and the list of rows. The sheet
// behaviour (peek/full, handle, pane from 1280 px) is ResultsSheet's; this is only its content.
import { Icon, Popover } from "@crm/ui";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import styles from "./ResultsPanel.module.css";

export interface ResultsPanelProps {
  readonly count: number;
  readonly children: ReactNode;
  /** Shows the filled "Triage n" action after the coverage info (the phone sheet, board
   *  CrmMapPin390); absent from 1280 px, where the board has none. */
  readonly onTriage?: () => void;
}

/** CRM-HANDOFF §4.2 "Coverage note": the full text behind the results-header info icon. Static
 *  copy — this story has no coverage-gap polygon to test against (none is published yet), so the
 *  icon always opens the same explanatory note rather than claiming to detect a real gap (honest
 *  simplification, called out in the build report). */
const COVERAGE_NOTE =
  "Permits are shown only where CountyLens publishes them. Part of this area may have no permit data.";

export function ResultsPanel({ count, children, onTriage }: ResultsPanelProps): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.sheet}>
      <header className={styles.head}>
        <span className={styles.matches}>{`Matches ${count}`}</span>
        <span className={styles.infoWrap}>
          <button
            type="button"
            className={styles.info}
            aria-label="Permit coverage note"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="info" size="medium" />
          </button>
          <div id={id}>
            <Popover
              open={open}
              onClose={() => setOpen(false)}
              label="Permit coverage note"
              align="end"
            >
              <p className={styles.note}>{COVERAGE_NOTE}</p>
            </Popover>
          </div>
        </span>
        {onTriage === undefined ? null : (
          <button type="button" className={styles.triage} onClick={onTriage}>
            {`Triage ${count}`}
          </button>
        )}
      </header>
      {children}
    </div>
  );
}
