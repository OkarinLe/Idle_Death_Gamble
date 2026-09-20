"use client";

// HokieAI Side Kick: 3 questions in, one Yes/No market out. No login.
// This page never touches Supabase, so it works even if the main app is down.
import { useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";

type Idea = { question: string; yes_odds: number; reason: string };

const AREAS = ["dining", "gym", "library", "football", "classes", "somewhere else"];
const TONES = ["funny", "serious", "a mix of funny and serious"];

export default function SideKickPage() {
  const { t, lang } = useT();
  const [thought, setThought] = useState("");
  const [area, setArea] = useState(AREAS[0]);
  const [tone, setTone] = useState(TONES[2]);
  const [busy, setBusy] = useState(false);
  const [idea, setIdea] = useState<Idea | null>(null);
  const [message, setMessage] = useState(""); // errors and "copied" notices (read aloud by screen readers)
  const resultRef = useRef<HTMLHeadingElement>(null);

  async function makeMarket(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setIdea(null);
    try {
      const res = await fetch("/api/sidekick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thought, area, tone, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Something went wrong. Please try again.");
      } else if (data.refused) {
        setMessage(data.refused);
      } else {
        setIdea(data as Idea);
        // Move keyboard and screen-reader focus to the answer.
        setTimeout(() => resultRef.current?.focus(), 0);
      }
    } catch {
      setMessage(t("sk.netFail"));
    }
    setBusy(false);
  }

  // The text people copy or share. Includes the link back to the main app.
  function shareText(i: Idea) {
    return `${i.question} Yes ${i.yes_odds}% / No ${100 - i.yes_odds}%. ${i.reason} Trade it with Hokie Bucks (play money): ${window.location.origin}`;
  }

  async function copy() {
    if (!idea) return;
    try {
      await navigator.clipboard.writeText(shareText(idea));
      setMessage(t("sk.copied"));
    } catch {
      setMessage(t("sk.copyFail"));
    }
  }

  async function share() {
    if (!idea) return;
    try {
      await navigator.share({ title: "My Hokie market", text: shareText(idea) });
    } catch {
      /* the person closed the share sheet; nothing to do */
    }
  }

  const fieldClass = "mt-1 w-full rounded border border-gray-500 bg-white p-2 text-gray-900";

  return (
    <main id="main" className="mx-auto min-h-screen max-w-xl space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold" style={{ color: "#861F41" }}>{t("sk.title")}</h1>
        <p className="mt-2 text-gray-700">
          {t("sk.intro")}
        </p>
      </header>

      <form onSubmit={makeMarket} className="space-y-4">
        <div>
          <label htmlFor="thought" className="font-medium">{t("sk.q1")}</label>
          <input
            id="thought"
            type="text"
            required
            maxLength={200}
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            placeholder={t("sk.q1ph")}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="area" className="font-medium">{t("sk.q2")}</label>
          <select id="area" value={area} onChange={(e) => setArea(e.target.value)} className={fieldClass}>
            {AREAS.map((a) => <option key={a} value={a}>{t(`area.${a}`)}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="tone" className="font-medium">{t("sk.q3")}</label>
          <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className={fieldClass}>
            {TONES.map((x) => <option key={x} value={x}>{t(`tone.${x}`)}</option>)}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded p-3 font-semibold text-white transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
          style={{ backgroundColor: "#861F41" }}
        >
          {busy ? t("sk.making") : t("sk.make")}
        </button>
      </form>

      {/* Errors and copy notices. aria-live makes screen readers announce changes. */}
      <p
        key={busy ? "busy" : message}
        role="status"
        aria-live="polite"
        className={"min-h-6 text-sm font-medium" + (message || busy ? " animate-fade-in" : "")}
        style={{ color: "#8A3B00" }}
      >
        {busy ? t("sk.making") : message}
      </p>

      {idea && (
        <section
          aria-labelledby="result-title"
          className="animate-fade-up space-y-3 rounded-lg border-2 p-5"
          style={{ borderColor: "#861F41" }}
        >
          <h2 id="result-title" ref={resultRef} tabIndex={-1} className="text-xl font-bold">
            {idea.question}
          </h2>

          <div className="grid grid-cols-2 gap-2 text-center font-semibold text-white">
            <div className="rounded p-2" style={{ backgroundColor: "#0B6E99" }}>▲ {t("yes")} {idea.yes_odds}%</div>
            <div className="rounded p-2" style={{ backgroundColor: "#B34700" }}>▼ {t("no")} {100 - idea.yes_odds}%</div>
          </div>

          <p><span className="font-semibold">{t("sk.why")}</span> {idea.reason}</p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={copy}
              className="rounded border-2 px-3 py-2 font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
              style={{ borderColor: "#861F41", color: "#861F41" }}
            >
              {t("sk.copy")}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={share}
                className="rounded border-2 px-3 py-2 font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
                style={{ borderColor: "#861F41", color: "#861F41" }}
              >
                {t("sk.share")}
              </button>
            )}
            <Link
              href="/"
              className="rounded px-3 py-2 font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
              style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}
            >
              {t("sk.trade")}
            </Link>
          </div>
          <p className="text-xs text-gray-600">{t("sk.fine")}</p>
        </section>
      )}

      <footer className="text-sm">
        <Link href="/" className="underline">{t("sk.back")}</Link>
      </footer>
    </main>
  );
}
