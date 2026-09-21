# AAFM India Social Content Operations

One operating system for social content planning, production, approval and publishing accountability. The detailed departmental workflow remains grouped under the six familiar headings: Idea → Script → Shoot → Production → Upload → Post-Upload. Performance reporting stays in Zoho Social/Zoho Analytics and is not a tracker section or a manual data-entry task.

The workflow inside those headings is:

- Idea: topic research, HOD input and calendar placement
- Script: drafting, subject-matter validation and financial compliance
- Shoot: shoot brief and recording
- Production: editing/design, Harshit quality control and Priya final approval
- Upload: platform scheduling and publishing
- Post-Upload: publish confirmation, live-link capture and learning notes

The dashboard tracks the 60% Knowledge / 20% Promotional / 20% AAFM India Insider content mix. Financial compliance, brand judgement, final video approval, sensitive comments and crisis communication remain human-controlled.

## RACI and operating cadence

- **RACI matrix** compares all six stages of each item with Responsible, Accountable, Consulted and Informed assignments. It highlights missing assignments. Owners/Admins can edit any stage; Responsible and Accountable assignments are required, and changes are recorded in the item history.
- **Operating cadence** generates weekly/monthly checkpoints in Asia/Kolkata. Owners/Admins can create, edit, pause and reactivate recurrence rules, select an owner and participants, link a pipeline stage, and define a deliverable and reminder lead time (24 hours by default). Owners, participants and administrators can mark occurrences complete.
- The dashboard and calendar surface relevant upcoming checkpoints. The demonstration includes monthly editorial reviews and weekly planning, compliance, shoot, production and publishing checkpoints. These schedules are editable starting points, not confirmed meeting times from the team brief.
- Engagement and lead handling stay in Zoho Social or the team's other systems; they are not duplicated in this tracker.

Demo edits are held in memory and reset on reload. Live persistence, email delivery and scheduled reminder processing require the Supabase setup below; they are not activated just by publishing this code.

## Current modes

- Without Supabase environment values, the app opens a fully interactive demonstration workspace with role presets, realistic AAFM India content and department requests. Demonstration changes reset on reload.
- With `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, it uses invite-only Supabase email/password authentication and the database policies in `supabase/migrations`. Vercel may use the equivalent `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` names.

## Connect a new Supabase project

1. Create a Supabase project and keep public sign-ups disabled; users should be invited or created by an administrator.
2. Link this local folder with the Supabase CLI and apply all migrations in `supabase/migrations` in timestamp order.
3. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the Site runtime environment.
4. Invite `aditi@buildablelabs.com` in Supabase Auth. Her profile is automatically activated as the single protected Owner account.
5. Sign in as Aditi. The Owner can invite and activate teammates from **People & access**; Admin invitations remain pending until the Owner assigns access. Only Aditi can change existing roles. Content, stage-level discussion and interdepartment requests are protected with role-aware RLS.
6. Deploy the `invite-user` and `send-notifications` Edge Functions. Add `RESEND_API_KEY` as an Edge Function secret. The default sender is `AAFM Content Ops <notifications@updates.buildablelabs.com>`; override it with `RESEND_FROM_EMAIL` only if needed. Schedule an authenticated invocation of `send-notifications` with Supabase Cron (for example, every 15 minutes). Keep all service credentials in Supabase, never in browser code.
7. Configure Supabase Auth custom SMTP with the Resend SMTP credentials for the verified `updates.buildablelabs.com` domain. Disable public sign-ups so only Owner/Admin invitations can create logins.

## Stage discussion and feedback

Every comment records its pipeline stage and type: Update, Feedback or Decision. Replies remain linked to their parent comment, open feedback appears in the assigned team member’s action list, and resolving or reopening feedback creates an audit-history entry. This keeps handoffs simple while preserving who said what, where, and when.

No service-role or secret key belongs in the browser or Site environment. The email function receives Supabase's service-role key only in its server-side Edge Function environment.
