// Database client with the SECRET service-role key. Server code only, never the browser.
// "server-only" makes the build fail if a browser file ever imports this by mistake.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
