import { requireUser } from '@/lib/auth';
import { WorkspaceShell } from '@/components/workspace-shell';
import { MetricsDashboard } from '@/components/business/metrics-dashboard';
export default async function MetricsPage() {
  const user = await requireUser('admin:read');
  return (
    <WorkspaceShell
      user={user}
      title="Métricas de utilización"
      section="metrics"
    >
      <MetricsDashboard />
    </WorkspaceShell>
  );
}
