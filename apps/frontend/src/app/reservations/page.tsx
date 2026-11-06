import { requireUser } from '@/lib/auth';
import { WorkspaceShell } from '@/components/workspace-shell';
import { ReservationManager } from '@/components/business/reservation-manager';

export default async function ReservationsPage() {
  const user = await requireUser('reservations:own');
  return (
    <WorkspaceShell user={user} title="Mis reservas" section="reservations">
      <ReservationManager />
    </WorkspaceShell>
  );
}
