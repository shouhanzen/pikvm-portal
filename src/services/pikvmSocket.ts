import type { HidEvent } from "../types/hid";
import { wsUrl } from "./url";

export type PiKvmSocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

type PiKvmSocketOptions = {
  onStatus?: (status: PiKvmSocketStatus) => void;
  onMessage?: (message: string) => void;
  onError?: (message: string) => void;
};

export class PiKvmSocket {
  private socket: WebSocket | null = null;
  private options: PiKvmSocketOptions;

  constructor(options: PiKvmSocketOptions = {}) {
    this.options = options;
  }

  connect() {
    this.close();
    this.options.onStatus?.("connecting");
    const socket = new WebSocket(wsUrl("/api/ws?stream=1"));
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.options.onStatus?.("open");
      this.send({ event_type: "ping", event: {} });
    });

    socket.addEventListener("message", (event) => {
      this.options.onMessage?.(String(event.data));
    });

    socket.addEventListener("error", () => {
      this.options.onStatus?.("error");
      this.options.onError?.("PiKVM WebSocket error");
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.options.onStatus?.("closed");
    });
  }

  close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  isConnecting() {
    return this.socket?.readyState === WebSocket.CONNECTING;
  }

  send(event: HidEvent) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("PiKVM WebSocket is not open.");
    }
    this.socket.send(JSON.stringify(event));
  }

  async sendKey(key: string) {
    this.send({ event_type: "key", event: { key, state: true, finish: true } });
  }

  async sendShortcut(keys: string[]) {
    for (const key of keys) {
      this.send({ event_type: "key", event: { key, state: true } });
      await wait(35);
    }
    for (const key of [...keys].reverse()) {
      this.send({ event_type: "key", event: { key, state: false } });
      await wait(35);
    }
  }

  async sendMouseRelative(x: number, y: number) {
    const deltaX = Math.trunc(x);
    const deltaY = Math.trunc(y);
    if (!deltaX && !deltaY) {
      return;
    }
    this.send({ event_type: "mouse_relative", event: { delta: [{ x: deltaX, y: deltaY }], squash: true } });
  }

  async clickMouse(button: "left" | "right" = "left") {
    this.send({ event_type: "mouse_button", event: { button, state: true } });
    await wait(35);
    this.send({ event_type: "mouse_button", event: { button, state: false } });
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
