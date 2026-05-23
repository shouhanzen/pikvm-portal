import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SourceAnchor } from "../types/view";

type ViewState = {
  scale: number;
  sourceAnchor: SourceAnchor;
  setView: (view: { scale: number; sourceAnchor: SourceAnchor }) => void;
  resetView: () => void;
};

const defaultView = {
  scale: 1,
  sourceAnchor: { x: 0.5, y: 1 },
};

export const useViewStateStore = create<ViewState>()(
  persist(
    (set) => ({
      ...defaultView,
      setView: (view) => set(view),
      resetView: () => set(defaultView),
    }),
    { name: "kvmPortal.viewState" },
  ),
);
