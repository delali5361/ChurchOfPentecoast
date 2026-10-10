import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function CommunicationsPage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.communications;
  return definition ? <ModulePage page="communications" definition={definition} onAction={onAction} /> : null;
}
