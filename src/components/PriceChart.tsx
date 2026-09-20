// A small line chart of a market's Yes price over time. Plain SVG, no chart library.
// The vertical axis is always 0 to 100 cents, so small moves never look huge.
// Accessible: the SVG has a text label, and the caption says up/down in words
// and with an arrow, not just color.

export type ChartPoint = { t: number; y: number }; // t = time in ms, y = Yes price from 0 to 1

export default function PriceChart({ points }: { points: ChartPoint[] }) {
  if (points.length < 2) {
    return <p className="mt-2 text-xs opacity-70">The price chart appears after the first trade.</p>;
  }

  const W = 300;
  const H = 72;
  const PAD = 4;
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const x = (t: number) => PAD + ((t - t0) / span) * (W - 2 * PAD);
  const y = (p: number) => PAD + (1 - p) * (H - 2 * PAD);

  const path = points.map((p) => `${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const first = Math.round(points[0].y * 100);
  const last = Math.round(points[points.length - 1].y * 100);
  const change = last - first;
  const high = Math.round(Math.max(...points.map((p) => p.y)) * 100);
  const low = Math.round(Math.min(...points.map((p) => p.y)) * 100);
  const trend = change > 0 ? `▲ up ${change}` : change < 0 ? `▼ down ${-change}` : "no change";

  return (
    <figure className="mt-2 animate-fade-in">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Yes price chart. Started at ${first} cents, now ${last} cents. High ${high}, low ${low}.`}
        className="h-20 w-full rounded border border-gray-700 bg-gray-950"
      >
        {/* dashed line = 50 cents, a coin flip */}
        <line x1={PAD} x2={W - PAD} y1={y(0.5)} y2={y(0.5)} stroke="#9ca3af" strokeDasharray="4 4" strokeWidth="1" />
        {/* light blue so it stays readable on the dark background */}
        <polyline points={path} fill="none" stroke="#5AB4E5" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-1 text-xs">
        Yes price now {last}¢ ({trend}
        {change !== 0 ? "¢" : ""} since the start) · High {high}¢ · Low {low}¢
      </figcaption>
    </figure>
  );
}
