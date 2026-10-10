import type { PageId } from '../types';
import { supabase } from '../supabase';

export interface ProtectedPageProps {
  requiredPermission?: string;
  requiredRole?: string;
  children: React.ReactNode;
}

export function ProtectedPage({
  requiredPermission,
  requiredRole,
  children,
}: ProtectedPageProps) {
  // This is a client-side wrapper. It will check permissions
  // and hide content if the user lacks access.
  // The backend API should ALSO check permissions.
  if (!requiredPermission && !requiredRole) {
    return <>{children}</>;
  }

  // TODO: Implement async permission check using auth.ts utilities
  // For now, render children and rely on backend permission checks
  return <>{children}</>;
}

export interface ProtectedActionProps {
  permission: string;
  action: () => void;
  className?: string;
  children: React.ReactNode;
}

export function ProtectedButton({
  permission,
  action,
  className = 'btn btn-primary',
  children,
}: ProtectedActionProps) {
  // TODO: Check if user has permission; disable/hide button if not
  return (
    <button className={className} onClick={action}>
      {children}
    </button>
  );
}
