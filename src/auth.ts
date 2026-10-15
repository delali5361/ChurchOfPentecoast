// src/auth.ts - Authorization and permission utilities
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PageId } from './types';

const rolePages: Record<string, PageId[]> = {
  member: [
    'overview', 'events', 'member-giving', 'member-updates', 'member-profile',
    'member-attendance', 'member-ministries', 'member-care', 'member-notifications',
  ],
  presiding_elder: ['overview', 'people', 'visitors', 'households', 'structure', 'attendance', 'events', 'reports'],
  youth_executive: ['overview'],
  media: ['overview', 'events', 'communications'],
  pastor: ['overview', 'people', 'visitors', 'households', 'structure', 'attendance', 'events', 'pastoral-care', 'reports'],
  branch_administrator: ['overview', 'people', 'visitors', 'households', 'structure', 'attendance', 'events', 'communications', 'reports'],
  department_leader: ['overview', 'structure', 'attendance', 'events'],
  group_leader: ['overview', 'structure', 'attendance', 'events'],
  worker: ['overview', 'attendance', 'events'],
  finance_officer: ['overview', 'finance', 'reports'],
  communication_officer: ['overview', 'events', 'communications'],
  pastoral_care_officer: ['overview', 'people', 'pastoral-care'],
};

export function getRoleAccessiblePages(roles: string[]): PageId[] | null {
  if (roles.includes('administrator') || roles.includes('super_administrator')) return null;
  const recognizedRoles = roles.filter((role) => role in rolePages);
  if (!recognizedRoles.length) return ['overview'];
  return [...new Set(recognizedRoles.flatMap((role) => rolePages[role]))];
}

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
