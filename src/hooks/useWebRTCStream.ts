import { RefObject, useEffect, useRef, useState } from "react";
import { startJanusWebRtcStream, type StartedJanusStream } from "../services/janusWebRtc";
import { logError, logInfo } from "../stores/debugLogStore";

export type WebRTCStatus = "idle" | "connecting" | "rendering" | "paused" | "error";

export function useWebRTCStream(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<WebRTCStatus>("idle");
  const [detail, setDetail] = useState("WebRTC not started.");
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const statusRef = useRef<WebRTCStatus>("idle");

  function updateStatus(nextStatus: WebRTCStatus, nextDetail: string) {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setDetail(nextDetail);
  }

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }
    const video = videoElement as HTMLVideoElement;

    let stream: StartedJanusStream | null = null;
    let startToken = 0;
    let abortController: AbortController | null = null;
    let retryTimer: number | null = null;

    function clearRetry() {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    function stopStream(nextStatus: WebRTCStatus, nextDetail: string) {
      startToken += 1;
      clearRetry();
      abortController?.abort();
      abortController = null;
      stream?.stop();
      stream = null;
      updateStatus(nextStatus, nextDetail);
    }

    async function start(reason = "Connecting WebRTC...") {
      if (document.hidden) {
        stopStream("paused", "Paused while the app is in the background.");
        return;
      }

      clearRetry();
      abortController?.abort();
      stream?.stop();
      stream = null;

      const token = startToken + 1;
      startToken = token;
      abortController = new AbortController();
      updateStatus("connecting", reason);

      try {
        const nextStream = await startJanusWebRtcStream(video, (message) => {
          setDetail(message);
          logInfo("webrtc", message);
        }, abortController.signal);
        if (token !== startToken || document.hidden) {
          nextStream.stop();
          return;
        }
        stream = nextStream;
        updateStatus("rendering", "WebRTC rendering.");
      } catch (error) {
        if (token !== startToken) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          logInfo("webrtc", "WebRTC startup aborted.");
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        updateStatus("error", message);
        logError("webrtc", error);
        if (!document.hidden) {
          retryTimer = window.setTimeout(() => {
            void start("Reconnecting WebRTC...");
          }, 1500);
        }
      }
    }

    function onResize() {
      setSourceSize({ width: video.videoWidth, height: video.videoHeight });
    }

    video.addEventListener("resize", onResize);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    void start();

    function onPageHide() {
      stopStream("paused", "Paused while the app is in the background.");
      logInfo("webrtc", "Page hidden; WebRTC stopped.");
    }

    function onPageShow() {
      if (!document.hidden) {
        void start("Restoring WebRTC after app resume...");
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stopStream("paused", "Paused while the app is in the background.");
        logInfo("webrtc", "Document hidden; WebRTC stopped.");
      } else if (statusRef.current !== "rendering") {
        void start("Restoring WebRTC after foreground...");
      }
    }

    function onFocus() {
      if (!document.hidden && statusRef.current !== "rendering") {
        void start("Restoring WebRTC after focus...");
      }
    }

    return () => {
      stopStream("idle", "WebRTC stopped.");
      video.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [videoRef]);

  return { status, detail, sourceSize };
}
