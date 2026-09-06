import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseConfig = { url: string; publishableKey: string };

export function makeSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
