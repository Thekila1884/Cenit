import { escapeHtml } from './escape-html';
import type { Role, UserProfile } from '../types';

export function renderUsersTable(users: UserProfile[], roleName: (role: Role) => string) {
  if (!users.length) return '<div class="empty-state"><h2>Sin usuarios</h2><p>Invita al equipo para comenzar.</p></div>';
  return `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Empresa</th><th>Departamento</th><th>Rol</th><th>Estado</th></tr></thead><tbody>${users.map((user) => `
    <tr><td><strong>${escapeHtml(user.name)}</strong></td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.companyId)}</td><td>${escapeHtml(user.department || '—')}</td><td>${roleName(user.role)}</td><td><span class="badge ${user.active ? 'status-resuelto' : 'priority-alta'}">${user.active ? 'Activo' : 'Inactivo'}</span></td></tr>`).join('')}</tbody></table></div>`;
}

export function renderInviteDialog(companyName: string, companyId: string) {
  return `
    <form id="invite-form" class="dialog-content">
      <div class="dialog-heading"><div><p class="eyebrow">ACCESO AL EQUIPO</p><h2>Invitar usuario</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <p class="muted">Se creará la cuenta y recibirás un enlace para compartirlo con la persona invitada.</p>
      <p class="notice">Empresa: <strong>${escapeHtml(companyName)}</strong> · Código ${escapeHtml(companyId)}</p>
      <label>Nombre completo<input name="name" maxlength="120" required></label>
      <label>Correo electrónico<input name="email" type="email" maxlength="254" required></label>
      <label>Departamento<input name="department" maxlength="120"></label>
      <label>Rol<select name="role"><option value="user">Solicitante</option><option value="agent">Agente</option><option value="admin">Administrador</option></select></label>
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Crear invitación</button></div>
    </form>`;
}

export function renderInviteLink(email: string, link: string) {
  return `
    <div class="dialog-content"><div class="dialog-heading"><div><p class="eyebrow">INVITACIÓN CREADA</p><h2>Comparte el enlace</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <p>La cuenta de <strong>${escapeHtml(email)}</strong> ya está creada. Comparte este enlace de configuración de contraseña por un canal corporativo seguro.</p>
      <label>Enlace de un solo uso<textarea id="invite-link" rows="4" readonly>${escapeHtml(link)}</textarea></label>
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="copy-link">Copiar enlace</button><button class="button primary" type="button" data-action="close-modal">Listo</button></div>
    </div>`;
}
