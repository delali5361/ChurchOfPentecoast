import type { WorkspaceOrganization } from './workspace';

const previewOrganizationId = 'preview-grace-assembly';

export function readPreviewRows<T>(collection: string): T[] {
  if (typeof window === 'undefined') return [];
  const value = window.localStorage.getItem(`church-cms.preview.${collection}`);
  if (!value) return [];
  const rows: unknown = JSON.parse(value);
  if (!Array.isArray(rows)) throw new Error(`Preview data for "${collection}" is invalid.`);
  return rows as T[];
}

export function writePreviewRows<T>(collection: string, rows: T[]) {
  if (typeof window === 'undefined') throw new Error('Preview storage is not available in this environment.');
  window.localStorage.setItem(`church-cms.preview.${collection}`, JSON.stringify(rows));
}

export function createPreviewId() {
  return globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type PreviewAccount = {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  mustChangePassword: boolean;
  createdAt: string;
};

export function getPreviewOrganization(branches: WorkspaceOrganization['branches'] = []): WorkspaceOrganization {
  return { id: previewOrganizationId, name: 'Grace Assembly', branches };
}
