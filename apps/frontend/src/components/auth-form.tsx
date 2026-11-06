'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const signup = mode === 'signup';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'tech-week-web',
        },
        body: JSON.stringify({
          email: String(data.get('email')).trim(),
          password: String(data.get('password')),
          ...(signup
            ? { businessName: String(data.get('businessName')).trim() }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message ?? 'No se pudo completar la solicitud.');
        return;
      }
      form.reset();
      if (signup) setMessage(body.message);
      else {
        router.replace('/dashboard');
        router.refresh();
      }
    } catch {
      setError('No pudimos conectar. Volvé a intentarlo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="card">
        <p className="eyebrow">TECH WEEK RESERVATION</p>
        <h1>{signup ? 'Creá tu cuenta' : 'Bienvenido de nuevo'}</h1>
        <p className="muted">
          {signup
            ? 'Registrate para acceder a tu espacio.'
            : 'Ingresá con tu email y contraseña.'}
        </p>
        <form onSubmit={submit}>
          {signup && (
            <>
              <label htmlFor="businessName">Nombre de la empresa</label>
              <input
                id="businessName"
                name="businessName"
                type="text"
                autoComplete="organization"
                minLength={2}
                maxLength={120}
                required
                disabled={busy}
                aria-describedby="business-name-help"
              />
              <p id="business-name-help" className="muted hint">
                Entre 2 y 120 caracteres.
              </p>
            </>
          )}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            disabled={busy}
          />
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 15 : 1}
            maxLength={128}
            aria-describedby={signup ? 'password-help' : undefined}
            required
            disabled={busy}
          />
          {signup && (
            <p className="muted hint" id="password-help">
              Entre 15 y 128 caracteres. Podés usar una frase larga y un gestor
              de contraseñas.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success">
              {message} <Link href="/login">Iniciar sesión</Link>
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? 'Procesando…' : signup ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="footer-link">
          {signup ? '¿Ya tenés una cuenta?' : '¿Todavía no tenés cuenta?'}{' '}
          <Link href={signup ? '/login' : '/signup'}>
            {signup ? 'Iniciá sesión' : 'Registrate'}
          </Link>
        </p>
      </section>
    </main>
  );
}
