import { PointerEvent, useMemo, useRef, useState } from "react";
import { useKvmInput } from "../../app/KvmInputContext";
import { useScribeVoice } from "../../hooks/useScribeVoice";
import { useAppStateStore } from "../../stores/appStateStore";
import { ElevenLabsKeyPrompt } from "./ElevenLabsKeyPrompt";
import { KeyboardKey } from "./KeyboardKey";
import { alphaRows, numberRows, symbolRows, type KeyboardKeySpec } from "./keyboardLayout";
import { VoiceSpacebar } from "./VoiceSpacebar";

const backspaceRepeatDelayMs = 450;
const backspaceRepeatIntervalMs = 70;

export function CustomKeyboard() {
  const input = useKvmInput();
  const keyboardLayer = useAppStateStore((state) => state.keyboardLayer);
  const shiftState = useAppStateStore((state) => state.shiftState);
  const ctrlSticky = useAppStateStore((state) => state.ctrlSticky);
  const altSticky = useAppStateStore((state) => state.altSticky);
  const cmdSticky = useAppStateStore((state) => state.cmdSticky);
  const setKeyboardLayer = useAppStateStore((state) => state.setKeyboardLayer);
  const setShiftState = useAppStateStore((state) => state.setShiftState);
  const setCtrlSticky = useAppStateStore((state) => state.setCtrlSticky);
  const setAltSticky = useAppStateStore((state) => state.setAltSticky);
  const setCmdSticky = useAppStateStore((state) => state.setCmdSticky);
  const setVoiceState = useAppStateStore((state) => state.setVoiceState);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [lastShiftTap, setLastShiftTap] = useState(0);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeKeyIdRef = useRef<string | null>(null);
  const initialKeyIdRef = useRef<string | null>(null);
  const keyboardGestureCancelledRef = useRef(false);
  const backspaceRepeatDelayRef = useRef<number | null>(null);
  const backspaceRepeatIntervalRef = useRef<number | null>(null);
  const backspaceRepeatStartedRef = useRef(false);
  const scribe = useScribeVoice((text) => void input.sendText(text));
  const rows = keyboardLayer === "alpha" ? alphaRows : keyboardLayer === "numbers" ? numberRows : symbolRows;
  const keyById = useMemo(() => new Map(rows.flat().map((key) => [key.id, key])), [rows]);

  async function sendKey(key: KeyboardKeySpec) {
    if (key.kind === "layer") {
      setKeyboardLayer(key.nextLayer || "alpha");
      return;
    }

    if (key.kind === "shift") {
      const now = Date.now();
      if (now - lastShiftTap < 420) {
        setShiftState(shiftState === "locked" ? "off" : "locked");
      } else {
        setShiftState(shiftState === "off" ? "oneShot" : "off");
      }
      setLastShiftTap(now);
      return;
    }

    if (key.text !== undefined) {
      await input.sendText(key.text);
      clearStickyModifiers();
      return;
    }

    if (!key.code) {
      return;
    }

    const modifiers = [
      ctrlSticky ? "ControlLeft" : null,
      altSticky ? "AltLeft" : null,
      cmdSticky ? "MetaLeft" : null,
      key.kind === "letter" && shiftState !== "off" ? "ShiftLeft" : null,
    ].filter(Boolean) as string[];

    if (modifiers.length) {
      await input.sendShortcut([...modifiers, key.code]);
    } else {
      await input.sendKey(key.code);
    }

    if (shiftState === "oneShot") {
      setShiftState("off");
    }
    clearStickyModifiers();
  }

  function clearStickyModifiers() {
    if (ctrlSticky) {
      setCtrlSticky(false);
    }
    if (altSticky) {
      setAltSticky(false);
    }
    if (cmdSticky) {
      setCmdSticky(false);
    }
  }

  async function startVoice() {
    try {
      await scribe.start();
    } catch (error) {
      if (error instanceof Error && error.message === "missing-elevenlabs-key") {
        setShowApiKeyPrompt(true);
      }
    }
  }

  function stopVoice() {
    scribe.stop();
    window.setTimeout(() => setVoiceState("idle"), 1000);
  }

  function onKeyboardPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || activePointerIdRef.current !== null) {
      return;
    }

    const keyId = resolveKeyId(event.currentTarget, event.clientX, event.clientY, event.target);
    if (!keyId || !keyById.has(keyId)) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    initialKeyIdRef.current = keyId;
    keyboardGestureCancelledRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some browser edge cases may not allow pointer capture.
    }
    setActiveKey(keyId);
    if (keyId === "backspace") {
      startBackspaceRepeat();
    }
  }

  function onKeyboardPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== activePointerIdRef.current) {
      return;
    }

    event.preventDefault();
    if (initialKeyIdRef.current === "backspace") {
      return;
    }

    if (isAboveKeyboardCancelZone(event.currentTarget, event.clientY)) {
      keyboardGestureCancelledRef.current = true;
      setActiveKey(null);
      return;
    }
    if (keyboardGestureCancelledRef.current) {
      return;
    }

    const keyId = resolveKeyId(event.currentTarget, event.clientX, event.clientY);
    if (keyId && keyById.has(keyId)) {
      if (keyId === "backspace" && initialKeyIdRef.current !== "backspace") {
        return;
      }
      setActiveKey(keyId);
    }
  }

  function onKeyboardPointerUp(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== activePointerIdRef.current) {
      return;
    }

    event.preventDefault();
    const isBackspaceGesture = initialKeyIdRef.current === "backspace";
    const keyId = isBackspaceGesture
      ? "backspace"
      : keyboardGestureCancelledRef.current
      ? null
      : resolveKeyId(event.currentTarget, event.clientX, event.clientY);
    const resolvedKeyId = keyId === "backspace" && !isBackspaceGesture ? activeKeyIdRef.current : keyId;
    const key = isBackspaceGesture && backspaceRepeatStartedRef.current
      ? null
      : keyboardGestureCancelledRef.current
      ? null
      : resolvedKeyId
        ? keyById.get(resolvedKeyId)
        : activeKeyIdRef.current
          ? keyById.get(activeKeyIdRef.current)
          : null;
    clearActivePointer(event);
    if (key) {
      void sendKey(key);
    }
  }

  function onKeyboardPointerCancel(event: PointerEvent<HTMLElement>) {
    if (event.pointerId === activePointerIdRef.current) {
      stopBackspaceRepeat();
      clearActivePointer(event);
    }
  }

  function clearActivePointer(event: PointerEvent<HTMLElement>) {
    stopBackspaceRepeat();
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Best effort; capture may not exist for synthetic/cancelled pointers.
    }
    activePointerIdRef.current = null;
    activeKeyIdRef.current = null;
    initialKeyIdRef.current = null;
    keyboardGestureCancelledRef.current = false;
    setActiveKeyId(null);
  }

  function setActiveKey(keyId: string | null) {
    activeKeyIdRef.current = keyId;
    setActiveKeyId(keyId);
  }

  function startBackspaceRepeat() {
    stopBackspaceRepeat();
    backspaceRepeatStartedRef.current = false;
    backspaceRepeatDelayRef.current = window.setTimeout(() => {
      backspaceRepeatStartedRef.current = true;
      void input.sendKey("Backspace");
      backspaceRepeatIntervalRef.current = window.setInterval(() => {
        if (activePointerIdRef.current !== null && initialKeyIdRef.current === "backspace") {
          void input.sendKey("Backspace");
        }
      }, backspaceRepeatIntervalMs);
    }, backspaceRepeatDelayMs);
  }

  function stopBackspaceRepeat() {
    if (backspaceRepeatDelayRef.current !== null) {
      window.clearTimeout(backspaceRepeatDelayRef.current);
      backspaceRepeatDelayRef.current = null;
    }
    if (backspaceRepeatIntervalRef.current !== null) {
      window.clearInterval(backspaceRepeatIntervalRef.current);
      backspaceRepeatIntervalRef.current = null;
    }
  }

  return (
    <>
      <section
        className="customKeyboard"
        aria-label="Keyboard"
        onPointerDown={onKeyboardPointerDown}
        onPointerMove={onKeyboardPointerMove}
        onPointerUp={onKeyboardPointerUp}
        onPointerCancel={onKeyboardPointerCancel}
      >
        {rows.map((row, rowIndex) => (
          <div className={`keyboardRow keyboardLayer-${keyboardLayer} row-${rowIndex}`} key={`${keyboardLayer}-${rowIndex}`}>
            {row.map((key) =>
              key.kind === "space" ? (
                <VoiceSpacebar
                  key={key.id}
                  keyId={key.id}
                  active={activeKeyId === key.id}
                  status={scribe.status}
                  onSpace={() => void input.sendKey("Space")}
                  onStartVoice={startVoice}
                  onStopVoice={stopVoice}
                />
              ) : (
                <KeyboardKey
                  key={key.id}
                  keyId={key.id}
                  label={displayLabel(key, shiftState)}
                  active={activeKeyId === key.id}
                  className={[
                    key.wide ? `wide-${key.wide}` : "",
                    key.kind === "shift" && shiftState !== "off" ? "active" : "",
                  ].join(" ")}
                  popup={Boolean(key.popup)}
                />
              ),
            )}
          </div>
        ))}
      </section>
      {showApiKeyPrompt ? <ElevenLabsKeyPrompt onClose={() => setShowApiKeyPrompt(false)} /> : null}
    </>
  );
}

function displayLabel(key: KeyboardKeySpec, shiftState: "off" | "oneShot" | "locked") {
  if (key.kind === "letter" && shiftState !== "off") {
    return key.shiftedLabel || key.label.toUpperCase();
  }
  if (key.kind === "shift") {
    return shiftState === "locked" ? "⇪" : "⇧";
  }
  return key.label;
}

function findKeyId(target: EventTarget | Element | null) {
  return target instanceof Element ? target.closest<HTMLElement>("[data-key-id]")?.dataset.keyId || null : null;
}

function resolveKeyId(keyboard: HTMLElement, clientX: number, clientY: number, target?: EventTarget | Element | null) {
  const directKeyId = findKeyId(target ?? document.elementFromPoint(clientX, clientY));
  if (directKeyId) {
    return directKeyId;
  }

  const keyboardRect = keyboard.getBoundingClientRect();
  if (
    clientX < keyboardRect.left ||
    clientX > keyboardRect.right ||
    clientY < keyboardRect.top ||
    clientY > keyboardRect.bottom
  ) {
    return null;
  }

  let nearest: { id: string; distance: number } | null = null;
  for (const keyElement of keyboard.querySelectorAll<HTMLElement>("[data-key-id]")) {
    const rect = keyElement.getBoundingClientRect();
    const clampedX = clamp(clientX, rect.left, rect.right);
    const clampedY = clamp(clientY, rect.top, rect.bottom);
    const distance = Math.hypot(clientX - clampedX, clientY - clampedY);
    const keyId = keyElement.dataset.keyId;
    if (keyId && (!nearest || distance < nearest.distance)) {
      nearest = { id: keyId, distance };
    }
  }

  return nearest?.id || null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isAboveKeyboardCancelZone(keyboard: HTMLElement, clientY: number) {
  return clientY < keyboard.getBoundingClientRect().top - 24;
}
