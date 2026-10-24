// The top app bar (Atlas § 7; CRM-HANDOFF § Top bar; boards CrmShell1440, CrmShellApps1440/768,
// CrmShellData1440, CrmAccount). Left: Roofing CRM and the county (Travis County, TX — the one
// county CountyLens publishes, so a static label that says so rather than a picker with nothing
// else in it). Right: the data chip (run from the API), Apps (>= 600 px; at 390 the same rows sit
// in the More sheet) and the account menu with Sign out. One overlay open at a time (E-94).
// The universal search box stays on the Map screen, which owns search.
import { useCallback, useRef, useState, type ReactElement } from "react";
import { Icon, IconButton } from "@crm/ui";
import { identityFromSession } from "../../auth/identity.js";
import { loadSession } from "../../auth/session.js";
import { AppLinks } from "./AppLinks.js";
import { DataChip } from "./DataChip.js";
import { COUNTY_LABEL } from "./navigation.js";
import { useDismiss } from "./useDismiss.js";
import { useSignOut } from "./useSignOut.js";
import styles from "./ShellTopBar.module.css";

type Overlay = "data" | "apps" | "account" | null;

export interface ShellTopBarProps {
  readonly title: string;
}

function AppsMenu({
  open,
  onToggle,
  onClose,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const trigger = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, menu, trigger);
  return (
    <div className={`${styles.anchor} ${styles.apps}`}>
      <span ref={trigger} className={styles.triggerWrap}>
        <IconButton
          icon="apps"
          label="Apps"
          className={styles.iconButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        />
      </span>
      {open && (
        <div ref={menu} role="menu" aria-label="Apps" className={styles.menu}>
          <AppLinks itemRole="menuitem" onNavigate={onClose} />
        </div>
      )}
    </div>
  );
}

function AccountMenu({
  open,
  onToggle,
  onClose,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const trigger = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, menu, trigger);
  const signOut = useSignOut();
  const identity = identityFromSession(loadSession());
  const name = identity.username ?? identity.email;

  return (
    <div className={styles.anchor}>
      <span ref={trigger} className={styles.triggerWrap}>
        <IconButton
          icon="account_circle"
          label="Account"
          className={styles.iconButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        />
      </span>
      {open && (
        <div ref={menu} role="menu" aria-label="Account" className={styles.menu}>
          <div className={styles.identity}>
            <span className={styles.name}>{name ?? "Signed in"}</span>
            {identity.email !== null && identity.email !== name && (
              <span className={styles.detail}>{identity.email}</span>
            )}
            {identity.groups.length > 0 && (
              <span className={styles.groups}>
                {identity.groups.map((group) => (
                  <span key={group} className={styles.pill}>
                    {group}
                  </span>
                ))}
              </span>
            )}
          </div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={signOut}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function ShellTopBar({ title }: ShellTopBarProps): ReactElement {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const close = useCallback(() => setOverlay(null), []);
  const toggle = useCallback(
    (which: Exclude<Overlay, null>) => () =>
      setOverlay((current) => (current === which ? null : which)),
    [],
  );

  return (
    <div className={styles.row}>
      <h1 className={styles.title}>{title}</h1>
      <span
        className={styles.county}
        data-county=""
        title={`${COUNTY_LABEL} is the only county CountyLens publishes`}
      >
        <Icon name="location_on" size="medium" />
        {COUNTY_LABEL}
      </span>
      <span className={styles.spacer} />
      <DataChip open={overlay === "data"} onToggle={toggle("data")} onClose={close} />
      <AppsMenu open={overlay === "apps"} onToggle={toggle("apps")} onClose={close} />
      <AccountMenu open={overlay === "account"} onToggle={toggle("account")} onClose={close} />
    </div>
  );
}
