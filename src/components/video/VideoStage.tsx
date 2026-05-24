import { ArrowUpDown, Crosshair, HandGrab, MouseLeft, MouseRight } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useElementRect } from "../../hooks/useElementRect";
import { type ActionWheelAction, type ScrollRulerState, useVideoPointerControls } from "../../hooks/useVideoPointerControls";
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
  const { actionWheel, scrollMode, scrollRuler, leftHold, exitScrollMode, toggleLeftHold, ...pointerHandlers } = pointerControls;

  function onStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (video?.srcObject && video.paused) {
      event.preventDefault();
      void video.play();
      return;
    }
    pointerHandlers.onPointerDown(event);
  }

  return (
    <section ref={stageRef} className="videoStage" {...pointerHandlers} onPointerDown={onStagePointerDown}>
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
      {scrollRuler.visible ? <ScrollRuler state={scrollRuler} /> : null}
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

function ScrollRuler({ state }: { state: ScrollRulerState }) {
  const halfBand = state.bandPx / 2;
  const lineCount = Math.ceil(state.bandPx / state.tickPx) + 3;
  const offset = state.offset % state.tickPx;
  const lines = [];

  for (let index = -lineCount; index <= lineCount; index += 1) {
    if (index === 0) {
      continue;
    }
    const relativeY = index * state.tickPx + offset;
    if (relativeY < -halfBand || relativeY > halfBand) {
      continue;
    }
    const distance = Math.abs(relativeY) / halfBand;
    lines.push({ id: index, y: halfBand + relativeY, opacity: Math.max(0.18, 0.9 - distance * 0.62) });
  }

  return (
    <div
      className={`scrollRuler ${state.fading ? "fading" : ""}`}
      style={{
        left: state.origin.x,
        top: state.origin.y,
        height: state.bandPx,
      }}
      aria-hidden="true"
    >
      <div className="scrollRulerBand">
        {lines.map((line) => (
          <i
            className="scrollRulerTick"
            key={line.id}
            style={{ top: line.y, opacity: line.opacity }}
          />
        ))}
        <b className="scrollRulerZero" key={state.pulse} />
      </div>
    </div>
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
