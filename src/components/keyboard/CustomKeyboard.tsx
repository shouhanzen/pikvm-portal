import { PointerEvent, useMemo, useRef, useState } from "react";
import { useKvmInput } from "../../app/KvmInputContext";
import { useScribeVoice } from "../../hooks/useScribeVoice";
import { useAppStateStore } from "../../stores/appStateStore";
import { ElevenLabsKeyPrompt } from "./ElevenLabsKeyPrompt";
import { KeyboardKey } from "./KeyboardKey";
import { alphaRows, numberRows, symbolRows, type KeyboardKeySpec } from "./keyboardLayout";
import { VoiceSpacebar } from "./VoiceSpacebar";

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

    const keyId = findKeyId(event.target);
    if (!keyId || !keyById.has(keyId)) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some browser edge cases may not allow pointer capture.
    }
    setActiveKeyId(keyId);
  }

  function onKeyboardPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== activePointerIdRef.current) {
      return;
    }

    event.preventDefault();
    const keyId = findKeyId(document.elementFromPoint(event.clientX, event.clientY));
    setActiveKeyId(keyId && keyById.has(keyId) ? keyId : null);
  }

  function onKeyboardPointerUp(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== activePointerIdRef.current) {
      return;
    }

    event.preventDefault();
    const keyId = findKeyId(document.elementFromPoint(event.clientX, event.clientY));
    const key = keyId ? keyById.get(keyId) : null;
    clearActivePointer(event);
    if (key) {
      void sendKey(key);
    }
  }

  function onKeyboardPointerCancel(event: PointerEvent<HTMLElement>) {
    if (event.pointerId === activePointerIdRef.current) {
      clearActivePointer(event);
    }
  }

  function clearActivePointer(event: PointerEvent<HTMLElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Best effort; capture may not exist for synthetic/cancelled pointers.
    }
    activePointerIdRef.current = null;
    setActiveKeyId(null);
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
