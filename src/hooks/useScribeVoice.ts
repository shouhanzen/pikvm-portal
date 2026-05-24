import { useRef, useState } from "react";
import type { RealtimeConnection } from "@elevenlabs/client";
import { mintScribeToken } from "../services/scribeClient";
import { startAppOwnedScribeMicrophoneCapture, stopActiveScribeMicrophoneCapture } from "../services/scribeMicrophone";
import { logDebug, logError } from "../stores/debugLogStore";
import { useLocalSecretsStore } from "../stores/localSecretsStore";

export type ScribeVoiceStatus = "idle" | "connecting" | "recording" | "flushing" | "error";

export function useScribeVoice(onCommittedText: (text: string) => void) {
  const apiKey = useLocalSecretsStore((state) => state.elevenLabsApiKey);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const lifecycleIdRef = useRef(0);
  const audioChunksSentRef = useRef(0);
  const [status, setStatus] = useState<ScribeVoiceStatus>("idle");
  const [error, setError] = useState("");

  async function start() {
    if (!apiKey) {
      throw new Error("missing-elevenlabs-key");
    }

    cleanup();
    const lifecycleId = nextLifecycleId();
    setError("");
    setStatus("connecting");

    try {
      const token = await mintScribeToken(apiKey);
      if (lifecycleIdRef.current !== lifecycleId) {
        return;
      }

      const { AudioFormat, CommitStrategy, RealtimeEvents, Scribe } = await import("@elevenlabs/client");
      if (lifecycleIdRef.current !== lifecycleId) {
        return;
      }

      const connection = Scribe.connect({
        token,
        modelId: "scribe_v2_realtime",
        includeTimestamps: false,
        commitStrategy: CommitStrategy.MANUAL,
        audioFormat: AudioFormat.PCM_16000,
        sampleRate: 16000,
      });
      if (lifecycleIdRef.current !== lifecycleId) {
        connection.close();
        return;
      }

      connectionRef.current = connection;
      audioChunksSentRef.current = 0;
      connection.on(RealtimeEvents.OPEN, () => {
        if (connectionRef.current !== connection) {
          return;
        }
        const captureAbort = new AbortController();
        captureAbortRef.current = captureAbort;
        void startAppOwnedScribeMicrophoneCapture(
          {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          (audioBase64) => {
            if (connectionRef.current !== connection || captureAbort.signal.aborted) {
              return;
            }
            connection.send({ audioBase64, sampleRate: 16000 });
            audioChunksSentRef.current += 1;
          },
          captureAbort.signal,
        )
          .then(() => {
            if (connectionRef.current !== connection || captureAbort.signal.aborted) {
              return;
            }
            setStatus("recording");
            logDebug("scribe", "Scribe voice session opened with app-owned microphone capture.");
          })
          .catch((captureError) => {
            if (captureAbort.signal.aborted || connectionRef.current !== connection) {
              return;
            }
            setStatus("error");
            setError(captureError instanceof Error ? captureError.message : String(captureError));
            logError("scribe", captureError);
          });
      });
      connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
        if (connectionRef.current !== connection) {
          return;
        }
        if (data.text) {
          onCommittedText(data.text);
          logDebug("scribe", `Committed transcript: ${data.text}`);
        }
      });
      connection.on(RealtimeEvents.ERROR, (data) => {
        if (connectionRef.current !== connection) {
          return;
        }
        setStatus("error");
        setError(data.error);
        logDebug("scribe", data.error);
      });
      connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
        if (connectionRef.current !== connection) {
          return;
        }
        setStatus("error");
        setError(data.error);
        logDebug("scribe", data.error);
      });
      connection.on(RealtimeEvents.CLOSE, () => {
        if (connectionRef.current === connection) {
          connectionRef.current = null;
          captureAbortRef.current?.abort();
          captureAbortRef.current = null;
          stopActiveScribeMicrophoneCapture();
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
      cleanup();
      setStatus("idle");
      return;
    }

    setStatus("flushing");
    if (audioChunksSentRef.current > 0) {
      try {
        connection.commit();
      } catch (commitError) {
        logError("scribe", commitError);
      }
    }
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    stopActiveScribeMicrophoneCapture();

    closeTimerRef.current = window.setTimeout(() => {
      cleanup();
      setStatus("idle");
    }, 1000);
  }

  function cleanup() {
    nextLifecycleId();
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    stopActiveScribeMicrophoneCapture();
    try {
      connectionRef.current?.close();
    } catch {
      // Best-effort cleanup.
    }
    connectionRef.current = null;
  }

  function nextLifecycleId() {
    lifecycleIdRef.current += 1;
    return lifecycleIdRef.current;
  }

  return { status, error, start, stop };
}
