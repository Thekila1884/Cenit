import { escapeHtml } from './escape-html';

export function renderLoginView(configurationError: string, message: string) {
  return `
    <main class="auth-page">
      <section class="auth-card">
        <a class="brand auth-brand" href="#/home"><span class="brand-mark">C</span><span>Cenit</span></a>
        <p class="eyebrow">MESA DE AYUDA</p>
        <h1>Bienvenido</h1>
        <p class="muted">Ingresa para consultar y gestionar tus solicitudes.</p>
        ${configurationError ? `<div class="notice error">${escapeHtml(configurationError)}</div>` : ''}
        ${message ? `<div class="notice error" role="alert">${escapeHtml(message)}</div>` : ''}
        <form id="login-form" class="form-stack">
          <label>Correo electrónico<input name="email" type="email" autocomplete="username" required maxlength="254"></label>
          <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="button primary wide" type="submit" ${configurationError ? 'disabled' : ''}>Iniciar sesión</button>
        </form>
        <button class="text-button" type="button" data-action="forgot">Olvidé mi contraseña</button>
        <button class="button secondary wide" type="button" data-action="report-error">Reportar error</button>
        <a class="home-link" href="#/home">Volver a la página de inicio</a>
        <p class="footnote">El acceso es por invitación. Solicita una cuenta al administrador.</p>
      </section>
    </main>
    <dialog id="modal" class="modal"></dialog>
    <div id="toast" role="status" aria-live="polite"></div>`;
}
