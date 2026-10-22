// T028: the collapsed "More" sheet at 390px. Its trigger button is hidden at >=768px via CSS
// (NavRail is shown there instead); the panel renders the same 5 shared NavRows (packages/ui),
// not a duplicate implementation (agent-design.md §4).
import { useState, type ReactElement } from "react";
import { NavRow } from "@crm/ui";
import { ROADMAP_SECTIONS } from "@crm/shared";
import styles from "./MoreSheet.module.css";

export function MoreSheet(): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls="more-sheet-panel"
        onClick={() => setOpen((value) => !value)}
      >
        More
      </button>
      {open && (
        <div id="more-sheet-panel" role="dialog" aria-label="More" className={styles.panel}>
          {ROADMAP_SECTIONS.map(({ section, label }) => (
            <NavRow key={section} section={section} label={label} />
          ))}
        </div>
      )}
    </div>
  );
}
