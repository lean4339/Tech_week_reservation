'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-shell">
      <section className="card">
        <h1>No pudimos cargar esta página</h1>
        <p>Comprobá que el backend, PostgreSQL y Redis estén disponibles.</p>
        <button onClick={reset}>Volver a intentar</button>
      </section>
    </main>
  );
}
