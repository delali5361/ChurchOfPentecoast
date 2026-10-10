import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function ReportsPage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.reports;
  return definition ? <ModulePage page="reports" definition={definition} onAction={onAction} /> : null;
}
