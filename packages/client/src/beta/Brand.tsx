/** Vector mark: five pips framed by a broken neon diamond. No bitmap download. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`beta-brand${compact ? " beta-brand--compact" : ""}`} aria-label="Greed">
      <svg className="beta-brand__mark" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <path d="M50 3 97 50 50 97 3 50 32 21" stroke="currentColor" strokeWidth="3" />
        <rect x="23" y="23" width="54" height="54" rx="13" fill="currentColor" />
        {[
          [35, 35],
          [65, 35],
          [50, 50],
          [35, 65],
          [65, 65],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#10221e" />
        ))}
      </svg>
      <span className="beta-brand__word" aria-hidden="true">
        GREED<span className="beta-brand__spark">✦</span>
      </span>
    </span>
  );
}
