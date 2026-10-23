// B-03 Map filter sheet (tasks.md T024; AC-3, AC-5, FR-003, FR-005). Replaces the A-13/ORACLE-u
// Explore version this file was copied from (C1 copy, 2026-10-23): that version controlled
// place/radius/roof/permit/openYrs/tenure/ooa/sort for Task A's place-based Explorer. B-03's Map
// has no place search and no tenure/out-of-area-owner filter (ADR-03 keeps owner data out of this
// story entirely) — radius itself lives in `RadiusControl.tsx` (Group 1's T016). This file owns:
// the roof-age threshold (chips 10/13/15/20/25 + an "Other" number field, default 15, CRM-HANDOFF
// §4.2 "Filters (CRM set)"), the permit-view toggle (US3), and — new in the structural rebuild —
// the permit status (Open/Stalled/Any) and permit-open-duration filters, applied client-side over
// the already-fetched permits (the API has no status filter of its own, contracts/search-api.md).
// Below 840 px the controls collapse into a sheet behind a "Filters" button (aria-expanded); from
// 840 px they sit beside the results (same breakpoint and CSS module as the file this replaces).
// Atlas outlined text fields and chips, 48 px targets. Render-only.
import { DEFAULT_ROOF_AGE_YEARS } from "@crm/domain";
import { useId, useState, type ReactElement } from "react";
import styles from "./FilterSheet.module.css";

/** CRM-HANDOFF §4.2: "Roof age ≥ N (10–25 chips or any number in 'Other'; default 15)". */
export const ROOF_AGE_CHIPS: readonly number[] = [10, 13, 15, 20, 25];

export type PermitStatusFilter = "open" | "stalled" | "any";

/** CRM-HANDOFF §4.2: "Permit open ≥ any / 1 / 3 / 5 / 10 yrs". */
export const PERMIT_OPEN_YEARS_OPTIONS: readonly number[] = [1, 3, 5, 10];

export interface FilterSheetProps {
  /** `undefined` = no roof-age filter applied (every row shown, FR-003's "no filter" state). */
  readonly roofAgeMinYears: number | undefined;
  readonly permitView: boolean;
  readonly onRoofAgeMinYearsChange: (value: number | undefined) => void;
  readonly onPermitViewChange: (value: boolean) => void;
  /** Permit status (Open · Stalled · Any — "Open" means not finaled, includes stalled per
   *  CRM-HANDOFF §4.2). Optional: a caller that doesn't care about permit status yet (every
   *  existing test) gets the control hidden and no behaviour change. */
  readonly permitStatus?: PermitStatusFilter;
  readonly onPermitStatusChange?: (value: PermitStatusFilter) => void;
  /** Permit open ≥ N yrs; `undefined` = "Any". */
  readonly permitOpenYrs?: number | undefined;
  readonly onPermitOpenYrsChange?: (value: number | undefined) => void;
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
  permitStatus,
  onPermitStatusChange,
  permitOpenYrs,
  onPermitOpenYrsChange,
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
        <div className={styles.group}>
          <span className={styles.groupLabel}>Roof age ≥</span>
          <div className={styles.chips} role="group" aria-label="Roof age threshold">
            {ROOF_AGE_CHIPS.map((years) => (
              <button
                key={years}
                type="button"
                className={`${styles.chip} ${roofAgeMinYears === years ? styles.chipSelected : ""}`}
                aria-pressed={roofAgeMinYears === years}
                onClick={() => onRoofAgeMinYearsChange(years)}
              >
                {years}
              </button>
            ))}
          </div>
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
              <span className={styles.unit}>Other, yrs or older</span>
            </span>
          </div>
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
        {onPermitStatusChange === undefined ? null : (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Permit status</span>
            <div className={styles.chips} role="group" aria-label="Permit status">
              {(["open", "stalled", "any"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`${styles.chip} ${permitStatus === status ? styles.chipSelected : ""}`}
                  aria-pressed={permitStatus === status}
                  onClick={() => onPermitStatusChange(status)}
                >
                  {status === "open" ? "Open" : status === "stalled" ? "Stalled" : "Any"}
                </button>
              ))}
            </div>
          </div>
        )}
        {onPermitOpenYrsChange === undefined ? null : (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-open-yrs`}>
              Permit open ≥
            </label>
            <select
              id={`${id}-open-yrs`}
              className={styles.select}
              value={permitOpenYrs ?? ""}
              onChange={(e) =>
                onPermitOpenYrsChange(e.target.value === "" ? undefined : Number(e.target.value))
              }
            >
              <option value="">Any</option>
              {PERMIT_OPEN_YEARS_OPTIONS.map((years) => (
                <option key={years} value={years}>
                  {years} yrs
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
