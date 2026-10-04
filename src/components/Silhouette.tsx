/**
 * Static version of beat 5: the building's silhouette, split into segments,
 * with one segment marked as "your share". Used for reduced motion and as the
 * no-WebGL fallback.
 */
export function Silhouette({ className = "" }: { className?: string }) {
  const segments = 8;
  const share = 5;
  const x0 = 20;
  const w = 560;
  const segW = w / segments;
  return (
    <figure className={className}>
      <svg viewBox="0 0 600 240" role="img" aria-labelledby="silhouette-title" className="h-auto w-full">
        <title id="silhouette-title">Outline of a data center split into equal segments, with one segment highlighted as your share</title>
        <g fill="none" stroke="var(--color-rack-400)" strokeWidth="1.5" opacity="0.9">
          {/* Roof cooling units */}
          {[60, 150, 240, 330, 420, 510].map((x) => (
            <rect key={x} x={x} y={52} width={46} height={26} />
          ))}
          {/* Main block */}
          <rect x={x0} y={78} width={w} height={140} />
          {Array.from({ length: segments - 1 }, (_, i) => (
            <line key={i} x1={x0 + segW * (i + 1)} y1={78} x2={x0 + segW * (i + 1)} y2={218} strokeDasharray="3 5" opacity="0.6" />
          ))}
        </g>
        <rect x={x0 + segW * share + 1} y={79} width={segW - 2} height={138} fill="var(--color-share-400)" opacity="0.9" />
        <line x1={0} y1={218.75} x2={600} y2={218.75} stroke="var(--color-rack-400)" strokeWidth="1" opacity="0.35" />
      </svg>
      <figcaption className="mt-3 font-mono text-sm text-white/70">
        <span className="mr-2 inline-block size-2.5 bg-share-400 align-middle" aria-hidden="true" />
        Planned: each share in proportion to what's put in, if it goes ahead
      </figcaption>
    </figure>
  );
}
