import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceBranch = { id: string; name: string };
export type WorkspaceOrganization = { id: string; name: string; branches: WorkspaceBranch[] };

export async function getCurrentOrganization(client: SupabaseClient): Promise<WorkspaceOrganization> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw new Error(`Could not identify your signed-in account: ${authError.message}`);
  if (!authData.user) throw new Error('Sign in to load your church workspace.');

  const { data: profile, error: profileError } = await client
    .from('users')
    .select('organization_id')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load your organization profile: ${profileError.message}`);
  if (!profile?.organization_id) throw new Error('Your account is not linked to an organization. Ask an administrator to complete setup.');

  const { data: organization, error: organizationError } = await client
    .from('organizations')
    .select('id,name')
    .eq('id', profile.organization_id)
    .single();
  if (organizationError) throw new Error(`Could not load your organization: ${organizationError.message}`);

  const { data: branches, error: branchesError } = await client
    .from('branches')
    .select('id,name')
    .eq('organization_id', organization.id)
    .eq('status', 'active')
    .order('name');
  if (branchesError) throw new Error(`Could not load active branches: ${branchesError.message}`);

  return { ...organization, branches: branches ?? [] };
}
