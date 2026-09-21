import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Server-only: every balance/reward write happens here,
 * never from the browser. RLS is enabled with zero client policies, so the
 * anon key cannot read or write any of the money tables.
 */
export function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env["BEARFARM_DB_URL"];
  const key = process.env["BEARFARM_DB_SERVICE_KEY"];
  if (!url || !key) throw new Error("Database is not configured yet.");

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // New-format sb_secret_ keys are opaque, not JWTs: send them as apikey only.
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input as RequestInfo, { ...init, headers });
      },
    },
  });
  return cached;
}

export function isDbConfigured() {
  return Boolean(process.env["BEARFARM_DB_URL"] && process.env["BEARFARM_DB_SERVICE_KEY"]);
}
