import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KeyboardLayer = "alpha" | "numbers" | "symbols";
export type ShiftState = "off" | "oneShot" | "locked";
export type SettingsTab = "general" | "inputs" | "secrets";
export type TerminalProfile = "macTerminal" | "tmux";
export type VoiceState = "idle" | "pressing" | "recordingHeld" | "recordingLocked" | "flushing";

type AppState = {
  keyboardVisible: boolean;
  terminalProfile: TerminalProfile;
  keyboardLayer: KeyboardLayer;
  shiftState: ShiftState;
  ctrlSticky: boolean;
  altSticky: boolean;
  cmdSticky: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  debugOverlayEnabled: boolean;
  debugLogOpen: boolean;
  voiceState: VoiceState;
  setKeyboardVisible: (visible: boolean) => void;
  toggleKeyboardVisible: () => void;
  setTerminalProfile: (profile: TerminalProfile) => void;
  setKeyboardLayer: (layer: KeyboardLayer) => void;
  setShiftState: (state: ShiftState) => void;
  setCtrlSticky: (value: boolean) => void;
  setAltSticky: (value: boolean) => void;
  setCmdSticky: (value: boolean) => void;
  clearKeyboardTransientState: () => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setDebugOverlayEnabled: (enabled: boolean) => void;
  setDebugLogOpen: (open: boolean) => void;
  setVoiceState: (state: VoiceState) => void;
  resetAppState: () => void;
};

const transientDefaults = {
  keyboardLayer: "alpha" as KeyboardLayer,
  shiftState: "off" as ShiftState,
  ctrlSticky: false,
  altSticky: false,
  cmdSticky: false,
  voiceState: "idle" as VoiceState,
};

export const useAppStateStore = create<AppState>()(
  persist(
    (set) => ({
      keyboardVisible: true,
      terminalProfile: "macTerminal",
      settingsOpen: false,
      settingsTab: "general",
      debugOverlayEnabled: false,
      debugLogOpen: false,
      ...transientDefaults,
      setKeyboardVisible: (visible) =>
        set({
          keyboardVisible: visible,
          ...transientDefaults,
        }),
      toggleKeyboardVisible: () =>
        set((state) => ({
          keyboardVisible: !state.keyboardVisible,
          ...transientDefaults,
        })),
      setTerminalProfile: (terminalProfile) => set({ terminalProfile }),
      setKeyboardLayer: (layer) => set({ keyboardLayer: layer, shiftState: "off" }),
      setShiftState: (shiftState) => set({ shiftState }),
      setCtrlSticky: (ctrlSticky) => set({ ctrlSticky }),
      setAltSticky: (altSticky) => set({ altSticky }),
      setCmdSticky: (cmdSticky) => set({ cmdSticky }),
      clearKeyboardTransientState: () => set(transientDefaults),
      openSettings: (tab = "general") =>
        set({
          settingsOpen: true,
          settingsTab: tab,
          ...transientDefaults,
        }),
      closeSettings: () => set({ settingsOpen: false, ...transientDefaults }),
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      setDebugOverlayEnabled: (debugOverlayEnabled) => set({ debugOverlayEnabled }),
      setDebugLogOpen: (debugLogOpen) => set({ debugLogOpen }),
      setVoiceState: (voiceState) => set({ voiceState }),
      resetAppState: () =>
        set({
          keyboardVisible: true,
          terminalProfile: "macTerminal",
          settingsOpen: false,
          settingsTab: "general",
          debugOverlayEnabled: false,
          debugLogOpen: false,
          ...transientDefaults,
        }),
    }),
    {
      name: "kvmPortal.appState",
      partialize: (state) => ({
        keyboardVisible: state.keyboardVisible,
        terminalProfile: state.terminalProfile,
        debugOverlayEnabled: state.debugOverlayEnabled,
      }),
    },
  ),
);
