# AAFM India Content Ops Tracker

An internal content pipeline for Idea → Script → Shoot → Production → Upload → Post-Upload Metrics, with explicit accountable approval at every transition and optional BuildableLabs second-lens review at Script and Production.

## Current modes

- Without Supabase environment values, the app opens a fully interactive demonstration workspace with fictional users and realistic AAFM India content.
- With `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, it uses invite-only Supabase email/password authentication and the database policies in `supabase/migrations`.

## Connect a new Supabase project

1. Create a Supabase project and keep public sign-ups disabled; users should be invited or created by an administrator.
2. Link this local folder with the Supabase CLI and apply the migration in `supabase/migrations`.
3. Add the two Supabase values from `.env.example` to the Site runtime environment.
4. Create or invite users in Supabase Auth. The database automatically creates inactive profiles; activate them and assign roles in `profiles` and `user_roles`.
5. Deploy the `send-notifications` Edge Function. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` as Edge Function secrets, then schedule the function and `enqueue_due_date_reminders()` with Supabase Cron at the cadence you prefer.

No service-role or secret key belongs in the browser or Site environment. The email function receives Supabase's service-role key only in its server-side Edge Function environment.
