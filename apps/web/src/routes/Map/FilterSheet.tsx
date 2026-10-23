// B-03 Map filter sheet (tasks.md T024; AC-3, AC-5, FR-003, FR-005). Replaces the A-13/ORACLE-u
// Explore version this file was copied from (C1 copy, 2026-10-23): that version controlled
// place/radius/roof/permit/openYrs/tenure/ooa/sort for Task A's place-based Explorer. B-03's Map
// has no place search and no tenure/out-of-area-owner filter (ADR-03 keeps owner data out of this
// story entirely) — the only two controls this screen owns are the roof-age threshold (US2) and
// the permit-view toggle (US3); radius itself lives in `RadiusControl.tsx` (Group 1's T016).
// Below 840 px the controls collapse into a sheet behind a "Filters" button (aria-expanded); from
// 840 px they sit beside the results (same breakpoint and CSS module as the file this replaces).
// Atlas outlined text fields, 48 px targets. Render-only.
import { DEFAULT_ROOF_AGE_YEARS } from "@crm/domain";
import { useId, useState, type ReactElement } from "react";
import styles from "./FilterSheet.module.css";

export interface FilterSheetProps {
  /** `undefined` = no roof-age filter applied (every row shown, FR-003's "no filter" state). */
  readonly roofAgeMinYears: number | undefined;
  readonly permitView: boolean;
  readonly onRoofAgeMinYearsChange: (value: number | undefined) => void;
  readonly onPermitViewChange: (value: boolean) => void;
}

/** The URL/control value of typed text: an integer >= 0, or `undefined` for an empty box
 *  (data-model.md: "a property with roofAgeYears = null is never filtered out... until a
 *  threshold is applied" — an empty box means that same "no filter" state, not 0). */
export function committedRoofAge(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

export function FilterSheet({
  roofAgeMinYears,
  permitView,
  onRoofAgeMinYearsChange,
  onPermitViewChange,
}: FilterSheetProps): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  // What the person is typing, until they leave the box (mirrors the copied-from file's "drafts"
  // pattern so a half-typed value is never clobbered by the committed one re-rendering).
  const [draft, setDraft] = useState<string | undefined>(undefined);

  return (
    <div className={styles.sheet}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        Filters
      </button>
      <div id={`${id}-panel`} className={`${styles.panel} ${open ? styles.open : ""}`}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-roof`}>
            Roof age
          </label>
          <span className={styles.inputRow}>
            <input
              id={`${id}-roof`}
              className={styles.input}
              type="number"
              inputMode="numeric"
              step="1"
              min={0}
              placeholder={`${DEFAULT_ROOF_AGE_YEARS}`}
              value={draft ?? (roofAgeMinYears === undefined ? "" : String(roofAgeMinYears))}
              onChange={(e) => {
                const typed = e.target.value;
                setDraft(typed);
                if (typed.trim() === "") {
                  onRoofAgeMinYearsChange(undefined);
                } else {
                  const committed = committedRoofAge(typed);
                  if (committed !== undefined) onRoofAgeMinYearsChange(committed);
                }
              }}
              onBlur={() => setDraft(undefined)}
            />
            <span className={styles.unit}>yrs or older</span>
          </span>
        </div>
        <div className={styles.check}>
          <input
            id={`${id}-permits`}
            className={styles.box}
            type="checkbox"
            checked={permitView}
            onChange={(e) => onPermitViewChange(e.target.checked)}
          />
          <label className={styles.label} htmlFor={`${id}-permits`}>
            Show open permits
          </label>
        </div>
      </div>
    </div>
  );
}
