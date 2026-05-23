import { createContext, useContext } from "react";
import type { PiKvmSocketStatus } from "../services/pikvmSocket";
import type { TerminalAction } from "../types/hid";

export type KvmInput = {
  socketStatus: PiKvmSocketStatus;
  sendKey: (key: string) => Promise<void>;
  sendShortcut: (keys: string[]) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendMouseRelative: (x: number, y: number) => Promise<void>;
  sendMouseWheel: (x: number, y: number) => Promise<void>;
  moveMouseAbsolute: (x: number, y: number) => Promise<void>;
  setMouseButton: (button: "left" | "right", state: boolean) => Promise<void>;
  clickMouse: (button?: "left" | "right") => Promise<void>;
  sendTerminalAction: (action: TerminalAction) => Promise<void>;
};

export const KvmInputContext = createContext<KvmInput | null>(null);

export function useKvmInput() {
  const input = useContext(KvmInputContext);
  if (!input) {
    throw new Error("useKvmInput must be used inside ControlShell.");
  }
  return input;
}
