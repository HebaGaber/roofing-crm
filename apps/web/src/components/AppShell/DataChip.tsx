// The data-source chip and panel (CRM-HANDOFF E-62; boards CrmDataChip, CrmShellData1440; review
// log row 22: 48 px Close). The chip names the run the lead index is serving, read from
// `shell.indexInfo` — never a hard-coded run. Panel: the manifest CID (copyable), when it was
// promoted, and the link to CountyLens. States: loading, ready, unavailable (with Retry). The
// board's "updating to Run n" state needs a newer-run signal the API does not expose, so it is
// not drawn rather than guessed.
import { useRef, type ReactElement } from "react";
import { CidDisplay, formatUtc, Icon, IconButton } from "@crm/ui";
import { useShellAppLinks, useShellIndexInfo } from "./shellApi.js";
import { useDismiss } from "./useDismiss.js";
import styles from "./DataChip.module.css";

export interface DataChipProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}

type ChipState = "loading" | "ready" | "error";

function runText(runId: string | null): string {
  return runId === null ? "run not recorded in the index" : `run ${runId}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar date a run id carries (`20261024`, `2026-10-24`, `…-20261021t103516z`), or null. */
function runDate(runId: string): { day: number; month: string; year: number } | null {
  const match = /(?<!\d)(20\d{2})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(runId);
  if (match === null) return null;
  return {
    day: Number(match[3]),
    month: MONTHS[Number(match[2]) - 1] ?? "",
    year: Number(match[1]),
  };
}

function runTail(runId: string): string {
  return `Run …${runId.slice(-6)}`;
}

/** The compact chip text (board CrmShellApps768 "Run 3"): a short run number as is, a run id that
 *  carries a calendar date as "24 Oct", any other long id cut to its last six characters. The
 *  full id stays in the chip's tooltip, its name and the panel; the chip never invents a run. */
export function shortRunLabel(runId: string | null): string {
  if (runId === null || runId === "") return "Data";
  if (runId.length <= 8) return `Run ${runId}`;
  const date = runDate(runId);
  return date === null ? runTail(runId) : `${String(date.day)} ${date.month}`;
}

/** The wider chip text: "Run 24 Oct 2026" for a dated id, else as the short label; null when
 *  there is no run id. */
export function longRunLabel(runId: string | null): string | null {
  if (runId === null || runId === "") return null;
  if (runId.length <= 8) return `Run ${runId}`;
  const date = runDate(runId);
  return date === null
    ? runTail(runId)
    : `Run ${String(date.day)} ${date.month} ${String(date.year)}`;
}

export function DataChip({ open, onToggle, onClose }: DataChipProps): ReactElement {
  const index = useShellIndexInfo();
  const links = useShellAppLinks();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, panel, trigger);

  const state: ChipState = index.data !== undefined ? "ready" : index.isError ? "error" : "loading";
  const label =
    state === "ready" && index.data !== undefined
      ? `Data: CountyLens ${runText(index.data.runId)}`
      : state === "error"
        ? "Data: Index unavailable"
        : "Data: loading";
  const icon = state === "ready" ? "cloud_done" : state === "error" ? "cloud_off" : "cloud_sync";

  return (
    <div className={styles.anchor}>
      <button
        ref={trigger}
        type="button"
        className={styles.chip}
        data-state={state}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        onClick={onToggle}
      >
        <span className={styles.stateIcon} data-state={state}>
          <Icon name={icon} size="small" />
        </span>
        <span className={styles.long}>
          {state === "ready" && index.data !== undefined
            ? `Data: CountyLens ${longRunLabel(index.data.runId) ?? runText(index.data.runId)}`
            : label}
        </span>
        <span className={styles.short} aria-hidden="true">
          {state === "ready" && index.data !== undefined ? shortRunLabel(index.data.runId) : "Data"}
        </span>
      </button>
      {open && (
        <div ref={panel} role="dialog" aria-label="Data source" className={styles.panel}>
          <div className={styles.header}>
            <h2 className={styles.title}>Data source</h2>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
          {index.data !== undefined ? (
            <>
              <p className={styles.body}>
                The lead index is built from the CountyLens manifest{" "}
                <CidDisplay cid={index.data.manifestCid} />
              </p>
              <p className={styles.body}>
                {index.data.promotedAt === ""
                  ? "Promotion time not recorded in the index."
                  : `Promoted ${formatUtc(index.data.promotedAt)} UTC.`}{" "}
                The CRM reads only published CountyLens data.
              </p>
              <p className={styles.status} data-state="ready">
                <span className={styles.stateIcon} data-state="ready">
                  <Icon name="cloud_done" size="small" />
                </span>
                {`Index serving ${runText(index.data.runId)}`}
              </p>
              <p className={styles.meta}>
                {`${index.data.propertyCount} properties · ${index.data.permitCount} permits`}
              </p>
            </>
          ) : index.isError ? (
            <>
              <p className={styles.status} data-state="error">
                <Icon name="cloud_off" size="small" />
                The lead index is unavailable, so map and list results may be missing. Your leads
                and notes still open.
              </p>
              <button type="button" className={styles.retry} onClick={() => void index.refetch()}>
                Retry
              </button>
            </>
          ) : (
            <p className={styles.status}>
              <Icon name="cloud_sync" size="small" />
              Reading the lead index…
            </p>
          )}
          {links.data !== undefined && (
            <a className={styles.link} href={links.data.countyLensUrl}>
              <Icon name="dataset" size="small" />
              Open CountyLens (manifest and Verify)
            </a>
          )}
        </div>
      )}
    </div>
  );
}
