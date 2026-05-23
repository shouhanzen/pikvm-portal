import type { WebRTCStatus } from "../../hooks/useWebRTCStream";
import type { SourceAnchor } from "../../types/view";

export function DebugVideoOverlay({
  status,
  sourceSize,
  renderSize,
  scale,
  sourceAnchor,
}: {
  status: WebRTCStatus;
  sourceSize: { width: number; height: number };
  renderSize: { width: number; height: number };
  scale: number;
  sourceAnchor: SourceAnchor;
}) {
  return (
    <div className="debugVideoOverlay">
      <span>video: {status}</span>
      <span>source: {sourceSize.width || "?"}x{sourceSize.height || "?"}</span>
      <span>render: {Math.round(renderSize.width)}x{Math.round(renderSize.height)}</span>
      <span>scale: {scale.toFixed(2)}</span>
      <span>anchor: {sourceAnchor.x.toFixed(2)}, {sourceAnchor.y.toFixed(2)}</span>
    </div>
  );
}
