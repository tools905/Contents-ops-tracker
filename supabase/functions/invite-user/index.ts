import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type',
  'content-type': 'application/json',
};
const allowedRoles = new Set([
  'admin',
  'content_producer',
  'content_approver',
  'monitoring',
  'read_only_stakeholder',
]);

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST')
    return reply({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!supabaseUrl || !serviceRoleKey || !authorization?.startsWith('Bearer '))
    return reply({ error: 'Authentication required' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice('Bearer '.length);
  const { data: identity, error: identityError } =
    await admin.auth.getUser(token);
  if (identityError || !identity.user)
    return reply({ error: 'Invalid session' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id,is_active,access_status')
    .eq('auth_user_id', identity.user.id)
    .maybeSingle();
  if (
    !callerProfile ||
    !callerProfile.is_active ||
    callerProfile.access_status !== 'active'
  )
    return reply({ error: 'Active profile not found' }, 403);

  const isOwnerProfile = async (profileId: string) => {
    const { data } = await admin
      .from('workspace_owners')
      .select('profile_id')
      .eq('profile_id', profileId)
      .maybeSingle();
    return Boolean(data);
  };
  const [owner, { data: adminRole }] = await Promise.all([
    isOwnerProfile(callerProfile.id),
    admin
      .from('user_roles')
      .select('profile_id')
      .eq('profile_id', callerProfile.id)
      .eq('role', 'admin')
      .maybeSingle(),
  ]);
  if (!owner && !adminRole)
    return reply({ error: 'Only an Owner or Admin can invite people' }, 403);

  let payload: {
    profileId?: string;
    email?: string;
    fullName?: string;
    roles?: string[];
  };
  try {
    payload = await request.json();
  } catch {
    return reply({ error: 'Invalid request' }, 400);
  }
  const email = payload.email?.trim().toLowerCase();
  const fullName = payload.fullName?.trim();
  const roles = [...new Set(payload.roles ?? [])];
  if (!email || !/^\S+@\S+\.\S+$/.test(email))
    return reply({ error: 'Enter a valid email address' }, 400);
  if (!fullName || fullName.length > 120)
    return reply({ error: 'Enter the person’s name' }, 400);
  if (roles.some((role) => !allowedRoles.has(role)))
    return reply({ error: 'Choose only valid responsibilities' }, 400);
  if (!owner && roles.includes('admin'))
    return reply({ error: 'Only Aditi can grant the Admin role' }, 403);
  if (!roles.length && (owner || !payload.profileId))
    return reply({ error: 'Choose at least one responsibility' }, 400);

  const loadRoles = async (profileId: string) => {
    const { data } = await admin
      .from('user_roles')
      .select('role')
      .eq('profile_id', profileId);
    return (data ?? []).map((entry: { role: string }) => entry.role);
  };

  let targetProfileId = payload.profileId;
  let existingAuthUserId: string | null = null;
  if (targetProfileId) {
    const { data: target } = await admin
      .from('profiles')
      .select('id,auth_user_id,email')
      .eq('id', targetProfileId)
      .maybeSingle();
    if (!target) return reply({ error: 'Team member not found' }, 404);
    if (await isOwnerProfile(target.id))
      return reply({ error: 'Owner access cannot be changed here' }, 403);
    if (target.auth_user_id) {
      // Already invited: resend only while they have never signed in.
      const { data: existing } = await admin.auth.admin.getUserById(
        target.auth_user_id,
      );
      if (existing.user?.last_sign_in_at || existing.user?.email_confirmed_at)
        return reply(
          {
            error: `${fullName} has already signed in. They can use “Forgot password” on the login page.`,
          },
          409,
        );
      if ((existing.user?.email ?? target.email)?.toLowerCase() !== email)
        return reply(
          {
            error: `The invitation was sent to ${existing.user?.email ?? target.email}. Resend it to that address.`,
          },
          409,
        );
      existingAuthUserId = target.auth_user_id;
    } else {
      const { error: prepareError } = await admin
        .from('profiles')
        .update({ email, full_name: fullName })
        .eq('id', targetProfileId);
      if (prepareError)
        return reply({ error: 'Could not prepare the team profile' }, 500);
    }
  }

  const origin = request.headers.get('origin');
  const redirectTo =
    origin && /^https?:\/\//.test(origin)
      ? `${origin}/login?auth_action=invite`
      : undefined;
  // Supabase resends the invitation when the login exists but is unconfirmed.
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
  if (inviteError || !invited.user)
    return reply(
      {
        error: /already been registered/i.test(inviteError?.message ?? '')
          ? `${email} already has a login. They can use “Forgot password” on the login page.`
          : (inviteError?.message ?? 'Invitation could not be created'),
      },
      400,
    );

  if (!targetProfileId || !existingAuthUserId) {
    const { data: linkedProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', invited.user.id)
      .maybeSingle();
    targetProfileId = linkedProfile?.id ?? targetProfileId;
  }
  if (!targetProfileId)
    return reply(
      { error: 'Invitation created, but profile linking failed' },
      500,
    );

  // Read roles after linking: a new invite can match a saved directory entry.
  const fixedRoles = await loadRoles(targetProfileId);
  // Owners set any roles. Admins set non-Admin roles; a saved Admin profile
  // keeps its roles and waits for Aditi's approval.
  const rolesToWrite = owner
    ? roles
    : fixedRoles.includes('admin')
      ? undefined
      : roles.length
        ? roles
        : fixedRoles;
  if (!rolesToWrite?.length && !fixedRoles.length)
    return reply(
      { error: 'Invitation sent, but choose at least one responsibility' },
      400,
    );
  if (rolesToWrite) {
    await admin.from('user_roles').delete().eq('profile_id', targetProfileId);
    const { error: rolesError } = await admin
      .from('user_roles')
      .insert(
        rolesToWrite.map((role) => ({ profile_id: targetProfileId!, role })),
      );
    if (rolesError)
      return reply({ error: 'Invitation created, but role setup failed' }, 500);
  }
  const requiresOwnerApproval = !owner && fixedRoles.includes('admin');
  const accessActive = Boolean(owner) || !requiresOwnerApproval;
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      is_active: accessActive,
      access_status: accessActive ? 'active' : 'pending',
    })
    .eq('id', targetProfileId);
  if (profileError)
    return reply({ error: 'Invitation created, but access setup failed' }, 500);
  return reply({
    invited: true,
    email,
    access: accessActive ? 'active' : 'pending_owner_approval',
  });
});
