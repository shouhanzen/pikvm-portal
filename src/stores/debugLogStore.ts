import { create } from "zustand";

export type DebugLogLevel = "info" | "warn" | "error";

export type DebugLogEntry = {
  id: string;
  time: string;
  area: string;
  level: DebugLogLevel;
  message: string;
};

type DebugLogState = {
  entries: DebugLogEntry[];
  addLog: (area: string, level: DebugLogLevel, message: string) => void;
  clearLogs: () => void;
};

const maxEntries = 200;

export const useDebugLogStore = create<DebugLogState>((set) => ({
  entries: [],
  addLog: (area, level, message) =>
    set((state) => ({
      entries: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          time: new Date().toLocaleTimeString(),
          area,
          level,
          message,
        },
        ...state.entries,
      ].slice(0, maxEntries),
    })),
  clearLogs: () => set({ entries: [] }),
}));

export function logDebug(area: string, message: string) {
  useDebugLogStore.getState().addLog(area, "info", message);
}

export function logError(area: string, error: unknown) {
  useDebugLogStore
    .getState()
    .addLog(area, "error", error instanceof Error ? error.message : String(error));
}
