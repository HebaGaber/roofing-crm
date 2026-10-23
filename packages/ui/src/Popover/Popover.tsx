// B-03 generic anchored popover (the Layers popover, and any future small menu). A dialog that
// opens below its trigger, closes on Escape and on an outside click, and returns focus to the
// trigger on close (constitution § 10: dialogs trap focus and close with Escape). Render-only;
// the caller owns open/close state so it can be driven by the URL or any other store.
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import styles from "./Popover.module.css";

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly children: ReactNode;
  readonly align?: "start" | "end";
}

export function Popover({
  open,
  onClose,
  label,
  children,
  align = "start",
}: PopoverProps): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      aria-modal="false"
      className={`${styles.popover} ${align === "end" ? styles.end : ""}`}
    >
      {children}
    </div>
  );
}
