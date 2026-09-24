import LoginPageClient from '@/app/login/login-page-client';
import type { SupabaseConfig } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const config: SupabaseConfig | undefined =
    url && publishableKey ? { url, publishableKey } : undefined;

  return <LoginPageClient supabaseConfig={config} />;
}
