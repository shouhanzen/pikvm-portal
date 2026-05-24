import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SourceAnchor } from "../types/view";

export type ViewPreset = {
  id: string;
  name: string;
  color: string;
  scale: number;
  sourceAnchor: SourceAnchor;
};

type ViewPresetState = {
  presets: ViewPreset[];
  addPreset: (preset: Omit<ViewPreset, "id" | "color">) => void;
  updatePreset: (id: string, view: { scale: number; sourceAnchor: SourceAnchor }) => void;
  deletePreset: (id: string) => void;
  movePreset: (id: string, targetId: string) => void;
  resetViewPresets: () => void;
};

const presetColors = ["#64d2ff", "#ff9f0a", "#bf5af2", "#30d158", "#ff453a", "#ffd60a", "#0a84ff", "#ff2d55"];

export const useViewPresetStore = create<ViewPresetState>()(
  persist(
    (set, get) => ({
      presets: [],
      addPreset: (preset) =>
        set((state) => ({
          presets: [
            {
              ...preset,
              id: makePresetId(),
              color: nextPresetColor(state.presets.length),
            },
            ...state.presets,
          ],
        })),
      updatePreset: (id, view) =>
        set((state) => ({
          presets: state.presets.map((preset) => (preset.id === id ? { ...preset, ...view } : preset)),
        })),
      deletePreset: (id) =>
        set((state) => ({
          presets: state.presets.filter((preset) => preset.id !== id),
        })),
      movePreset: (id, targetId) => {
        const presets = get().presets;
        const fromIndex = presets.findIndex((preset) => preset.id === id);
        const toIndex = presets.findIndex((preset) => preset.id === targetId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return;
        }

        const nextPresets = [...presets];
        const [movedPreset] = nextPresets.splice(fromIndex, 1);
        nextPresets.splice(toIndex, 0, movedPreset);
        set({ presets: nextPresets });
      },
      resetViewPresets: () => set({ presets: [] }),
    }),
    { name: "kvmPortal.viewPresets" },
  ),
);

function nextPresetColor(index: number) {
  return presetColors[index % presetColors.length];
}

function makePresetId() {
  return crypto.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
