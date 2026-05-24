import { type CSSProperties, FormEvent, PointerEvent, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { useViewPresetStore, type ViewPreset } from "../../stores/viewPresetStore";
import { useViewStateStore } from "../../stores/viewStateStore";

export function ViewPresetsPanel() {
  const presets = useViewPresetStore((state) => state.presets);
  const addPreset = useViewPresetStore((state) => state.addPreset);
  const updatePreset = useViewPresetStore((state) => state.updatePreset);
  const deletePreset = useViewPresetStore((state) => state.deletePreset);
  const movePreset = useViewPresetStore((state) => state.movePreset);
  const scale = useViewStateStore((state) => state.scale);
  const sourceAnchor = useViewStateStore((state) => state.sourceAnchor);
  const [name, setName] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const trimmedName = name.trim();
  const duplicateName = presets.some((preset) => preset.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase());

  function onCreatePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName || duplicateName) {
      return;
    }

    addPreset({ name: trimmedName, scale, sourceAnchor });
    setName("");
  }

  function onUpdatePreset(preset: ViewPreset) {
    if (window.confirm(`Overwrite "${preset.name}" with the current view?`)) {
      updatePreset(preset.id, { scale, sourceAnchor });
    }
  }

  function onDeletePreset(preset: ViewPreset) {
    if (window.confirm(`Delete "${preset.name}"?`)) {
      deletePreset(preset.id);
    }
  }

  function onDragStart(event: PointerEvent<HTMLElement>, presetId: string) {
    event.preventDefault();
    setDraggingId(presetId);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some touch edge cases may not allow capture.
    }
  }

  function onDragMove(event: PointerEvent<HTMLElement>) {
    if (!draggingId) {
      return;
    }

    event.preventDefault();
    const targetRow = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-preset-id]");
    const targetId = targetRow?.dataset.presetId;
    if (targetId && targetId !== draggingId) {
      movePreset(draggingId, targetId);
    }
  }

  function onDragEnd() {
    setDraggingId(null);
  }

  return (
    <div className="settingsStack">
      <form className="presetCreateForm" onSubmit={onCreatePreset}>
        <label>
          Preset name
          <input
            placeholder="Terminal bottom"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!trimmedName || duplicateName}>
          Save Current View
        </button>
        {duplicateName ? <small className="error">Preset names must be unique.</small> : null}
      </form>

      <div className="presetList">
        {presets.length ? (
          presets.map((preset) => (
            <article
              className={`presetRow ${draggingId === preset.id ? "dragging" : ""}`}
              data-preset-id={preset.id}
              key={preset.id}
              style={{ "--preset-color": preset.color } as CSSProperties}
            >
              <div
                className="presetDragBody"
                onPointerDown={(event) => onDragStart(event, preset.id)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
              >
                <GripVertical size={17} />
                <span>
                  <strong>{preset.name}</strong>
                  <small>{formatPresetView(preset)}</small>
                </span>
              </div>
              <button type="button" onClick={() => onUpdatePreset(preset)}>
                Update
              </button>
              <button type="button" className="presetDeleteButton" aria-label={`Delete ${preset.name}`} onClick={() => onDeletePreset(preset)}>
                <X size={16} />
              </button>
            </article>
          ))
        ) : (
          <div className="emptySettingsTab">
            <h3>No view presets yet</h3>
            <p>Name the current view above, then save it as a preset.</p>
          </div>
        )}
      </div>

      <PresetMap presets={presets} />
    </div>
  );
}

function PresetMap({ presets }: { presets: ViewPreset[] }) {
  return (
    <section className="presetMap" aria-label="Preset anchor map">
      <div className="presetMapPlane">
        {presets.map((preset) => (
          <span
            className="presetMapDot"
            key={preset.id}
            style={{
              "--preset-color": preset.color,
              left: `${preset.sourceAnchor.x * 100}%`,
              top: `${preset.sourceAnchor.y * 100}%`,
            } as CSSProperties}
          >
            <i />
            <small>{formatScale(preset.scale)}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function formatPresetView(preset: ViewPreset) {
  return `${formatScale(preset.scale)} at ${Math.round(preset.sourceAnchor.x * 100)}%, ${Math.round(preset.sourceAnchor.y * 100)}%`;
}

function formatScale(scale: number) {
  return `${Number(scale.toFixed(1))}x`;
}
