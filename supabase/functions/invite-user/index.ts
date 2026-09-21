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

  const [{ data: owner }, { data: adminRole }] = await Promise.all([
    admin
      .from('workspace_owners')
      .select('profile_id')
      .eq('profile_id', identity.user.id)
      .maybeSingle(),
    admin
      .from('user_roles')
      .select('profile_id')
      .eq('profile_id', identity.user.id)
      .eq('role', 'admin')
      .maybeSingle(),
  ]);
  if (!owner && !adminRole)
    return reply({ error: 'Only an Owner or Admin can invite people' }, 403);

  let payload: { email?: string; fullName?: string; roles?: string[] };
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
  if (owner && !roles.length)
    return reply({ error: 'Choose at least one responsibility' }, 400);

  const origin = request.headers.get('origin');
  const redirectTo = origin && /^https?:\/\//.test(origin) ? origin : undefined;
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
  if (inviteError || !invited.user)
    return reply(
      { error: inviteError?.message ?? 'Invitation could not be created' },
      400,
    );

  if (owner) {
    const { error: rolesError } = await admin
      .from('user_roles')
      .insert(roles.map((role) => ({ profile_id: invited.user!.id, role })));
    if (rolesError)
      return reply({ error: 'Invitation created, but role setup failed' }, 500);
  }
  const { error: profileError } = await admin
    .from('profiles')
    .update({ full_name: fullName, is_active: Boolean(owner) })
    .eq('id', invited.user.id);
  if (profileError)
    return reply({ error: 'Invitation created, but access setup failed' }, 500);
  return reply({
    invited: true,
    email,
    access: owner ? 'active' : 'pending_owner_approval',
  });
});
