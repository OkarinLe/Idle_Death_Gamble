"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BackLink from "@/components/BackLink";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail.endsWith("@vt.edu")) {
      setMessage("Please use your @vt.edu email.");
      return;
    }

    setLoading(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
      setLoading(false);
      if (error) return setMessage(error.message);
      if (!data.session) return setMessage("Check your email to confirm, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      setLoading(false);
      if (error) return setMessage(error.message);
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <BackLink href="/" label="Back" />

      <h1 className="text-2xl font-bold" style={{ color: "#861F41" }}>
        Idle Death Gamble
      </h1>
      <p>{mode === "signin" ? "Sign in with your VT email." : "Create an account with your VT email."}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="email" className="font-medium">VT email</label>
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

        <label htmlFor="password" className="font-medium">Password</label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-gray-400 p-2"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded p-2 font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#861F41" }}
        >
          {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      <p role="alert" aria-live="polite" className="min-h-6 text-sm" style={{ color: "#B00020" }}>
        {message}
      </p>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="text-left text-sm underline"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}