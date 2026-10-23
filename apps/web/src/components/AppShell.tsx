// The shell of every authenticated page (A-03 T007, re-pointed at the CRM in B-01 T028).
// Atlas § 7: top app bar (64 px, `surface`, title-large, elevation 2 on scroll), bottom
// navigation below 600 px and navigation rail from 600 px, with one real destination (Map) plus
// the five disabled roadmap sections (packages/ui's NavRow, via NavRail at 768/1440px and
// MoreSheet at 390px — T027/T028). Layout and colours come only from tokens.css through
// AppShell.module.css. DOM order is banner, navigation, main (ERR-13: Tab reaches the rail before
// the page content); the grid areas place the bottom navigation below main on compact widths, so
// nothing moves.
import { useCallback, useState, type ReactElement, type UIEvent } from "react";
import { NavLink, Outlet } from "react-router";
import { MoreSheet } from "./AppShell/MoreSheet.js";
import { NavRail } from "./AppShell/NavRail.js";
import styles from "./AppShell.module.css";

export const APP_TITLE = "Roofing CRM";

export interface Destination {
  readonly to: "/";
  readonly label: string;
  /** Material Symbols Rounded glyph name (Atlas § 6). */
  readonly icon: string;
}

export const DESTINATIONS: readonly Destination[] = [{ to: "/", label: "Map", icon: "map" }];

export function AppShell(): ReactElement {
  // The main region is the scroll container (the bottom navigation stays in view on compact
  // widths without a non-token padding), so the bar's elevation follows its scroll offset.
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    setScrolled(event.currentTarget.scrollTop > 0);
  }, []);

  return (
    <div className={styles.shell}>
      <header className={scrolled ? `${styles.bar} ${styles.barScrolled}` : styles.bar}>
        <h1 className={styles.title}>{APP_TITLE}</h1>
      </header>
      <nav className={styles.nav} aria-label="Primary">
        {DESTINATIONS.map((destination) => (
          <NavLink
            key={destination.to}
            to={destination.to}
            className={({ isActive }) =>
              isActive ? `${styles.item} ${styles.itemActive}` : styles.item
            }
          >
            <span className={styles.pill}>
              <span className="material-symbols-rounded" aria-hidden="true">
                {destination.icon}
              </span>
            </span>
            <span className={styles.label}>{destination.label}</span>
          </NavLink>
        ))}
        <NavRail />
        <MoreSheet />
      </nav>
      <main className={styles.main} onScroll={onScroll}>
        <Outlet />
      </main>
    </div>
  );
}
