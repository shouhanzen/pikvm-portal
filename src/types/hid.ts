export type HidKeyCode = string;

export type HidEvent =
  | { event_type: "key"; event: { key: string; state: boolean; finish?: boolean } }
  | { event_type: "mouse_button"; event: { button: "left" | "right"; state: boolean } }
  | { event_type: "mouse_move"; event: { to: { x: number; y: number } } }
  | { event_type: "mouse_relative"; event: { delta: Array<{ x: number; y: number }>; squash: boolean } }
  | { event_type: "mouse_wheel"; event: { delta: { x: number; y: number } } }
  | { event_type: "ping"; event: Record<string, never> };

export type TerminalAction = "previousTab" | "nextTab" | "newTab" | "closeTab";
