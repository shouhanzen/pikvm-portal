import { PointerEvent, RefObject, useRef } from "react";
import { useKvmInput } from "../app/KvmInputContext";
import { useViewStateStore } from "../stores/viewStateStore";

type Point = {
  id: number;
  x: number;
  y: number;
};

type PointerMode = "idle" | "mouse" | "view" | "blocked";

type MouseDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  remainderX: number;
  remainderY: number;
  startedAt: number;
  moved: boolean;
};

type ViewGesture = {
  startDistance: number;
  startMidpoint: Point;
  startScale: number;
  startAnchor: { x: number; y: number };
  startOrigin: { x: number; y: number };
  startContentPoint: { x: number; y: number };
};

const tapMaxMovePx = 8;
const tapMaxMs = 450;
const minScale = 1;
const maxScale = 16;

export function useVideoPointerControls(
  stageRef: RefObject<HTMLElement | null>,
  sourceSize: { width: number; height: number },
) {
  const input = useKvmInput();
  const setView = useViewStateStore((state) => state.setView);
  const pointersRef = useRef(new Map<number, Point>());
  const modeRef = useRef<PointerMode>("idle");
  const mouseDragRef = useRef<MouseDrag | null>(null);
  const viewGestureRef = useRef<ViewGesture | null>(null);

  function points() {
    return [...pointersRef.current.values()];
  }

  function beginViewGesture() {
    const [a, b] = points();
    if (!a || !b) {
      return;
    }

    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) {
      return;
    }

    const { scale, sourceAnchor } = useViewStateStore.getState();
    const startMidpoint = midpoint(a, b);
    const startOrigin = {
      x: sourceAnchor.x * rect.width,
      y: sourceAnchor.y * rect.height,
    };
    const startLocalMidpoint = {
      x: startMidpoint.x - rect.left,
      y: startMidpoint.y - rect.top,
    };

    modeRef.current = "view";
    mouseDragRef.current = null;
    viewGestureRef.current = {
      startDistance: distance(a, b),
      startMidpoint,
      startScale: scale,
      startAnchor: sourceAnchor,
      startOrigin,
      startContentPoint: {
        x: startOrigin.x + (startLocalMidpoint.x - startOrigin.x) / scale,
        y: startOrigin.y + (startLocalMidpoint.y - startOrigin.y) / scale,
      },
    };
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPoint(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1 && modeRef.current !== "blocked") {
      modeRef.current = "mouse";
      mouseDragRef.current = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        remainderX: 0,
        remainderY: 0,
        startedAt: Date.now(),
        moved: false,
      };
      return;
    }

    if (pointersRef.current.size >= 2) {
      beginViewGesture();
    }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    const nextPoint = toPoint(event);
    pointersRef.current.set(event.pointerId, nextPoint);

    if (modeRef.current === "mouse") {
      updateMouseDrag(nextPoint);
      return;
    }

    if (modeRef.current === "view") {
      updateViewGesture();
    }
  }

  function updateMouseDrag(point: Point) {
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== point.id || pointersRef.current.size !== 1) {
      return;
    }

    const totalDx = point.x - drag.startX;
    const totalDy = point.y - drag.startY;
    const crossedThreshold = Math.hypot(totalDx, totalDy) > tapMaxMovePx;

    if (!drag.moved && crossedThreshold) {
      drag.moved = true;
      drag.lastX = drag.startX;
      drag.lastY = drag.startY;
    }

    if (!drag.moved) {
      return;
    }

    const dx = point.x - drag.lastX;
    const dy = point.y - drag.lastY;
    drag.lastX = point.x;
    drag.lastY = point.y;
    const scale = getSourceToScreenScale(stageRef.current, sourceSize);
    const remoteDx = dx / scale + drag.remainderX;
    const remoteDy = dy / scale + drag.remainderY;
    const sendX = Math.trunc(remoteDx);
    const sendY = Math.trunc(remoteDy);
    drag.remainderX = remoteDx - sendX;
    drag.remainderY = remoteDy - sendY;
    void input.sendMouseRelative(sendX, sendY);
  }

  function updateViewGesture() {
    const gesture = viewGestureRef.current;
    const [a, b] = points();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!gesture || !a || !b || !rect?.width || !rect.height) {
      return;
    }

    const currentDistance = distance(a, b);
    const currentMidpoint = midpoint(a, b);
    const nextScale = clamp(
      gesture.startScale * (currentDistance / Math.max(gesture.startDistance, 1)),
      minScale,
      maxScale,
    );
    const currentLocalMidpoint = {
      x: currentMidpoint.x - rect.left,
      y: currentMidpoint.y - rect.top,
    };
    const nextOrigin = solveTransformOrigin(currentLocalMidpoint, gesture.startContentPoint, nextScale, gesture);
    const nextAnchor = {
      x: clamp(nextOrigin.x / rect.width, 0, 1),
      y: clamp(nextOrigin.y / rect.height, 0, 1),
    };

    setView({ scale: nextScale, sourceAnchor: nextAnchor });
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    finishPointer(event, true);
  }

  function onPointerCancel(event: PointerEvent<HTMLElement>) {
    finishPointer(event, false);
  }

  function finishPointer(event: PointerEvent<HTMLElement>, allowClick: boolean) {
    const point = pointersRef.current.get(event.pointerId);
    if (!point) {
      return;
    }

    event.preventDefault();

    if (modeRef.current === "mouse") {
      const drag = mouseDragRef.current;
      if (
        allowClick &&
        drag?.pointerId === event.pointerId &&
        !drag.moved &&
        Date.now() - drag.startedAt <= tapMaxMs
      ) {
        void input.clickMouse("left");
      }
    }

    pointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (modeRef.current === "view" && pointersRef.current.size > 0) {
      modeRef.current = "blocked";
      viewGestureRef.current = null;
      mouseDragRef.current = null;
      return;
    }

    if (pointersRef.current.size === 0) {
      modeRef.current = "idle";
      viewGestureRef.current = null;
      mouseDragRef.current = null;
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (event: PointerEvent<HTMLElement>) => event.preventDefault(),
  };
}

function toPoint(event: PointerEvent<HTMLElement>): Point {
  return { id: event.pointerId, x: event.clientX, y: event.clientY };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return {
    id: -1,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSourceToScreenScale(
  stage: HTMLElement | null,
  sourceSize: { width: number; height: number },
) {
  const rect = stage?.getBoundingClientRect();
  const { scale } = useViewStateStore.getState();
  if (!rect?.width || !rect.height || !sourceSize.width || !sourceSize.height) {
    return Math.max(scale, 1);
  }

  const fitScale = Math.min(rect.width / sourceSize.width, rect.height / sourceSize.height);
  return Math.max(fitScale * scale, 0.001);
}

function solveTransformOrigin(
  desiredPoint: { x: number; y: number },
  contentPoint: { x: number; y: number },
  scale: number,
  gesture: ViewGesture,
) {
  if (Math.abs(1 - scale) < 0.001) {
    return gesture.startOrigin;
  }

  return {
    x: (desiredPoint.x - scale * contentPoint.x) / (1 - scale),
    y: (desiredPoint.y - scale * contentPoint.y) / (1 - scale),
  };
}
