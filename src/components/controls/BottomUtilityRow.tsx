import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { PointerEvent, useRef } from "react";
import { useKvmInput } from "../../app/KvmInputContext";
import { useAppStateStore } from "../../stores/appStateStore";
import { ControlButton } from "./ControlButton";

const arrowKeys = [
  { label: "Left", code: "ArrowLeft", icon: <ArrowLeft size={17} /> },
  { label: "Up", code: "ArrowUp", icon: <ArrowUp size={17} /> },
  { label: "Down", code: "ArrowDown", icon: <ArrowDown size={17} /> },
  { label: "Right", code: "ArrowRight", icon: <ArrowRight size={17} /> },
];

export function BottomUtilityRow() {
  const input = useKvmInput();
  const ctrlSticky = useAppStateStore((state) => state.ctrlSticky);
  const altSticky = useAppStateStore((state) => state.altSticky);
  const cmdSticky = useAppStateStore((state) => state.cmdSticky);
  const setCtrlSticky = useAppStateStore((state) => state.setCtrlSticky);
  const setAltSticky = useAppStateStore((state) => state.setAltSticky);
  const setCmdSticky = useAppStateStore((state) => state.setCmdSticky);
  const ctrlLongPressTimerRef = useRef<number | null>(null);
  const ctrlLongPressFiredRef = useRef(false);

  async function sendMaybeModified(key: string) {
    const modifiers = [
      ctrlSticky ? "ControlLeft" : null,
      altSticky ? "AltLeft" : null,
      cmdSticky ? "MetaLeft" : null,
    ].filter(Boolean) as string[];
    if (modifiers.length) {
      await input.sendShortcut([...modifiers, key]);
      setCtrlSticky(false);
      setAltSticky(false);
      setCmdSticky(false);
    } else {
      await input.sendKey(key);
    }
  }

  function clearCtrlLongPressTimer() {
    if (ctrlLongPressTimerRef.current) {
      window.clearTimeout(ctrlLongPressTimerRef.current);
      ctrlLongPressTimerRef.current = null;
    }
  }

  function onCtrlPointerDown(_event: PointerEvent<HTMLButtonElement>) {
    ctrlLongPressFiredRef.current = false;
    clearCtrlLongPressTimer();
    ctrlLongPressTimerRef.current = window.setTimeout(() => {
      ctrlLongPressFiredRef.current = true;
      setCtrlSticky(false);
      setCmdSticky(true);
    }, 430);
  }

  function onCtrlPointerUp() {
    clearCtrlLongPressTimer();
    if (ctrlLongPressFiredRef.current) {
      return;
    }
    setCmdSticky(false);
    setCtrlSticky(!ctrlSticky);
  }

  function onCtrlPointerCancel() {
    clearCtrlLongPressTimer();
  }

  return (
    <div className="bottomUtilityRow">
      <ControlButton label="Escape" onPress={() => void sendMaybeModified("Escape")}>esc</ControlButton>
      <ControlButton label="Tab" onPress={() => void sendMaybeModified("Tab")}>tab</ControlButton>
      <ControlButton
        label={cmdSticky ? "Command" : "Control"}
        className={cmdSticky ? "cmdActive" : ctrlSticky ? "active" : ""}
        onPress={() => {}}
        onPointerDown={onCtrlPointerDown}
        onPointerUp={onCtrlPointerUp}
        onPointerCancel={onCtrlPointerCancel}
        suppressClick
      >
        {cmdSticky ? "cmd" : "ctrl"}
      </ControlButton>
      <ControlButton
        label="Alt"
        className={altSticky ? "active" : ""}
        onPress={() => setAltSticky(!altSticky)}
      >
        alt
      </ControlButton>
      <ControlButton label="Slash" onPress={() => void sendMaybeModified("Slash")}>/</ControlButton>
      {arrowKeys.map((key) => (
        <ControlButton key={key.code} label={key.label} onPress={() => void sendMaybeModified(key.code)}>
          {key.icon}
        </ControlButton>
      ))}
    </div>
  );
}
