import Link from 'next/link';
import { backendGet, requireUser } from '@/lib/auth';
import { LogoutButton } from '@/components/logout-button';

interface AuditEvent {
  event: string;
  time: string;
  requestId: string;
  userId?: string;
  ip: string;
}
interface RequestEvent {
  requestId: string;
  time: string;
  ip: string;
  ipSource: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
}
export default async function AdminPage() {
  await requireUser('admin:read');
  const overview = (await (await backendGet('/admin/overview')).json()) as {
    users: number;
  };
  const { events } = (await (
    await backendGet('/admin/auth-events')
  ).json()) as { events: AuditEvent[] };
  const { requests } = (await (
    await backendGet('/admin/request-events')
  ).json()) as { requests: RequestEvent[] };
  return (
    <main className="workspace">
      <header>
        <Link href="/dashboard" className="brand">
          ← Mi cuenta
        </Link>
        <LogoutButton />
      </header>
      <section className="card">
        <p className="eyebrow">ADMINISTRACIÓN</p>
        <h1>Acceso y actividad</h1>
        <p>
          <strong>{overview.users}</strong> cuentas registradas.
        </p>
        <h2>Eventos de autenticación</h2>
        <p className="muted">
          Últimos 50 eventos disponibles de los últimos 7 días.
        </p>
        {events.length === 0 ? (
          <p>No hay eventos registrados.</p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Eventos de autenticación">
              <thead>
                <tr>
                  <th>Fecha (UTC)</th>
                  <th>Evento</th>
                  <th>IP de conexión</th>
                  <th>ID de solicitud</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => (
                  <tr key={`${event.requestId}-${index}`}>
                    <td>{event.time}</td>
                    <td>{event.event}</td>
                    <td>{event.ip}</td>
                    <td>{event.requestId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2>Solicitudes HTTP</h2>
        <p className="muted">
          IP de la conexión directa. En local, las solicitudes que pasan por
          Next.js muestran la IP del proxy local. Un error HTTP no demuestra por
          sí solo un ataque.
        </p>
        <div className="table-scroll">
          <table aria-label="Solicitudes HTTP">
            <thead>
              <tr>
                <th>Fecha (UTC)</th>
                <th>IP</th>
                <th>Método</th>
                <th>Ruta</th>
                <th>Estado</th>
                <th>Duración (ms)</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((entry) => (
                <tr key={entry.requestId}>
                  <td>{entry.time}</td>
                  <td>{entry.ip}</td>
                  <td>{entry.method}</td>
                  <td>{entry.route}</td>
                  <td>{entry.status}</td>
                  <td>{entry.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
