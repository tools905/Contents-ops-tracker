import ContentOpsApp from '@/app/content-ops-app';
import type { SupabaseConfig } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export default function Home() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const config: SupabaseConfig | undefined =
    url && publishableKey ? { url, publishableKey } : undefined;
  return <ContentOpsApp supabaseConfig={config} />;
}
