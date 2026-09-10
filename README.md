# AAFM India Social Content Operations

One operating system for social content planning, production, approval, publishing, engagement, lead handling and reporting. The detailed departmental workflow remains grouped under the six familiar headings: Idea → Script → Shoot → Production → Upload → Post-Upload Metrics.

The workflow inside those headings is:

- Idea: topic research, HOD input and calendar placement
- Script: drafting, subject-matter validation and financial compliance
- Shoot: shoot brief and recording
- Production: editing/design, Harshit quality control and Priya final approval
- Upload: platform scheduling and publishing
- Post-Upload Metrics: engagement monitoring, lead follow-up and weekly/monthly reporting

The dashboard tracks the 60% Knowledge / 20% Promotional / 20% AAFM India Insider content mix. Financial compliance, brand judgement, final video approval, sensitive comments and crisis communication remain human-controlled.

## Current modes

- Without Supabase environment values, the app opens a fully interactive demonstration workspace with the role presets from the department brief and realistic AAFM India content, inbox, leads and requests.
- With `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, it uses invite-only Supabase email/password authentication and the database policies in `supabase/migrations`.

## Connect a new Supabase project

1. Create a Supabase project and keep public sign-ups disabled; users should be invited or created by an administrator.
2. Link this local folder with the Supabase CLI and apply the migration in `supabase/migrations`.
3. Add the two Supabase values from `.env.example` to the Site runtime environment.
4. Create or invite the two permanent Owner accounts in Supabase Auth. The database automatically creates their inactive profiles. In the SQL editor, activate those profiles and insert their UUIDs into slots `1` and `2` of `workspace_owners`.
5. Sign in as either Owner. New Auth users appear under **People & access**, where an Owner can activate the login and assign one or more roles. Admins can run all content workflows, but only the two Owners can change access. The operational tables for leads, inbox items and interdepartment requests use RLS as well.
6. Deploy the `send-notifications` Edge Function. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` as Edge Function secrets, then schedule the function and `enqueue_due_date_reminders()` with Supabase Cron at the cadence you prefer.

Example Owner bootstrap after both Auth users exist (replace the two email values):

```sql
update public.profiles
set is_active = true
where email in ('owner-one@aafmindia.com', 'owner-two@aafmindia.com');

insert into public.workspace_owners (slot, profile_id)
select 1, id from public.profiles where email = 'owner-one@aafmindia.com'
union all
select 2, id from public.profiles where email = 'owner-two@aafmindia.com';
```

No service-role or secret key belongs in the browser or Site environment. The email function receives Supabase's service-role key only in its server-side Edge Function environment.
