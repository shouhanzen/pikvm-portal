import { create } from "zustand";
import { persist } from "zustand/middleware";

type InputPrefsState = {
  mouseSensitivity: number;
  scrollTickDistance: number;
  scrollRepeatRate: number;
  setMouseSensitivity: (value: number) => void;
  setScrollTickDistance: (value: number) => void;
  setScrollRepeatRate: (value: number) => void;
  resetInputPrefs: () => void;
};

const defaults = {
  mouseSensitivity: 1,
  scrollTickDistance: 26,
  scrollRepeatRate: 8,
};

export const useInputPrefsStore = create<InputPrefsState>()(
  persist(
    (set) => ({
      ...defaults,
      setMouseSensitivity: (mouseSensitivity) => set({ mouseSensitivity }),
      setScrollTickDistance: (scrollTickDistance) => set({ scrollTickDistance }),
      setScrollRepeatRate: (scrollRepeatRate) => set({ scrollRepeatRate }),
      resetInputPrefs: () => set(defaults),
    }),
    { name: "kvmPortal.inputPrefs" },
  ),
);
