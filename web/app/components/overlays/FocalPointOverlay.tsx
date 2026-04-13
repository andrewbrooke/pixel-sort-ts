'use client';

export function FocalPointOverlay({
  imageSize,
  focalPoint,
  onFocalPointSet,
}: {
  imageSize: { width: number; height: number };
  focalPoint: { x: number; y: number };
  onFocalPointSet?: (x: number, y: number) => void;
}) {
  const { width, height } = imageSize;
  const px = focalPoint.x * width;
  const py = focalPoint.y * height;
  const r = Math.max(8, Math.min(width, height) * 0.015);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onFocalPointSet) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // xMidYMid meet: uniform scale so the whole viewBox fits, centred
    const scale = Math.min(rect.width / width, rect.height / height);
    const offsetX = (rect.width - width * scale) / 2;
    const offsetY = (rect.height - height * scale) / 2;
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left - offsetX) / (width * scale)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top - offsetY) / (height * scale)));
    onFocalPointSet(nx, ny);
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        cursor: onFocalPointSet ? 'crosshair' : 'default',
        pointerEvents: onFocalPointSet ? 'all' : 'none',
      }}
    >
      {/* Outer ring */}
      <circle
        cx={px}
        cy={py}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={px}
        cy={py}
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
      />
      {/* Crosshair lines */}
      {[
        [px - r * 1.8, py, px - r * 0.4, py],
        [px + r * 0.4, py, px + r * 1.8, py],
        [px, py - r * 1.8, px, py - r * 0.4],
        [px, py + r * 0.4, px, py + r * 1.8],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={4}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {[
        [px - r * 1.8, py, px - r * 0.4, py],
        [px + r * 0.4, py, px + r * 1.8, py],
        [px, py - r * 1.8, px, py - r * 0.4],
        [px, py + r * 0.4, px, py + r * 1.8],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={`w${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
