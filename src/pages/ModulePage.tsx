import { ModuleWorkspace } from '../components/ModuleWorkspace';
import { PageHeading } from '../components/PageHeading';
import type { ModuleDefinition } from '../data/modules';
import type { PageId } from '../types';

export function ModulePage({ page, definition, onAction }: { page: PageId; definition: ModuleDefinition; onAction: (message: string) => void }) {
  return <><PageHeading page={page} /><ModuleWorkspace definition={definition} onAction={onAction} /></>;
}
