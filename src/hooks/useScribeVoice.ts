import { useRef, useState } from "react";
import type { RealtimeConnection } from "@elevenlabs/client";
import { mintScribeToken } from "../services/scribeClient";
import { logDebug, logError } from "../stores/debugLogStore";
import { useLocalSecretsStore } from "../stores/localSecretsStore";

export type ScribeVoiceStatus = "idle" | "connecting" | "recording" | "flushing" | "error";

export function useScribeVoice(onCommittedText: (text: string) => void) {
  const apiKey = useLocalSecretsStore((state) => state.elevenLabsApiKey);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ScribeVoiceStatus>("idle");
  const [error, setError] = useState("");

  async function start() {
    if (!apiKey) {
      throw new Error("missing-elevenlabs-key");
    }

    cleanup();
    setError("");
    setStatus("connecting");

    try {
      const token = await mintScribeToken(apiKey);
      const { CommitStrategy, RealtimeEvents, Scribe } = await import("@elevenlabs/client");
      const connection = Scribe.connect({
        token,
        modelId: "scribe_v2_realtime",
        includeTimestamps: false,
        commitStrategy: CommitStrategy.VAD,
        vadSilenceThresholdSecs: 0.8,
        vadThreshold: 0.4,
        minSpeechDurationMs: 100,
        minSilenceDurationMs: 250,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      connectionRef.current = connection;
      connection.on(RealtimeEvents.OPEN, () => {
        setStatus("recording");
        logDebug("scribe", "Scribe voice session opened.");
      });
      connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
        if (data.text) {
          onCommittedText(data.text);
          logDebug("scribe", `Committed transcript: ${data.text}`);
        }
      });
      connection.on(RealtimeEvents.ERROR, (data) => {
        setStatus("error");
        setError(data.error);
        logDebug("scribe", data.error);
      });
      connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
        setStatus("error");
        setError(data.error);
        logDebug("scribe", data.error);
      });
      connection.on(RealtimeEvents.CLOSE, () => {
        if (connectionRef.current === connection) {
          connectionRef.current = null;
        }
        if (status !== "error") {
          setStatus("idle");
        }
      });
    } catch (startError) {
      setStatus("error");
      setError(startError instanceof Error ? startError.message : String(startError));
      logError("scribe", startError);
      throw startError;
    }
  }

  function stop() {
    const connection = connectionRef.current;
    if (!connection) {
      setStatus("idle");
      return;
    }

    setStatus("flushing");
    try {
      connection.commit();
    } catch (commitError) {
      logError("scribe", commitError);
    }

    closeTimerRef.current = window.setTimeout(() => {
      cleanup();
      setStatus("idle");
    }, 1000);
  }

  function cleanup() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    try {
      connectionRef.current?.close();
    } catch {
      // Best-effort cleanup.
    }
    connectionRef.current = null;
  }

  return { status, error, start, stop };
}
