"use client";

// Language switching. Wrap the app in <LangProvider>, then in any client component:
//   const { t } = useT();   t("nav.signIn")   t("full", { n: 80 })
// The choice is saved in the browser (localStorage) and sets <html lang> for screen readers.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dictionaries, type Lang } from "./translations";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string };
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // After the page loads, use the saved choice, or the browser's language if we support it.
  // (We start on English on the server so the first page load matches what the server sent.)
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("idg-lang"); } catch { /* storage blocked: fine */ }
    const guess = (saved ?? navigator.language ?? "en").slice(0, 2);
    const next: Lang = guess === "es" || guess === "ko" ? guess : "en";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(next: Lang) {
    setLangState(next);
    try { localStorage.setItem("idg-lang", next); } catch { /* ignore */ }
  }

  // Falls back to English, then to the key itself, so a missing word never crashes the page.
  function t(key: string, vars: Record<string, string | number> = {}) {
    const text = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);
