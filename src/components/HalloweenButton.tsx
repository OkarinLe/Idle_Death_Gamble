"use client";

// A small joke button, just for fun: click it and a skeleton sprints across the screen.
// Purely decorative (no game state, no data), so it lives on its own here rather than
// cluttering any particular page.
import { useState } from "react";

export default function HalloweenButton() {
  const [running, setRunning] = useState(false);

  function trigger() {
    setRunning(true);
    // Matches the CSS animation's length. Also the cleanup for people with
    // prefers-reduced-motion, whose browser skips the animation entirely
    // (see globals.css) and would otherwise never fire an "animation end" event.
    setTimeout(() => setRunning(false), 2600);
  }

  return (
    <>
      <button
        type="button"
        onClick={trigger}
        aria-label="Send a skeleton running across the screen (just for fun)"
        className="fixed left-4 top-1/2 z-40 -translate-y-1/2 rounded-full border-2 border-orange-500 bg-black px-2.5 py-2 text-xl shadow-lg transition-transform duration-150 hover:scale-110 active:scale-95"
      >
        <span aria-hidden="true">🎃</span>
      </button>

      {running && (
        <span
          aria-hidden="true"
          className="animate-skeleton-run pointer-events-none fixed top-1/2 z-40 -translate-y-1/2 text-5xl"
        >
          💀
        </span>
      )}
    </>
  );
}
