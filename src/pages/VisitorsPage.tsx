import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function VisitorsPage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.visitors;
  return definition ? <ModulePage page="visitors" definition={definition} onAction={onAction} /> : null;
}
