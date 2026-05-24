import { Mic, Square } from "lucide-react";
import { PointerEvent, useRef } from "react";
import type { ScribeVoiceStatus } from "../../hooks/useScribeVoice";
import { useAppStateStore } from "../../stores/appStateStore";

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
      }
      return;
    }

    voicePreparingRef.current = true;
    if (markRecording) {
      recordingStartedRef.current = true;
      setVoiceState("recordingHeld");
    }
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
      return;
    }

    if (recordingStartedRef.current) {
      onStopVoice();
      setVoiceState("flushing");
      window.setTimeout(() => setVoiceState("idle"), 1000);
    } else {
      if (voicePreparingRef.current || voicePreparedRef.current) {
        onStopVoice();
        voicePreparingRef.current = false;
        voicePreparedRef.current = false;
      }
      setVoiceState("idle");
      onSpace();
    }
  }

  function onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearTimer();
    pointerIdRef.current = null;
    if ((recordingStartedRef.current || voicePreparingRef.current || voicePreparedRef.current) && voiceState !== "recordingLocked") {
      onStopVoice();
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
