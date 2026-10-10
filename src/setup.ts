import type { SupabaseClient } from '@supabase/supabase-js';

export async function initializeOrganization(
  client: SupabaseClient,
  {
    name,
    slug,
    description,
    contact_email,
    contact_phone,
    country,
    timezone,
  }: {
    name: string;
    slug: string;
    description?: string;
    contact_email?: string;
    contact_phone?: string;
    country?: string;
    timezone?: string;
  }
) {
  const { data, error } = await client.from('organizations').insert({
    name,
    slug,
    description,
    contact_email,
    contact_phone,
    country,
    timezone: timezone || 'UTC',
  }).select().single();

  if (error) throw new Error(`Failed to create organization: ${error.message}`);
  return data;
}

export async function createBranch(
  client: SupabaseClient,
  organization_id: string,
  {
    name,
    code,
    description,
    location,
    contact_email,
    contact_phone,
    is_headquarters,
  }: {
    name: string;
    code?: string;
    description?: string;
    location?: string;
    contact_email?: string;
    contact_phone?: string;
    is_headquarters?: boolean;
  }
) {
  const { data, error } = await client.from('branches').insert({
    organization_id,
    name,
    code,
    description,
    location,
    contact_email,
    contact_phone,
    is_headquarters: is_headquarters || false,
  }).select().single();

  if (error) throw new Error(`Failed to create branch: ${error.message}`);
  return data;
}

export async function createUser(
  client: SupabaseClient,
  {
    email,
    password,
    organization_id,
    preferred_name,
    phone,
  }: {
    email: string;
    password: string;
    organization_id: string;
    preferred_name?: string;
    phone?: string;
  }
) {
  const { data: auth, error: authError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) throw new Error(`Failed to create user: ${authError.message}`);
  if (!auth.user) throw new Error('User creation failed: no user returned');

  const { error: profileError } = await client.from('users').insert({
    id: auth.user.id,
    organization_id,
    preferred_name,
    phone,
  });

  if (profileError) throw new Error(`Failed to create user profile: ${profileError.message}`);
  return auth.user;
}

export async function assignUserRole(
  client: SupabaseClient,
  user_id: string,
  role_code: string,
  branch_id?: string
) {
  const { data: role, error: roleError } = await client
    .from('app_roles')
    .select('id')
    .eq('code', role_code)
    .single();

  if (roleError) throw new Error(`Role not found: ${role_code}`);
  if (!role) throw new Error(`Role not found: ${role_code}`);

  const { error } = await client.from('user_roles').insert({
    user_id,
    app_role_id: role.id,
    branch_id,
  });

  if (error) throw new Error(`Failed to assign role: ${error.message}`);
}

export async function createUserInOrganization(
  client: SupabaseClient,
  organization_id: string,
  {
    email,
    password,
    preferred_name,
    phone,
    role_code,
    branch_id,
  }: {
    email: string;
    password: string;
    preferred_name?: string;
    phone?: string;
    role_code: string;
    branch_id?: string;
  }
) {
  const user = await createUser(client, {
    email,
    password,
    organization_id,
    preferred_name,
    phone,
  });

  await assignUserRole(client, user.id, role_code, branch_id);
  return user;
}
