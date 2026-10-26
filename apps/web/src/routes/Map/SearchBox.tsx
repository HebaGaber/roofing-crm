// Map search box: an accessible combobox (WAI-ARIA 1.2 list autocomplete, focus stays in the input,
// options are reached with aria-activedescendant). Places and ZIPs come from the vendored Travis
// gazetteer; a permit number or TCAD account is looked up by the API when chosen (lazily, so
// nothing is requested while typing); street addresses are a disabled option until Run 3.1.
import { Icon } from "@crm/ui";
import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import {
  GAZETTEER_PROVENANCE,
  SEARCH_SAMPLES,
  classifyQuery,
  optionsFor,
  type SearchOption,
} from "./searchSuggest.js";
import styles from "./SearchBox.module.css";

export type ExactLookupResult =
  | {
      readonly found: true;
      readonly propertyCid: string;
      readonly lat: number;
      readonly lng: number;
    }
  | { readonly found: false; readonly runId: string | null };

export interface SearchBoxProps {
  /** A place or ZIP was chosen: centre the radius search there. */
  readonly onCentre: (point: { lat: number; lng: number }) => void;
  /** A permit or TCAD lookup found its property: open it and centre on it. */
  readonly onOpenProperty: (propertyCid: string, point: { lat: number; lng: number }) => void;
  /** Exact lookup through the API; only called when a permit/TCAD option is chosen. */
  readonly lookup: (kind: "permit" | "tcad", value: string) => Promise<ExactLookupResult>;
}

interface Row {
  readonly option: SearchOption;
  readonly sample: boolean;
}

const PROVENANCE_EXACT = "Exact match against the current run index";
const PROVENANCE_SAMPLES = `Places and ZIPs: ${GAZETTEER_PROVENANCE}. Permits and accounts: current run index.`;

export function SearchBox({ onCentre, onOpenProperty, lookup }: SearchBoxProps): ReactElement {
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const empty = text.trim() === "";
  const rows: Row[] = empty
    ? SEARCH_SAMPLES.flatMap((s) =>
        optionsFor(s.query).map((option) => ({
          option: { ...option, label: s.label },
          sample: true,
        })),
      )
    : optionsFor(text).map((option) => ({ option, sample: false }));
  const showNoMatch = !empty && rows.length === 0;
  const expanded = open && (rows.length > 0 || showNoMatch || notice !== null || busy);
  const optionId = (i: number): string => `${uid}-opt-${i}`;

  const change = (value: string): void => {
    setText(value);
    setNotice(null);
    setActive(-1);
    setOpen(true);
  };

  const choose = async (row: Row): Promise<void> => {
    const { option } = row;
    if (option.disabled === true) return;
    if (option.point !== undefined) {
      setText(option.label);
      setOpen(false);
      onCentre(option.point);
      return;
    }
    if ((option.kind === "permit" || option.kind === "tcad") && option.lookup !== undefined) {
      const value = option.lookup;
      if (row.sample) setText(value);
      setBusy(true);
      setNotice(null);
      try {
        const result = await lookup(option.kind, value);
        if (result.found) {
          setOpen(false);
          onOpenProperty(result.propertyCid, { lat: result.lat, lng: result.lng });
        } else {
          const what = option.kind === "permit" ? "permit" : "TCAD account";
          setNotice(`No ${what} ${value} in ${result.runId ?? "the current run"}`);
        }
      } catch {
        setNotice("The lookup failed. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    }
  };

  const step = (dir: 1 | -1): void => {
    const enabled = rows.flatMap((r, i) => (r.option.disabled === true ? [] : [i]));
    if (enabled.length === 0) return;
    const at = enabled.indexOf(active);
    const next =
      at === -1
        ? dir === 1
          ? 0
          : enabled.length - 1
        : (at + dir + enabled.length) % enabled.length;
    setActive(enabled[next] ?? -1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = active >= 0 ? rows[active] : rows.find((r) => r.option.disabled !== true);
      if (target !== undefined && !busy) void choose(target);
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setActive(-1);
      } else if (text !== "") {
        event.preventDefault();
        event.stopPropagation();
        change("");
        setOpen(false);
      }
    }
  };

  const kind = empty ? "empty" : classifyQuery(text);
  const hasGazetteer = rows.some((r) => r.option.kind === "place" || r.option.kind === "zip");
  const provenance = empty
    ? PROVENANCE_SAMPLES
    : hasGazetteer
      ? GAZETTEER_PROVENANCE
      : kind === "permit" || kind === "tcad"
        ? PROVENANCE_EXACT
        : null;

  return (
    <div className={styles.root} role="search">
      <div className={styles.field}>
        <Icon name="search" size="medium" />
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-label="Search an address, place, ZIP or permit"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          placeholder="Search an address, place, ZIP or permit"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {text !== "" ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              change("");
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size="medium" />
          </button>
        ) : null}
      </div>
      <div className={styles.popup} hidden={!expanded}>
        {empty ? <p className={styles.group}>Try</p> : null}
        <ul id={listId} role="listbox" aria-label="Search suggestions" className={styles.list}>
          {rows.map((row, i) => (
            <li
              key={`${row.sample ? "s" : "o"}-${row.option.id}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              aria-disabled={row.option.disabled === true ? true : undefined}
              data-kind={row.option.kind}
              className={styles.option}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => {
                if (row.option.disabled !== true) setActive(i);
              }}
              onClick={() => void choose(row)}
            >
              <span className={styles.label}>{row.option.label}</span>
              {row.option.detail !== undefined ? (
                <span className={styles.detail}>{row.option.detail}</span>
              ) : null}
            </li>
          ))}
          {showNoMatch ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>No place or ZIP in Travis County matches</span>
              <span className={styles.detail}>{`"${text.trim()}" is not in the gazetteer`}</span>
            </li>
          ) : null}
          {busy ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>Looking up…</span>
            </li>
          ) : null}
          {notice !== null ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>{notice}</span>
            </li>
          ) : null}
        </ul>
        {provenance !== null ? <p className={styles.provenance}>{provenance}</p> : null}
      </div>
    </div>
  );
}
