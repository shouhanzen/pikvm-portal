import { useRef } from "react";
import { useElementRect } from "../../hooks/useElementRect";
import { useVideoPointerControls } from "../../hooks/useVideoPointerControls";
import { useWebRTCStream } from "../../hooks/useWebRTCStream";
import { useAppStateStore } from "../../stores/appStateStore";
import { useViewStateStore } from "../../stores/viewStateStore";
import { DebugVideoOverlay } from "./DebugVideoOverlay";

export function VideoStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { status, detail, sourceSize } = useWebRTCStream(videoRef);
  const stageRect = useElementRect(stageRef);
  const debugOverlayEnabled = useAppStateStore((state) => state.debugOverlayEnabled);
  const scale = useViewStateStore((state) => state.scale);
  const sourceAnchor = useViewStateStore((state) => state.sourceAnchor);
  const pointerControls = useVideoPointerControls(stageRef, sourceSize);

  return (
    <section ref={stageRef} className="videoStage" {...pointerControls}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${sourceAnchor.x * 100}% ${sourceAnchor.y * 100}%`,
        }}
      />
      {status !== "rendering" ? (
        <div className="videoStageStatus">
          <strong>{status === "error" ? "Video unavailable" : status === "paused" ? "Video paused" : "Connecting video"}</strong>
          <span>{detail}</span>
        </div>
      ) : null}
      {debugOverlayEnabled ? (
        <DebugVideoOverlay
          status={status}
          sourceSize={sourceSize}
          renderSize={{ width: stageRect?.width || 0, height: stageRect?.height || 0 }}
          scale={scale}
          sourceAnchor={sourceAnchor}
        />
      ) : null}
    </section>
  );
}
