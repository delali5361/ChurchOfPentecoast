import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function PeoplePage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.people;
  return definition ? <ModulePage page="people" definition={definition} onAction={onAction} /> : null;
}
