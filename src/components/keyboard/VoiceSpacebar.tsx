import { Mic, Square } from "lucide-react";
import { PointerEvent, useRef } from "react";
import type { ScribeVoiceStatus } from "../../hooks/useScribeVoice";
import { useAppStateStore } from "../../stores/appStateStore";
import { logTrace } from "../../stores/debugLogStore";

const longPressMs = 430;
const prepareVoiceMs = 215;
const lockDistancePx = 54;

export function VoiceSpacebar({
  keyId,
  active = false,
  status,
  onSpace,
  onStartVoice,
  onStopVoice,
}: {
  keyId: string;
  active?: boolean;
  status: ScribeVoiceStatus;
  onSpace: () => void;
  onStartVoice: () => Promise<void>;
  onStopVoice: () => void;
}) {
  const voiceState = useAppStateStore((state) => state.voiceState);
  const setVoiceState = useAppStateStore((state) => state.setVoiceState);
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const prepareTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const voicePreparingRef = useRef(false);
  const voicePreparedRef = useRef(false);
  const recordingStartedRef = useRef(false);

  const recording = voiceState === "recordingHeld" || voiceState === "recordingLocked" || status === "recording";
  const locked = voiceState === "recordingLocked";

  function clearTimer() {
    if (prepareTimerRef.current) {
      window.clearTimeout(prepareTimerRef.current);
      prepareTimerRef.current = null;
    }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startVoice(markRecording = true) {
    if (voicePreparingRef.current || voicePreparedRef.current || recordingStartedRef.current) {
      if (markRecording) {
        recordingStartedRef.current = true;
        setVoiceState("recordingHeld");
        logTrace("keyboard", "space voice recording marked after prepare");
      }
      return;
    }

    voicePreparingRef.current = true;
    if (markRecording) {
      recordingStartedRef.current = true;
      setVoiceState("recordingHeld");
    }
    logTrace("keyboard", markRecording ? "space voice start" : "space voice prepare");
    try {
      await onStartVoice();
      voicePreparedRef.current = true;
    } catch {
      setVoiceState("idle");
      recordingStartedRef.current = false;
      voicePreparedRef.current = false;
    } finally {
      voicePreparingRef.current = false;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (locked) {
      onStopVoice();
      setVoiceState("flushing");
      return;
    }

    pointerIdRef.current = event.pointerId;
    startYRef.current = event.clientY;
    voicePreparedRef.current = false;
    recordingStartedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setVoiceState("pressing");
    logTrace("keyboard", "space pointerdown", pointerDetails(event));
    prepareTimerRef.current = window.setTimeout(() => {
      void startVoice(false);
    }, prepareVoiceMs);
    timerRef.current = window.setTimeout(() => {
      void startVoice();
    }, longPressMs);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.pointerId !== pointerIdRef.current || voiceState !== "recordingHeld") {
      return;
    }

    if (startYRef.current - event.clientY > lockDistancePx) {
      setVoiceState("recordingLocked");
      logTrace("keyboard", "space voice locked", pointerDetails(event));
    }
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.pointerId !== pointerIdRef.current) {
      return;
    }

    clearTimer();
    pointerIdRef.current = null;

    if (voiceState === "recordingLocked") {
      logTrace("keyboard", "space pointerup locked no-stop", pointerDetails(event));
      return;
    }

    if (recordingStartedRef.current) {
      logTrace("keyboard", "space pointerup stop voice", pointerDetails(event));
      onStopVoice();
      setVoiceState("flushing");
      window.setTimeout(() => setVoiceState("idle"), 1000);
    } else {
      if (voicePreparingRef.current || voicePreparedRef.current) {
        logTrace("keyboard", "space pointerup cancel prepared voice", pointerDetails(event));
        onStopVoice();
        voicePreparingRef.current = false;
        voicePreparedRef.current = false;
      }
      setVoiceState("idle");
      logTrace("keyboard", "space pointerup commit space", pointerDetails(event));
      onSpace();
    }
  }

  function onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearTimer();
    pointerIdRef.current = null;
    if ((recordingStartedRef.current || voicePreparingRef.current || voicePreparedRef.current) && voiceState !== "recordingLocked") {
      logTrace("keyboard", "space pointercancel stop voice", pointerDetails(event));
      onStopVoice();
    } else {
      logTrace("keyboard", "space pointercancel", pointerDetails(event));
    }
    voicePreparingRef.current = false;
    voicePreparedRef.current = false;
    setVoiceState("idle");
  }

  return (
    <button
      type="button"
      className={`keyboardKey voiceSpacebar ${active ? "pressed" : ""} ${recording ? "recording" : ""} ${locked ? "locked" : ""}`}
      data-key-id={keyId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="voiceIcon" aria-hidden="true">
        {recording ? <Wave /> : <Mic size={18} />}
      </span>
      <span>{locked ? "stop" : "space"}</span>
      {locked ? (
        <span className="stopBubble" aria-hidden="true">
          <Square size={13} fill="currentColor" />
        </span>
      ) : null}
    </button>
  );
}

function pointerDetails(event: PointerEvent<HTMLButtonElement>) {
  return {
    pointerId: event.pointerId,
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
    pointerType: event.pointerType,
  };
}

function Wave() {
  return (
    <span className="voiceWave" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
