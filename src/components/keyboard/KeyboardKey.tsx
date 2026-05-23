import { ReactNode } from "react";
import { KeyPopup } from "./KeyPopup";

export function KeyboardKey({
  keyId,
  label,
  children,
  active = false,
  popup = false,
  className = "",
}: {
  keyId: string;
  label: string;
  children?: ReactNode;
  active?: boolean;
  popup?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`keyboardKey ${active ? "pressed" : ""} ${className}`}
      data-key-id={keyId}
      tabIndex={-1}
    >
      {active && popup ? <KeyPopup label={label} /> : null}
      {children ?? label}
    </button>
  );
}
