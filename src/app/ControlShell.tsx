import { useEffect, useMemo, useRef, useState } from "react";
import { logout, printText, setMouseOutput } from "../services/pikvmHttpApi";
import { PiKvmSocket, type PiKvmSocketStatus } from "../services/pikvmSocket";
import { logError, logInfo } from "../stores/debugLogStore";
import { useAppStateStore, type TerminalProfile } from "../stores/appStateStore";
import type { TerminalAction } from "../types/hid";
import { KvmInputContext, type KvmInput } from "./KvmInputContext";
import { PhoneLayout } from "./PhoneLayout";

const terminalShortcuts: Record<TerminalAction, string[]> = {
  previousTab: ["ControlLeft", "ShiftLeft", "Tab"],
  nextTab: ["ControlLeft", "Tab"],
  newTab: ["MetaLeft", "KeyT"],
  closeTab: ["MetaLeft", "KeyW"],
};

const tmuxActions: Record<TerminalAction, string[]> = {
  previousTab: ["KeyP"],
  nextTab: ["KeyN"],
  newTab: ["KeyC"],
  closeTab: ["ShiftLeft", "Digit7"],
};

export function ControlShell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const socketRef = useRef<PiKvmSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const [socketStatus, setSocketStatus] = useState<PiKvmSocketStatus>("idle");
  const terminalProfile = useAppStateStore((state) => state.terminalProfile);

  useEffect(() => {
    function clearReconnect() {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function connectSocket(reason = "connect") {
      if (document.hidden) {
        return;
      }
      const existing = socketRef.current;
      if (existing?.isOpen() || existing?.isConnecting()) {
        return;
      }

      intentionalCloseRef.current = false;
      clearReconnect();
      logInfo("ws", `Opening state socket: ${reason}.`);
      const socket = new PiKvmSocket({
        onStatus: (status) => {
          setSocketStatus(status);
          logInfo("ws", `State socket ${status}.`);
          if (status === "closed" && !intentionalCloseRef.current && !document.hidden) {
            clearReconnect();
            reconnectTimerRef.current = window.setTimeout(() => connectSocket("visible close retry"), 1000);
          }
        },
        onError: (message) => logInfo("ws", message),
      });
      socketRef.current = socket;
      socket.connect();
    }

    function closeSocket(reason = "close") {
      clearReconnect();
      intentionalCloseRef.current = true;
      logInfo("ws", `Closing state socket: ${reason}.`);
      socketRef.current?.close();
      socketRef.current = null;
      setSocketStatus("closed");
    }

    function onPageHide() {
      closeSocket("pagehide");
    }

    function onPageShow() {
      intentionalCloseRef.current = false;
      connectSocket("pageshow");
    }

    function onVisibilityChange() {
      if (document.hidden) {
        closeSocket("document hidden");
      } else {
        intentionalCloseRef.current = false;
        connectSocket("document visible");
      }
    }

    function onFocus() {
      intentionalCloseRef.current = false;
      connectSocket("focus");
    }

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    connectSocket("initial");

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      closeSocket("unmount");
    };
  }, []);

  const input = useMemo<KvmInput>(
    () => ({
      socketStatus,
      sendKey: async (key) => {
        try {
          await socketRef.current?.sendKey(key);
        } catch (error) {
          logError("hid", error);
        }
      },
      sendShortcut: async (keys) => {
        try {
          await socketRef.current?.sendShortcut(keys);
        } catch (error) {
          logError("hid", error);
        }
      },
      sendText: async (text) => {
        try {
          await printText(text);
        } catch (error) {
          logError("hid-print", error);
        }
      },
      sendMouseRelative: async (x, y) => {
        try {
          await socketRef.current?.sendMouseRelative(x, y);
        } catch (error) {
          logError("mouse", error);
        }
      },
      sendMouseWheel: async (x, y) => {
        try {
          await socketRef.current?.sendMouseWheel(x, y);
        } catch (error) {
          logError("mouse-wheel", error);
        }
      },
      moveMouseAbsolute: async (x, y) => {
        try {
          await setMouseOutput("usb");
          await wait(40);
          await socketRef.current?.moveMouseAbsolute(x, y);
        } catch (error) {
          logError("mouse-rescue", error);
        } finally {
          try {
            await wait(40);
            await setMouseOutput("usb_rel");
          } catch (error) {
            logError("mouse-rescue-restore", error);
          }
        }
      },
      setMouseButton: async (button, state) => {
        try {
          await socketRef.current?.setMouseButton(button, state);
        } catch (error) {
          logError("mouse-button", error);
        }
      },
      clickMouse: async (button = "left") => {
        try {
          await socketRef.current?.clickMouse(button);
        } catch (error) {
          logError("mouse", error);
        }
      },
      sendTerminalAction: async (action) => {
        try {
          await sendTerminalAction(socketRef.current, terminalProfile, action);
        } catch (error) {
          logError("terminal", error);
        }
      },
    }),
    [socketStatus, terminalProfile],
  );

  async function handleLogout() {
    try {
      socketRef.current?.close();
      await logout();
    } catch (error) {
      logError("auth", error);
    } finally {
      onLoggedOut();
    }
  }

  return (
    <KvmInputContext.Provider value={input}>
      <PhoneLayout onLogout={() => void handleLogout()} />
    </KvmInputContext.Provider>
  );
}

async function sendTerminalAction(
  socket: PiKvmSocket | null,
  profile: TerminalProfile,
  action: TerminalAction,
) {
  if (profile === "tmux") {
    await socket?.sendShortcut(["ControlLeft", "KeyB"]);
    await wait(45);
    await socket?.sendShortcut(tmuxActions[action]);
    return;
  }

  await socket?.sendShortcut(terminalShortcuts[action]);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
