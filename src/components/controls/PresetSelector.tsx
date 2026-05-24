import { Bookmark } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useAppStateStore } from "../../stores/appStateStore";
import { useViewPresetStore } from "../../stores/viewPresetStore";
import { useViewStateStore } from "../../stores/viewStateStore";
import { ControlButton } from "./ControlButton";

export function PresetSelector() {
  const [open, setOpen] = useState(false);
  const presets = useViewPresetStore((state) => state.presets);
  const setView = useViewStateStore((state) => state.setView);
  const openSettings = useAppStateStore((state) => state.openSettings);

  function applyPreset(presetId: string) {
    const preset = presets.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }

    setView({ scale: preset.scale, sourceAnchor: preset.sourceAnchor });
    setOpen(false);
  }

  function openCreatePreset() {
    setOpen(false);
    openSettings("view");
  }

  return (
    <div className="presetSelector">
      {open ? (
        <div className="presetSelectorPopover">
          {presets.length ? (
            presets.map((preset) => (
              <button
                type="button"
                className="presetSelectorItem"
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                style={{ "--preset-color": preset.color } as CSSProperties}
              >
                <span />
                <strong>{preset.name}</strong>
              </button>
            ))
          ) : (
            <div className="presetSelectorEmpty">
              <small>No presets yet</small>
              <button type="button" onClick={openCreatePreset}>
                Create
              </button>
            </div>
          )}
        </div>
      ) : null}
      <ControlButton label="View presets" onPress={() => setOpen((value) => !value)}>
        <Bookmark size={18} />
      </ControlButton>
    </div>
  );
}
