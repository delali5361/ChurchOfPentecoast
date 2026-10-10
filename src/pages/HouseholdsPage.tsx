import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function HouseholdsPage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.households;
  return definition ? <ModulePage page="households" definition={definition} onAction={onAction} /> : null;
}
