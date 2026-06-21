/**
 * MinistryDots — a tasteful, server-safe row of colored ministry dots for an
 * event that may belong to several ministries (all equal). Shows up to `max`
 * dots, then a "+N" overflow chip. The whole group carries a `title` tooltip
 * listing every ministry name so nothing is hidden from the reader.
 *
 * No "use client" — it's pure markup, usable from any server component.
 */

export type MinistryDot = { name: string; color: string };

export function MinistryDots({
  ministries,
  max = 3,
  showNames = false,
  className = "",
}: {
  ministries: MinistryDot[];
  /** Max dots before collapsing the rest into "+N". */
  max?: number;
  /** When true, render the ministry name(s) beside the dots (single-row use). */
  showNames?: boolean;
  className?: string;
}) {
  if (ministries.length === 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-muted ${className}`}>
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#cbd5e1" }} />
        {showNames && <span>—</span>}
      </span>
    );
  }

  const shown = ministries.slice(0, max);
  const overflow = ministries.length - shown.length;
  const allNames = ministries.map((m) => m.name).join(", ");

  // When asked to show names and there's exactly one, render the classic
  // "dot + name" line. Otherwise show stacked dots (+N) with names appended.
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={allNames}
    >
      <span className="inline-flex items-center">
        {shown.map((m, i) => (
          <span
            key={`${m.name}-${i}`}
            className="inline-block h-3 w-3 rounded-full ring-1 ring-white"
            style={{ background: m.color, marginLeft: i === 0 ? 0 : -4 }}
          />
        ))}
        {overflow > 0 && (
          <span className="ml-1 text-[11px] font-semibold text-muted">+{overflow}</span>
        )}
      </span>
      {showNames && (
        <span className="truncate text-muted">
          {ministries.length === 1 ? ministries[0].name : allNames}
        </span>
      )}
    </span>
  );
}
