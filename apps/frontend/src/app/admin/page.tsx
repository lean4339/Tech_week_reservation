import { requireUser } from '@/lib/auth';
import { WorkspaceShell } from '@/components/workspace-shell';
import { ReservationManager } from '@/components/business/reservation-manager';

export default async function AdminPage() {
  const user = await requireUser('reservations:manage');
  return (
    <WorkspaceShell
      user={user}
      title="Agenda de reservas"
      section="reservations"
    >
      <ReservationManager admin />
    </WorkspaceShell>
  );
}
