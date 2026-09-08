import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isConfigured) {
  console.warn('Supabase URL or Anon Key is missing. Signals will not sync properly.');
}

/**
 * Lazily-guarded Supabase client.
 *
 * `createClient` throws synchronously on an empty URL ("supabaseUrl is required"),
 * which crashed static prerendering in any environment without the Supabase env vars —
 * e.g. CI, where the whole app's `next build` died at import time. We build the real
 * client only when configured; otherwise we expose a proxy that stays inert at import /
 * prerender and throws a clear, actionable error only if the client is actually used at
 * runtime. `supabase` keeps its original inferred type (captured from the call site via
 * `NonNullable<typeof configuredClient>`), so every importer keeps working unchanged.
 */
const configuredClient = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const supabase: NonNullable<typeof configuredClient> =
  configuredClient ??
  (new Proxy(
    {},
    {
      get() {
        throw new Error(
          'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to use realtime signals.',
        );
      },
    },
  ) as NonNullable<typeof configuredClient>);
