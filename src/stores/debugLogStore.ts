import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DebugLogLevel = "error" | "warn" | "info" | "debug" | "trace";
export type DebugLogFilter = DebugLogLevel | "all";

export type DebugLogEntry = {
  id: string;
  timestamp: number;
  isoTime: string;
  category: string;
  level: DebugLogLevel;
  message: string;
  details?: unknown;
};

type DebugLogState = {
  entries: DebugLogEntry[];
  filter: DebugLogFilter;
  addLog: (category: string, level: DebugLogLevel, message: string, details?: unknown) => void;
  setFilter: (filter: DebugLogFilter) => void;
  clearLogs: () => void;
};

const maxEntries = 2000;

export const debugLogLevels: DebugLogLevel[] = ["error", "warn", "info", "debug", "trace"];

export const debugLogLevelPriority: Record<DebugLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

export const useDebugLogStore = create<DebugLogState>()(
  persist(
    (set) => ({
      entries: [],
      filter: "info",
      addLog: (category, level, message, details) =>
        set((state) => {
          const timestamp = Date.now();
          return {
            entries: [
              ...state.entries,
              {
                id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
                timestamp,
                isoTime: new Date(timestamp).toISOString(),
                category,
                level,
                message,
                details,
              },
            ].slice(-maxEntries),
          };
        }),
      setFilter: (filter) => set({ filter }),
      clearLogs: () => set({ entries: [] }),
    }),
    {
      name: "kvmPortal.debugLogs",
      partialize: (state) => ({ filter: state.filter }),
    },
  ),
);

export function logInfo(area: string, message: string, details?: unknown) {
  useDebugLogStore.getState().addLog(area, "info", message, details);
}

export function logDebug(area: string, message: string, details?: unknown) {
  useDebugLogStore.getState().addLog(area, "debug", message, details);
}

export function logTrace(area: string, message: string, details?: unknown) {
  useDebugLogStore.getState().addLog(area, "trace", message, details);
}

export function logWarn(area: string, message: string, details?: unknown) {
  useDebugLogStore.getState().addLog(area, "warn", message, details);
}

export function logAppEvent(area: string, message: string) {
  useDebugLogStore.getState().addLog(area, "info", message);
}

export function logError(area: string, error: unknown) {
  useDebugLogStore.getState().addLog(area, "error", error instanceof Error ? error.message : String(error), error);
}
