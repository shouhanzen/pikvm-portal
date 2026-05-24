import { PointerEvent, useMemo, useRef, useState } from "react";
import { useKvmInput } from "../../app/KvmInputContext";
import { useScribeVoice } from "../../hooks/useScribeVoice";
import { useAppStateStore } from "../../stores/appStateStore";
import { logTrace } from "../../stores/debugLogStore";
import { ElevenLabsKeyPrompt } from "./ElevenLabsKeyPrompt";
import { KeyboardKey } from "./KeyboardKey";
import { alphaRows, numberRows, symbolRows, type KeyboardKeySpec } from "./keyboardLayout";
import { VoiceSpacebar } from "./VoiceSpacebar";

const backspaceRepeatDelayMs = 450;
const backspaceRepeatIntervalMs = 70;

type KeyboardPointerSession = {
  pointerId: number;
  initialKeyId: string;
  activeKeyId: string | null;
  cancelled: boolean;
  order: number;
  protected: boolean;
};

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
  const [activeKeyIds, setActiveKeyIds] = useState<string[]>([]);
  const pointerSessionsRef = useRef<Map<number, KeyboardPointerSession>>(new Map());
  const pointerOrderRef = useRef(0);
  const backspacePointerIdRef = useRef<number | null>(null);
  const backspaceRepeatDelayRef = useRef<number | null>(null);
  const backspaceRepeatIntervalRef = useRef<number | null>(null);
  const backspaceRepeatStartedRef = useRef(false);
  const scribe = useScribeVoice((text) => void input.sendText(text));
  const rows = keyboardLayer === "alpha" ? alphaRows : keyboardLayer === "numbers" ? numberRows : symbolRows;
  const keyById = useMemo(() => new Map(rows.flat().map((key) => [key.id, key])), [rows]);

  async function sendKey(key: KeyboardKeySpec) {
    if (key.kind === "layer") {
      logTrace("keyboard", `action layer key=${key.id} next=${key.nextLayer || "alpha"}`);
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
      logTrace("keyboard", `action shift key=${key.id}`);
      return;
    }

    if (key.text !== undefined) {
      logTrace("keyboard", `send text key=${key.id}`, { text: key.text });
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
      logTrace("keyboard", `send shortcut key=${key.id} code=${key.code}`, { modifiers });
      await input.sendShortcut([...modifiers, key.code]);
    } else {
      logTrace("keyboard", `send key key=${key.id} code=${key.code}`);
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
    if (event.button !== 0 || pointerSessionsRef.current.has(event.pointerId)) {
      return;
    }

    const keyId = resolveKeyId(event.currentTarget, event.clientX, event.clientY, event.target);
    const key = keyId ? keyById.get(keyId) : null;
    if (!keyId || !key) {
      logTrace("keyboard", "pointerdown ignored no-key", pointerDetails(event, { resolvedKeyId: keyId, layer: keyboardLayer }));
      return;
    }
    if (key.kind === "backspace" && backspacePointerIdRef.current !== null) {
      logTrace("keyboard", "pointerdown ignored backspace owned", pointerDetails(event, { owner: backspacePointerIdRef.current }));
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some browser edge cases may not allow pointer capture.
    }
    const session: KeyboardPointerSession = {
      pointerId: event.pointerId,
      initialKeyId: keyId,
      activeKeyId: keyId,
      cancelled: false,
      order: pointerOrderRef.current + 1,
      protected: key.kind === "backspace",
    };
    pointerOrderRef.current = session.order;
    pointerSessionsRef.current.set(event.pointerId, session);
    logTrace("keyboard", `pointerdown key=${keyId}`, pointerDetails(event, { layer: keyboardLayer }));
    syncActiveKeys();
    if (key.kind === "backspace") {
      backspacePointerIdRef.current = event.pointerId;
      startBackspaceRepeat(event.pointerId);
    }
  }

  function onKeyboardPointerMove(event: PointerEvent<HTMLElement>) {
    const session = pointerSessionsRef.current.get(event.pointerId);
    if (!session) {
      return;
    }

    event.preventDefault();
    if (session.initialKeyId === "backspace") {
      return;
    }

    if (isAboveKeyboardCancelZone(event.currentTarget, event.clientY)) {
      session.cancelled = true;
      logTrace("keyboard", "pointermove cancel top-edge", pointerDetails(event, { initialKeyId: session.initialKeyId }));
      setSessionActiveKey(session, null, "top-edge-cancel");
      return;
    }
    if (session.cancelled) {
      return;
    }

    const keyId = resolveKeyId(event.currentTarget, event.clientX, event.clientY);
    if (keyId && keyById.has(keyId)) {
      if (keyId === "backspace" && session.initialKeyId !== "backspace") {
        logTrace("keyboard", "pointermove ignored backspace rearm", pointerDetails(event, { initialKeyId: session.initialKeyId }));
        return;
      }
      setSessionActiveKey(session, keyId, "pointermove");
    }
  }

  function onKeyboardPointerUp(event: PointerEvent<HTMLElement>) {
    const session = pointerSessionsRef.current.get(event.pointerId);
    if (!session) {
      return;
    }

    event.preventDefault();
    if (!session.protected && !session.cancelled) {
      const keyId = resolveKeyId(event.currentTarget, event.clientX, event.clientY);
      if (keyId && keyById.has(keyId) && keyId !== "backspace") {
        setSessionActiveKey(session, keyId, "pointerup-resolve");
      }
    }

    if (session.protected) {
      const key = getSessionCommitKey(session);
      logTrace(
        "keyboard",
        key ? `pointerup commit key=${key.id}` : "pointerup no-commit",
        pointerDetails(event, {
          initialKeyId: session.initialKeyId,
          activeKeyId: session.activeKeyId,
          cancelled: session.cancelled,
          backspaceRepeatStarted: backspaceRepeatStartedRef.current,
        }),
      );
      clearSession(event.currentTarget, session.pointerId);
      if (key) {
        void sendKey(key);
      }
      return;
    }

    const flushSessions = [...pointerSessionsRef.current.values()]
      .filter((candidate) => !candidate.protected && candidate.order <= session.order)
      .sort((a, b) => a.order - b.order);
    const flushKeys = flushSessions
      .map((candidate) => {
        const key = getSessionCommitKey(candidate);
        logTrace(
          "keyboard",
          key ? `flush commit key=${key.id}` : "flush no-commit",
          pointerDetails(event, {
            pointerId: candidate.pointerId,
            initialKeyId: candidate.initialKeyId,
            activeKeyId: candidate.activeKeyId,
            cancelled: candidate.cancelled,
            forced: candidate.pointerId !== session.pointerId,
          }),
        );
        return key;
      })
      .filter(Boolean) as KeyboardKeySpec[];

    for (const candidate of flushSessions) {
      clearSession(event.currentTarget, candidate.pointerId);
    }
    void sendKeysInOrder(flushKeys);
  }

  function onKeyboardPointerCancel(event: PointerEvent<HTMLElement>) {
    const session = pointerSessionsRef.current.get(event.pointerId);
    if (session) {
      logTrace("keyboard", "pointercancel", pointerDetails(event, {
        initialKeyId: session.initialKeyId,
        activeKeyId: session.activeKeyId,
      }));
      clearSession(event.currentTarget, session.pointerId);
    }
  }

  function getSessionCommitKey(session: KeyboardPointerSession) {
    if (session.protected && session.initialKeyId === "backspace" && backspaceRepeatStartedRef.current) {
      return null;
    }
    if (session.cancelled || !session.activeKeyId) {
      return null;
    }
    return keyById.get(session.activeKeyId) || null;
  }

  async function sendKeysInOrder(keys: KeyboardKeySpec[]) {
    for (const key of keys) {
      await sendKey(key);
    }
  }

  function clearSession(keyboard: HTMLElement, pointerId: number) {
    const session = pointerSessionsRef.current.get(pointerId);
    if (!session) {
      return;
    }
    if (session.protected && session.initialKeyId === "backspace") {
      stopBackspaceRepeat();
      if (backspacePointerIdRef.current === pointerId) {
        backspacePointerIdRef.current = null;
      }
    }
    pointerSessionsRef.current.delete(pointerId);
    try {
      if (keyboard.hasPointerCapture(pointerId)) {
        keyboard.releasePointerCapture(pointerId);
      }
    } catch {
      // Best effort; capture may not exist for synthetic/cancelled pointers.
    }
    syncActiveKeys();
  }

  function setSessionActiveKey(session: KeyboardPointerSession, keyId: string | null, reason: string) {
    if (session.activeKeyId !== keyId) {
      logTrace("keyboard", `active p${session.pointerId} ${session.activeKeyId || "none"} -> ${keyId || "none"} (${reason})`);
    }
    session.activeKeyId = keyId;
    syncActiveKeys();
  }

  function syncActiveKeys() {
    const keyIds = new Set<string>();
    for (const session of pointerSessionsRef.current.values()) {
      if (session.activeKeyId) {
        keyIds.add(session.activeKeyId);
      }
    }
    setActiveKeyIds([...keyIds]);
  }

  function startBackspaceRepeat(pointerId: number) {
    stopBackspaceRepeat();
    backspaceRepeatStartedRef.current = false;
    logTrace("keyboard", "backspace repeat armed");
    backspaceRepeatDelayRef.current = window.setTimeout(() => {
      backspaceRepeatStartedRef.current = true;
      logTrace("keyboard", "backspace repeat started");
      void input.sendKey("Backspace");
      backspaceRepeatIntervalRef.current = window.setInterval(() => {
        const session = pointerSessionsRef.current.get(pointerId);
        if (session?.initialKeyId === "backspace") {
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
                  active={activeKeyIds.includes(key.id)}
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
                  active={activeKeyIds.includes(key.id)}
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

function pointerDetails(event: PointerEvent<HTMLElement>, extra: Record<string, unknown> = {}) {
  return {
    pointerId: event.pointerId,
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
    pointerType: event.pointerType,
    ...extra,
  };
}
