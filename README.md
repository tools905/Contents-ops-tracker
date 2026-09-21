# AAFM India Social Content Operations

One operating system for social content planning, production, approval and publishing accountability. The detailed departmental workflow remains grouped under the six familiar headings: Idea → Script → Shoot → Production → Upload → Post-Upload Metrics. Performance reporting itself stays in Zoho Social/Zoho Analytics and is not a standalone tracker section.

The workflow inside those headings is:

- Idea: topic research, HOD input and calendar placement
- Script: drafting, subject-matter validation and financial compliance
- Shoot: shoot brief and recording
- Production: editing/design, Harshit quality control and Priya final approval
- Upload: platform scheduling and publishing
- Post-Upload Metrics: performance snapshots, weekly/monthly reporting and learning notes

The dashboard tracks the 60% Knowledge / 20% Promotional / 20% AAFM India Insider content mix. Financial compliance, brand judgement, final video approval, sensitive comments and crisis communication remain human-controlled.

## RACI and operating cadence

- **RACI matrix** compares all six stages of each item with Responsible, Accountable, Consulted and Informed assignments. It highlights missing assignments. Owners/Admins can edit any stage; Responsible and Accountable assignments are required, and changes are recorded in the item history.
- **Operating cadence** generates weekly/monthly checkpoints in Asia/Kolkata. Owners/Admins can create, edit, pause and reactivate recurrence rules, select an owner and participants, link a pipeline stage, and define a deliverable and reminder lead time (24 hours by default). Owners, participants and administrators can mark occurrences complete.
- The dashboard and calendar surface relevant upcoming checkpoints. The demonstration includes monthly editorial/analytics reviews and weekly planning, compliance, shoot, production, publishing and performance checkpoints. These schedules are editable starting points, not confirmed meeting times from the team brief.
- Engagement and lead handling stay in Zoho Social or the team's other systems; they are not duplicated in this tracker.

Demo edits are held in memory and reset on reload. Live persistence, email delivery and scheduled reminder processing require the Supabase setup below; they are not activated just by publishing this code.

## Current modes

- Without Supabase environment values, the app opens a fully interactive demonstration workspace with role presets, realistic AAFM India content and department requests. Demonstration changes reset on reload.
- With `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, it uses invite-only Supabase email/password authentication and the database policies in `supabase/migrations`. Vercel may use the equivalent `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` names.

## Connect a new Supabase project

1. Create a Supabase project and keep public sign-ups disabled; users should be invited or created by an administrator.
2. Link this local folder with the Supabase CLI and apply all migrations in `supabase/migrations` in timestamp order.
3. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the Site runtime environment.
4. Create or invite the two permanent Owner accounts in Supabase Auth. The database automatically creates their inactive profiles. In the SQL editor, activate those profiles and insert their UUIDs into slots `1` and `2` of `workspace_owners`.
5. Sign in as either Owner. Owners and Admins can invite teammates from **People & access**; only Owners can change existing access. Content, stage-level discussion, metrics and interdepartment requests are protected with role-aware RLS.
6. Deploy the `invite-user` and `send-notifications` Edge Functions. Add `RESEND_API_KEY` as an Edge Function secret. The default sender is `AAFM Content Ops <notifications@updates.buildablelabs.com>`; override it with `RESEND_FROM_EMAIL` only if needed. Schedule an authenticated invocation of `send-notifications` with Supabase Cron (for example, every 15 minutes). Keep all service credentials in Supabase, never in browser code.
7. Configure Supabase Auth custom SMTP with the Resend SMTP credentials for the verified `updates.buildablelabs.com` domain. Disable public sign-ups so only Owner/Admin invitations can create logins.

## Stage discussion and feedback

Every comment records its pipeline stage and type: Update, Feedback or Decision. Replies remain linked to their parent comment, open feedback appears in the assigned team member’s action list, and resolving or reopening feedback creates an audit-history entry. This keeps handoffs simple while preserving who said what, where, and when.

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
