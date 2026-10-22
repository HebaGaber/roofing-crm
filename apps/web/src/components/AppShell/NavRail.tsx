// T028: wires the 5 shared NavRows (packages/ui) into the nav rail at 768/1440px (shown via
// NavRail.module.css's media query — hidden below 768px, where MoreSheet takes over). Same
// component instance as MoreSheet, no duplicate implementation (agent-design.md §4).
import type { ReactElement } from "react";
import { NavRow } from "@crm/ui";
import { ROADMAP_SECTIONS } from "@crm/shared";
import styles from "./NavRail.module.css";

export function NavRail(): ReactElement {
  return (
    <div className={styles.rail} aria-label="Roadmap sections (not yet built)">
      {ROADMAP_SECTIONS.map(({ section, label }) => (
        <NavRow key={section} section={section} label={label} />
      ))}
    </div>
  );
}
