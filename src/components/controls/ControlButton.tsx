import { PointerEvent, ReactNode, useState } from "react";
import { PressPopup } from "./PressPopup";

export function ControlButton({
  label,
  children,
  onPress,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  suppressClick = false,
  popup = true,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onPress: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLButtonElement>) => void;
  suppressClick?: boolean;
  popup?: boolean;
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      className={`iconButton ${className}`}
      aria-label={label}
      onPointerDown={(event) => {
        setPressed(true);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setPressed(false);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        setPressed(false);
        onPointerCancel?.(event);
      }}
      onPointerLeave={() => setPressed(false)}
      onClick={suppressClick ? undefined : onPress}
    >
      {pressed && popup ? <PressPopup label={label} /> : null}
      {children}
    </button>
  );
}
