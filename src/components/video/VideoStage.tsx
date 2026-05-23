import { ArrowUpDown, Crosshair, HandGrab, MouseLeft, MouseRight } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useElementRect } from "../../hooks/useElementRect";
import { type ActionWheelAction, useVideoPointerControls } from "../../hooks/useVideoPointerControls";
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
  const { actionWheel, scrollMode, leftHold, exitScrollMode, toggleLeftHold, ...pointerHandlers } = pointerControls;

  return (
    <section ref={stageRef} className="videoStage" {...pointerHandlers}>
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
      {scrollMode || leftHold ? (
        <div className="videoStateTokens">
          {scrollMode ? (
            <button
              className="videoStateToken scroll"
              type="button"
              aria-label="Exit scroll mode"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={exitScrollMode}
            >
              <ArrowUpDown size={17} />
            </button>
          ) : null}
          {leftHold ? (
            <button
              className="videoStateToken leftHold"
              type="button"
              aria-label="Release left mouse hold"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={toggleLeftHold}
            >
              <MouseLeft size={17} />
            </button>
          ) : null}
        </div>
      ) : null}
      {actionWheel.visible ? (
        <ActionWheel center={actionWheel.center} selectedAction={actionWheel.selectedAction} leftHold={leftHold} />
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

function ActionWheel({
  center,
  selectedAction,
  leftHold,
}: {
  center: { x: number; y: number };
  selectedAction: ActionWheelAction | null;
  leftHold: boolean;
}) {
  return (
    <div
      className={`actionWheel ${selectedAction ? `selected-${selectedAction}` : ""}`}
      style={{ left: center.x, top: center.y }}
      aria-hidden="true"
    >
      <div className="actionWheelGuide" />
      <div className="actionWheelLine vertical" />
      <div className="actionWheelLine horizontal" />
      <WheelItem action="scroll" selectedAction={selectedAction} className="top">
        <ArrowUpDown size={22} />
      </WheelItem>
      <WheelItem action="rightClick" selectedAction={selectedAction} className="right">
        <MouseRight size={22} />
      </WheelItem>
      <WheelItem action="rescue" selectedAction={selectedAction} className="left">
        <Crosshair size={22} />
      </WheelItem>
      <WheelItem action="leftHold" selectedAction={selectedAction} className={`bottom ${leftHold ? "armed" : ""}`}>
        {leftHold ? <MouseLeft size={22} /> : <HandGrab size={22} />}
      </WheelItem>
      <div className="actionWheelCenter" />
    </div>
  );
}

function WheelItem({
  action,
  selectedAction,
  className,
  children,
}: {
  action: ActionWheelAction;
  selectedAction: ActionWheelAction | null;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`actionWheelItem ${className} ${selectedAction === action ? "selected" : ""}`}>
      {children}
    </div>
  );
}
