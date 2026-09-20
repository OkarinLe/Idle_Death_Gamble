"use client";

// Thin bar at the top of every page: skip link, High contrast switch, language picker,
// and (on the right) sign in / sign out. It is on every page, so this is the one place
// sign-in status is always reachable, no matter which page you are on.
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useTradingMode } from "@/lib/tradingMode";
import { LANGS, type Lang } from "@/lib/translations";
import { createClient } from "@/lib/supabase/client";

export default function AccessibilityBar() {
  const { lang, setLang, t } = useT();
  const { trading } = useTradingMode();
  const [high, setHigh] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const supabase = createClient();

  // Check who is signed in now, and keep watching: this also catches sign-in/out that
  // happens elsewhere (another tab, or the login page), so the button here stays correct.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setSignedIn(!!user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

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
      <div
        className={
          "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-1 text-xs transition-colors duration-300 " +
          (trading ? "border-gray-800 bg-black text-gray-100" : "border-gray-400 bg-gray-100 text-gray-900")
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={high}
            onClick={toggle}
            className={
              "rounded border px-2 py-0.5 font-semibold transition-colors duration-300 " +
              (trading ? "border-gray-600" : "border-gray-700")
            }
          >
            {t("a11y.contrast")}: {high ? t("on") : t("off")}
          </button>
          <label htmlFor="lang-select" className="font-medium">{t("a11y.language")}</label>
          <select
            id="lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className={
              "rounded border px-1 py-0.5 transition-colors duration-300 " +
              (trading ? "border-gray-600 bg-gray-900 text-gray-100" : "border-gray-700 bg-white text-gray-900")
            }
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} lang={l.code} className={trading ? "bg-gray-900" : undefined}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {signedIn ? (
          <button type="button" onClick={signOut} className="font-semibold underline">
            {t("nav.signOut")}
          </button>
        ) : (
          <a href="/login" className="font-semibold underline">{t("nav.signIn")}</a>
        )}
      </div>
    </>
  );
}
