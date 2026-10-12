// src/auth.ts - Authorization and permission utilities
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getCurrentUserRoles(client: SupabaseClient) {
  const { data: session, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Could not read the sign-in session: ${sessionError.message}`);
  if (!session?.session) return [];

  const { data, error } = await client
    .from('user_roles')
    .select('app_roles(code, name)')
    .eq('user_id', session.session.user.id);

  if (error) throw new Error(`Could not load your workspace roles: ${error.message}`);
  return data?.flatMap((entry) => {
    const role = entry.app_roles as unknown as { code: string; name: string } | null;
    return role?.code ? [role.code] : [];
  }) ?? [];
}

export async function getCurrentUserPermissions(client: SupabaseClient) {
  const { data: session } = await client.auth.getSession();
  if (!session?.session) return [];

  const { data, error } = await client
    .from('user_roles')
    .select('app_role_id')
    .eq('user_id', session.session.user.id);

  if (error || !data) return [];

  const roleIds = data.map((entry) => (entry as unknown as { app_role_id: string }).app_role_id);
  if (!roleIds.length) return [];

  const { data: permissions, error: permError } = await client
    .from('role_permissions')
    .select('app_permissions(code)')
    .in('app_role_id', roleIds);

  if (permError || !permissions) return [];
  return permissions.flatMap((entry) => {
    const perm = (entry as unknown as { app_permissions: { code: string } | null })?.app_permissions;
    return perm?.code ? [perm.code] : [];
  });
}

export async function hasPermission(client: SupabaseClient, permission: string) {
  const permissions = await getCurrentUserPermissions(client);
  return permissions.includes(permission);
}

export async function auditLog(
  client: SupabaseClient,
  {
    organization_id,
    action,
    resource,
    resource_id,
    entity_type,
    previous_values,
    new_values,
  }: {
    organization_id: string;
    action: string;
    resource: string;
    resource_id?: string;
    entity_type: string;
    previous_values?: unknown;
    new_values?: unknown;
  }
) {
  const { data: session } = await client.auth.getSession();
  if (!session?.session?.user) return;

  const userAgent = typeof window !== 'undefined' ? navigator.userAgent : undefined;

  const { error } = await client.from('audit_logs').insert({
    organization_id,
    user_id: session.session.user.id,
    action,
    resource,
    resource_id,
    entity_type,
    previous_values,
    new_values,
    user_agent: userAgent,
  });

  if (error) console.error('Audit log failed:', error);
}
