// Collapsed or expanded, per pane, kept for the browser session (PO review: both panes can be
// minimised). Every storage access is in try/catch; with storage blocked the state lives for the
// page only. Default expanded.
import { useCallback, useState } from "react";

export type PaneSide = "left" | "right";

const key = (side: PaneSide): string => `crm.pane.${side}.v1`;
const memory: Record<PaneSide, boolean> = { left: false, right: false };

function read(side: PaneSide): boolean {
  try {
    const stored = sessionStorage.getItem(key(side));
    if (stored === "collapsed") return true;
    if (stored === "expanded") return false;
  } catch {
    // Storage blocked: fall through to the page-lifetime copy.
  }
  return memory[side];
}

function write(side: PaneSide, collapsed: boolean): void {
  memory[side] = collapsed;
  try {
    sessionStorage.setItem(key(side), collapsed ? "collapsed" : "expanded");
  } catch {
    // Blocked: the copy above is all there is.
  }
}

export function usePaneCollapsed(side: PaneSide): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => read(side));
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      write(side, !current);
      return !current;
    });
  }, [side]);
  return [collapsed, toggle];
}
