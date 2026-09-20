"use client";

// Thin bar at the top of every page: skip link, High contrast switch, language picker.
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { LANGS, type Lang } from "@/lib/translations";

export default function AccessibilityBar() {
  const { lang, setLang, t } = useT();
  const [high, setHigh] = useState(false);

  // Start in high contrast if the person chose it before, or if their device asks for more contrast.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("idg-contrast"); } catch { /* ignore */ }
    const wants = saved ? saved === "high" : window.matchMedia("(prefers-contrast: more)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHigh(wants);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.contrast = high ? "high" : "normal";
  }, [high]);

  function toggle() {
    const next = !high;
    setHigh(next);
    try { localStorage.setItem("idg-contrast", next ? "high" : "normal"); } catch { /* ignore */ }
  }

  return (
    <>
      {/* First thing a keyboard user tabs to. Hidden until it has focus. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:font-semibold focus:text-black"
      >
        {t("a11y.skip")}
      </a>
      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-gray-400 bg-gray-100 px-4 py-1 text-xs text-gray-900">
        <button
          type="button"
          role="switch"
          aria-checked={high}
          onClick={toggle}
          className="rounded border border-gray-700 px-2 py-0.5 font-semibold"
        >
          {t("a11y.contrast")}: {high ? t("on") : t("off")}
        </button>
        <label htmlFor="lang-select" className="font-medium">{t("a11y.language")}</label>
        <select
          id="lang-select"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="rounded border border-gray-700 bg-white px-1 py-0.5"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
