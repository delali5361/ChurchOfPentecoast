import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function StructurePage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.structure;
  return definition ? <ModulePage page="structure" definition={definition} onAction={onAction} /> : null;
}
