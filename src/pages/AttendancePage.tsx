import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function AttendancePage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.attendance;
  return definition ? <ModulePage page="attendance" definition={definition} onAction={onAction} /> : null;
}
