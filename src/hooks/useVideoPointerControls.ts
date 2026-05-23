import { PointerEvent, RefObject, useEffect, useRef, useState } from "react";
import { useKvmInput } from "../app/KvmInputContext";
import { useViewStateStore } from "../stores/viewStateStore";

type Point = {
  id: number;
  x: number;
  y: number;
};

type PointerMode = "idle" | "mouse" | "view" | "wheel" | "scroll" | "blocked";
export type ActionWheelAction = "scroll" | "rightClick" | "rescue" | "leftHold";

export type ActionWheelState = {
  visible: boolean;
  center: { x: number; y: number };
  selectedAction: ActionWheelAction | null;
};

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

type ScrollDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  previousY: number;
  previousTime: number;
  remainder: number;
  moved: boolean;
};

type ViewGesture = {
  startDistance: number;
  startScale: number;
  startAnchor: { x: number; y: number };
  startOrigin: { x: number; y: number };
  startContentPoint: { x: number; y: number };
};

const tapMaxMovePx = 8;
const tapMaxMs = 450;
const longHoldMs = 500;
const actionRadiusPx = 48;
const scrollTickDistancePx = 20;
const scrollMoveThresholdPx = 6;
const scrollMomentumDecay = 0.92;
const scrollMomentumMinVelocity = 0.02;
const minScale = 1;
const maxScale = 16;
const hidAbsoluteRange = 32767;

export function useVideoPointerControls(
  stageRef: RefObject<HTMLElement | null>,
  sourceSize: { width: number; height: number },
) {
  const input = useKvmInput();
  const setView = useViewStateStore((state) => state.setView);
  const pointersRef = useRef(new Map<number, Point>());
  const modeRef = useRef<PointerMode>("idle");
  const mouseDragRef = useRef<MouseDrag | null>(null);
  const scrollDragRef = useRef<ScrollDrag | null>(null);
  const viewGestureRef = useRef<ViewGesture | null>(null);
  const longHoldTimerRef = useRef<number | null>(null);
  const longHoldPointRef = useRef<Point | null>(null);
  const momentumFrameRef = useRef<number | null>(null);
  const momentumVelocityRef = useRef(0);
  const momentumLastTimeRef = useRef(0);
  const scrollRemainderRef = useRef(0);
  const [scrollMode, setScrollMode] = useState(false);
  const [leftHold, setLeftHoldState] = useState(false);
  const leftHoldRef = useRef(false);
  const [actionWheel, setActionWheel] = useState<ActionWheelState>({
    visible: false,
    center: { x: 0, y: 0 },
    selectedAction: null,
  });

  useEffect(() => {
    return () => {
      if (leftHoldRef.current) {
        void input.setMouseButton("left", false);
      }
    };
  }, [input]);

  function points() {
    return [...pointersRef.current.values()];
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events may not support pointer capture.
    }
    cancelMomentum();
    const point = toPoint(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2) {
      cancelLongHold();
      beginViewGesture();
      return;
    }

    if (modeRef.current === "blocked") {
      return;
    }

    longHoldPointRef.current = point;
    startLongHoldTimer(point);

    if (scrollMode) {
      modeRef.current = "scroll";
      scrollDragRef.current = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        lastTime: performance.now(),
        previousY: point.y,
        previousTime: performance.now(),
        remainder: scrollRemainderRef.current,
        moved: false,
      };
      return;
    }

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
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    const nextPoint = toPoint(event);
    pointersRef.current.set(event.pointerId, nextPoint);

    if (modeRef.current === "wheel") {
      updateActionWheelSelection(nextPoint);
      return;
    }

    if (modeRef.current === "mouse") {
      updateMouseDrag(nextPoint);
      return;
    }

    if (modeRef.current === "scroll") {
      updateScrollDrag(nextPoint);
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
      cancelLongHold();
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

  function updateScrollDrag(point: Point) {
    const drag = scrollDragRef.current;
    if (!drag || drag.pointerId !== point.id || pointersRef.current.size !== 1) {
      return;
    }

    const totalDistance = Math.hypot(point.x - drag.startX, point.y - drag.startY);
    if (!drag.moved && totalDistance > scrollMoveThresholdPx) {
      cancelLongHold();
      drag.moved = true;
    }

    const now = performance.now();
    const dy = point.y - drag.lastY;
    if (drag.moved) {
      sendScrollForFingerDelta(dy, drag);
    }

    drag.previousY = drag.lastY;
    drag.previousTime = drag.lastTime;
    drag.lastX = point.x;
    drag.lastY = point.y;
    drag.lastTime = now;
  }

  function sendScrollForFingerDelta(dy: number, drag?: ScrollDrag) {
    const previousRemainder = drag ? drag.remainder : scrollRemainderRef.current;
    const ticksFloat = -dy / scrollTickDistancePx + previousRemainder;
    const ticks = Math.trunc(ticksFloat);
    const nextRemainder = ticksFloat - ticks;

    if (drag) {
      drag.remainder = nextRemainder;
      scrollRemainderRef.current = nextRemainder;
    } else {
      scrollRemainderRef.current = nextRemainder;
    }

    if (ticks) {
      void input.sendMouseWheel(0, ticks);
    }
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
    scrollDragRef.current = null;
    viewGestureRef.current = {
      startDistance: distance(a, b),
      startScale: scale,
      startAnchor: sourceAnchor,
      startOrigin,
      startContentPoint: {
        x: startOrigin.x + (startLocalMidpoint.x - startOrigin.x) / scale,
        y: startOrigin.y + (startLocalMidpoint.y - startOrigin.y) / scale,
      },
    };
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
    cancelLongHold();

    if (modeRef.current === "wheel") {
      const holdPoint = longHoldPointRef.current;
      const selectedAction = holdPoint ? actionFromVector(point.x - holdPoint.x, point.y - holdPoint.y) : null;
      hideActionWheel();
      if (allowClick && selectedAction && holdPoint) {
        executeAction(selectedAction, holdPoint);
      }
    } else if (modeRef.current === "mouse") {
      const drag = mouseDragRef.current;
      if (
        allowClick &&
        drag?.pointerId === event.pointerId &&
        !drag.moved &&
        Date.now() - drag.startedAt <= tapMaxMs
      ) {
        if (!leftHoldRef.current) {
          void input.clickMouse("left");
        }
      }
    } else if (modeRef.current === "scroll") {
      const drag = scrollDragRef.current;
      if (allowClick && drag?.moved) {
        maybeStartMomentum(drag);
      }
      scrollRemainderRef.current = drag?.remainder || scrollRemainderRef.current;
    }

    pointersRef.current.delete(event.pointerId);

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Best effort for synthetic/cancelled pointers.
    }

    if (modeRef.current === "view" && pointersRef.current.size > 0) {
      modeRef.current = "blocked";
      viewGestureRef.current = null;
      mouseDragRef.current = null;
      scrollDragRef.current = null;
      return;
    }

    if (pointersRef.current.size === 0) {
      modeRef.current = "idle";
      viewGestureRef.current = null;
      mouseDragRef.current = null;
      scrollDragRef.current = null;
      longHoldPointRef.current = null;
    }
  }

  function startLongHoldTimer(point: Point) {
    cancelLongHold();
    longHoldTimerRef.current = window.setTimeout(() => {
      modeRef.current = "wheel";
      mouseDragRef.current = null;
      scrollDragRef.current = null;
      longHoldPointRef.current = point;
      setActionWheel({
        visible: true,
        center: { x: point.x, y: point.y },
        selectedAction: null,
      });
    }, longHoldMs);
  }

  function cancelLongHold() {
    if (longHoldTimerRef.current) {
      window.clearTimeout(longHoldTimerRef.current);
      longHoldTimerRef.current = null;
    }
  }

  function updateActionWheelSelection(point: Point) {
    const center = longHoldPointRef.current;
    if (!center) {
      return;
    }
    const action = actionFromVector(point.x - center.x, point.y - center.y);
    setActionWheel((state) => ({
      ...state,
      selectedAction: action,
    }));
  }

  function hideActionWheel() {
    setActionWheel((state) => ({
      ...state,
      visible: false,
      selectedAction: null,
    }));
  }

  function executeAction(action: ActionWheelAction, holdPoint: Point) {
    if (action === "scroll") {
      setScrollMode((value) => !value);
      cancelMomentum();
      return;
    }

    if (action === "rightClick") {
      void input.clickMouse("right");
      return;
    }

    if (action === "leftHold") {
      void setLeftHold(!leftHoldRef.current);
      return;
    }

    const rescueTarget = screenPointToAbsoluteMouse(holdPoint, stageRef.current, sourceSize);
    if (rescueTarget) {
      void input.moveMouseAbsolute(rescueTarget.x, rescueTarget.y);
    }
  }

  function maybeStartMomentum(drag: ScrollDrag) {
    const dt = Math.max(drag.lastTime - drag.previousTime, 1);
    const velocity = (drag.lastY - drag.previousY) / dt;
    if (Math.abs(velocity) < scrollMomentumMinVelocity) {
      return;
    }

    momentumVelocityRef.current = velocity;
    momentumLastTimeRef.current = performance.now();
    momentumFrameRef.current = window.requestAnimationFrame(runMomentum);
  }

  function runMomentum(now: number) {
    const dt = Math.min(now - momentumLastTimeRef.current, 32);
    momentumLastTimeRef.current = now;
    sendScrollForFingerDelta(momentumVelocityRef.current * dt);
    momentumVelocityRef.current *= scrollMomentumDecay;

    if (Math.abs(momentumVelocityRef.current) >= scrollMomentumMinVelocity) {
      momentumFrameRef.current = window.requestAnimationFrame(runMomentum);
    } else {
      momentumFrameRef.current = null;
      momentumVelocityRef.current = 0;
    }
  }

  function cancelMomentum() {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
    momentumVelocityRef.current = 0;
  }

  return {
    actionWheel,
    scrollMode,
    leftHold,
    exitScrollMode: () => {
      cancelMomentum();
      setScrollMode(false);
    },
    toggleLeftHold: () => void setLeftHold(!leftHoldRef.current),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (event: PointerEvent<HTMLElement>) => event.preventDefault(),
  };

  async function setLeftHold(nextValue: boolean) {
    leftHoldRef.current = nextValue;
    setLeftHoldState(nextValue);
    await input.setMouseButton("left", nextValue);
  }
}

function actionFromVector(dx: number, dy: number): ActionWheelAction | null {
  if (Math.hypot(dx, dy) < actionRadiusPx) {
    return null;
  }

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absY > absX && dy < 0) {
    return "scroll";
  }
  if (absX >= absY && dx > 0) {
    return "rightClick";
  }
  if (absX >= absY && dx < 0) {
    return "rescue";
  }
  if (absY > absX && dy > 0) {
    return "leftHold";
  }
  return null;
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

function screenPointToAbsoluteMouse(
  point: Point,
  stage: HTMLElement | null,
  sourceSize: { width: number; height: number },
) {
  const rect = stage?.getBoundingClientRect();
  if (!rect?.width || !rect.height || !sourceSize.width || !sourceSize.height) {
    return null;
  }

  const { scale, sourceAnchor } = useViewStateStore.getState();
  const local = { x: point.x - rect.left, y: point.y - rect.top };
  const origin = { x: sourceAnchor.x * rect.width, y: sourceAnchor.y * rect.height };
  const unscaled = {
    x: origin.x + (local.x - origin.x) / scale,
    y: origin.y + (local.y - origin.y) / scale,
  };
  const fitScale = Math.min(rect.width / sourceSize.width, rect.height / sourceSize.height);
  const contentWidth = sourceSize.width * fitScale;
  const contentHeight = sourceSize.height * fitScale;
  const contentLeft = (rect.width - contentWidth) / 2;
  const contentTop = (rect.height - contentHeight) / 2;
  const sourceX = clamp((unscaled.x - contentLeft) / fitScale, 0, sourceSize.width);
  const sourceY = clamp((unscaled.y - contentTop) / fitScale, 0, sourceSize.height);

  return {
    x: Math.round((sourceX / sourceSize.width) * hidAbsoluteRange * 2 - hidAbsoluteRange),
    y: Math.round((sourceY / sourceSize.height) * hidAbsoluteRange * 2 - hidAbsoluteRange),
  };
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
