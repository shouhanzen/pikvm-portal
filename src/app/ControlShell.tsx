import { useEffect, useMemo, useRef, useState } from "react";
import { logout, printText } from "../services/pikvmHttpApi";
import { PiKvmSocket, type PiKvmSocketStatus } from "../services/pikvmSocket";
import { logDebug, logError } from "../stores/debugLogStore";
import type { TerminalAction } from "../types/hid";
import { KvmInputContext, type KvmInput } from "./KvmInputContext";
import { PhoneLayout } from "./PhoneLayout";

const terminalShortcuts: Record<TerminalAction, string[]> = {
  previousTab: ["ControlLeft", "ShiftLeft", "Tab"],
  nextTab: ["ControlLeft", "Tab"],
  newTab: ["MetaLeft", "KeyT"],
  closeTab: ["MetaLeft", "KeyW"],
};

export function ControlShell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const socketRef = useRef<PiKvmSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const [socketStatus, setSocketStatus] = useState<PiKvmSocketStatus>("idle");

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
      logDebug("ws", `Opening state socket: ${reason}.`);
      const socket = new PiKvmSocket({
        onStatus: (status) => {
          setSocketStatus(status);
          logDebug("ws", `State socket ${status}.`);
          if (status === "closed" && !intentionalCloseRef.current && !document.hidden) {
            clearReconnect();
            reconnectTimerRef.current = window.setTimeout(() => connectSocket("visible close retry"), 1000);
          }
        },
        onError: (message) => logDebug("ws", message),
      });
      socketRef.current = socket;
      socket.connect();
    }

    function closeSocket(reason = "close") {
      clearReconnect();
      intentionalCloseRef.current = true;
      logDebug("ws", `Closing state socket: ${reason}.`);
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
          await socketRef.current?.moveMouseAbsolute(x, y);
        } catch (error) {
          logError("mouse-rescue", error);
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
          await socketRef.current?.sendShortcut(terminalShortcuts[action]);
        } catch (error) {
          logError("terminal", error);
        }
      },
    }),
    [socketStatus],
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
