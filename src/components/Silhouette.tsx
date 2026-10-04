/**
 * Static version of beat 5: a row of prefabricated modules, with one module
 * marked as "your share". Used for reduced motion and as the no-WebGL fallback.
 */
export function Silhouette({ className = "" }: { className?: string }) {
  const modules = 8;
  const share = 5;
  const x0 = 20;
  const gap = 8;
  const modW = (560 - gap * (modules - 1)) / modules;
  const top = 128;
  const ground = 218;
  const xAt = (i: number) => x0 + i * (modW + gap);
  return (
    <figure className={className}>
      <svg viewBox="0 0 600 240" role="img" aria-labelledby="silhouette-title" className="h-auto w-full">
        <title id="silhouette-title">Outline of a modular data center: a row of identical modules, with one module highlighted as your share</title>
        <g fill="none" stroke="var(--color-rack-400)" strokeWidth="1.5" opacity="0.9">
          {Array.from({ length: modules }, (_, i) => (
            <g key={i}>
              {/* Rooftop cooling unit */}
              <rect x={xAt(i) + modW * 0.12} y={top - 12} width={modW * 0.76} height={12} />
              {/* Module body and its end door */}
              <rect x={xAt(i)} y={top} width={modW} height={ground - top} />
              <rect x={xAt(i) + modW / 2 - 8} y={ground - 36} width={16} height={36} opacity="0.6" />
            </g>
          ))}
        </g>
        <rect x={xAt(share) + 1} y={top + 1} width={modW - 2} height={ground - top - 2} fill="var(--color-share-400)" opacity="0.9" />
        <line x1={0} y1={ground + 0.75} x2={600} y2={ground + 0.75} stroke="var(--color-rack-400)" strokeWidth="1" opacity="0.35" />
      </svg>
      <figcaption className="mt-3 font-mono text-sm text-white/70">
        <span className="mr-2 inline-block size-2.5 bg-share-400 align-middle" aria-hidden="true" />
        Planned: each share in proportion to what's put in, if it goes ahead
      </figcaption>
    </figure>
  );
}
