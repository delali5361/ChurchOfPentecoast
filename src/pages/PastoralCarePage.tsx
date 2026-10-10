import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function PastoralCarePage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions['pastoral-care'];
  return definition ? <ModulePage page="pastoral-care" definition={definition} onAction={onAction} /> : null;
}
