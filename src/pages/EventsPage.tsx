import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function EventsPage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.events;
  return definition ? <ModulePage page="events" definition={definition} onAction={onAction} /> : null;
}
