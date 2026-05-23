import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Keyboard, Plus, Settings, X } from "lucide-react";
import { useKvmInput } from "../../app/KvmInputContext";
import { useAppStateStore } from "../../stores/appStateStore";
import { ControlButton } from "./ControlButton";

export function ControlBar() {
  const input = useKvmInput();
  const keyboardVisible = useAppStateStore((state) => state.keyboardVisible);
  const toggleKeyboardVisible = useAppStateStore((state) => state.toggleKeyboardVisible);
  const openSettings = useAppStateStore((state) => state.openSettings);

  return (
    <nav className="controlBar" aria-label="Control bar">
      <ControlButton label="Settings" onPress={() => openSettings("general")}>
        <Settings size={19} />
      </ControlButton>
      <ControlButton label="Previous tab" onPress={() => void input.sendTerminalAction("previousTab")}>
        <ChevronLeft size={22} />
      </ControlButton>
      <ControlButton label="Next tab" onPress={() => void input.sendTerminalAction("nextTab")}>
        <ChevronRight size={22} />
      </ControlButton>
      <ControlButton label="New tab" onPress={() => void input.sendTerminalAction("newTab")}>
        <Plus size={22} />
      </ControlButton>
      <ControlButton label="Close tab" onPress={() => void input.sendTerminalAction("closeTab")}>
        <X size={21} />
      </ControlButton>
      <ControlButton
        label={keyboardVisible ? "Hide keyboard" : "Show keyboard"}
        onPress={toggleKeyboardVisible}
      >
        <span className="keyboardToggleIcon">
          <Keyboard size={18} />
          {keyboardVisible ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </ControlButton>
    </nav>
  );
}
