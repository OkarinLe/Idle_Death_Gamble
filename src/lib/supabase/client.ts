import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Secret keys must never reach the browser. Fail loudly with the fix instead of a vague 401.
  if (key?.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is a SECRET key. Put the publishable key (sb_publishable_...) " +
        "from Supabase > Project Settings > API Keys in .env.local, then restart npm run dev."
    );
  }

  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}
