"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BackLink from "@/components/BackLink";
import { useT } from "@/lib/i18n";

// Small eye / eye-slash icon button that sits inside a password box and toggles it between
// masked and plain text. Icon-only, so the label is aria-label, not visible text.
function EyeToggle({ shown, label, onToggle }: { shown: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={label}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-900"
    >
      {shown ? (
        // eye-slash: password is showing, click to hide it
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        // eye: password is hidden, click to show it
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail.endsWith("@vt.edu")) {
      setMessage(t("login.needVt"));
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage(t("login.passwordMismatch"));
      return;
    }

    setLoading(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
      setLoading(false);
      if (error) return setMessage(error.message);
      if (!data.session) return setMessage(t("login.confirm"));
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      setLoading(false);
      if (error) return setMessage(error.message);
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 animate-fade-up">
      <BackLink href="/" label={t("nav.back")} />

      <h1 className="text-2xl font-bold" style={{ color: "#861F41" }}>
        Idle Death Gamble
      </h1>
      <p>{mode === "signin" ? t("login.introIn") : t("login.introUp")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="email" className="font-medium">{t("login.email")}</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="pid@vt.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-400 p-2"
        />

        <label htmlFor="password" className="font-medium">{t("login.password")}</label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-400 p-2 pr-9"
          />
          <EyeToggle
            shown={showPassword}
            label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
            onToggle={() => setShowPassword(!showPassword)}
          />
        </div>

        {mode === "signup" && (
          <>
            <label htmlFor="confirm-password" className="font-medium">{t("login.confirmPassword")}</label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded border border-gray-400 p-2 pr-9"
              />
              <EyeToggle
                shown={showPassword}
                label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                onToggle={() => setShowPassword(!showPassword)}
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded p-2 font-semibold text-white transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          style={{ backgroundColor: "#861F41" }}
        >
          {loading ? t("login.wait") : mode === "signin" ? t("login.signIn") : t("login.signUp")}
        </button>
      </form>

      <p
        key={message}
        role="alert"
        aria-live="polite"
        className={"min-h-6 text-sm" + (message ? " animate-fade-in" : "")}
        style={{ color: "#B00020" }}
      >
        {message}
      </p>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="text-left text-sm underline"
      >
        {mode === "signin" ? t("login.toUp") : t("login.toIn")}
      </button>
    </main>
  );
}