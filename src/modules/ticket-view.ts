import { escapeHtml } from './escape-html';
import {
  CATEGORIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Ticket,
  type TicketComment,
  type UserProfile,
} from '../types';

interface TicketDetailOptions {
  isStaff: boolean;
  users: UserProfile[];
  isLate: (ticket: Ticket) => boolean;
  formatDate: (timestamp: Ticket['createdAt']) => string;
}

export function renderTicketRows(items: Ticket[], isLate: (ticket: Ticket) => boolean) {
  if (!items.length) return '<div class="empty-state"><span class="empty-icon">✓</span><h2>No hay tickets</h2><p>Cuando haya solicitudes, aparecerán aquí.</p></div>';
  return `<div class="ticket-list">${items.map((ticket) => `
    <button class="ticket-row" type="button" data-action="detail" data-id="${escapeHtml(ticket.id)}">
      <span class="ticket-id">TK-${ticket.id.slice(0, 6).toUpperCase()}</span>
      <span class="ticket-main"><strong>${escapeHtml(ticket.title)}</strong><small>${escapeHtml(ticket.category)} · ${escapeHtml(ticket.createdByName)}</small></span>
      <span class="badge status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
      <span class="badge priority-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>
      <span class="due ${isLate(ticket) ? 'late' : ''}">${escapeHtml(ticket.dueDate)}${isLate(ticket) ? ' · vencido' : ''}</span>
    </button>`).join('')}</div>`;
}

export function renderNewTicketDialog(today: string) {
  return `
    <form id="ticket-form" class="dialog-content">
      <div class="dialog-heading"><div><p class="eyebrow">NUEVA SOLICITUD</p><h2>Cuéntanos qué necesitas</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <label>Título<input name="title" maxlength="120" required placeholder="Resume el problema o solicitud"></label>
      <label>Descripción<textarea name="description" rows="4" maxlength="4000" placeholder="Agrega los detalles que nos ayudarán a atenderte"></textarea></label>
      <div class="form-grid">
        <label>Categoría<select name="category">${CATEGORIES.map((category) => `<option>${escapeHtml(category)}</option>`).join('')}</select></label>
        <label>Prioridad<select name="priority">${Object.entries(PRIORITY_LABELS).map(([key, label]) => `<option value="${key}" ${key === 'media' ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Fecha deseada<input name="dueDate" type="date" min="${today}" value="${today}"></label>
      </div>
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Crear solicitud</button></div>
    </form>`;
}

export function renderTicketDetailDialog(
  ticket: Ticket,
  comments: TicketComment[],
  options: TicketDetailOptions,
) {
  const assignee = options.users.find((user) => user.uid === ticket.assignedTo);
  return `
    <div class="dialog-content">
      <div class="dialog-heading"><div><p class="eyebrow">TK-${ticket.id.slice(0, 6).toUpperCase()} · ${escapeHtml(ticket.category)}</p><h2>${escapeHtml(ticket.title)}</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <p class="detail-description">${escapeHtml(ticket.description || 'Sin descripción')}</p>
      <div class="detail-grid">
        <div><small>Solicitante</small><strong>${escapeHtml(ticket.createdByName)}</strong></div>
        <div><small>Estado</small>${options.isStaff ? `<select data-ticket-field="status" data-id="${escapeHtml(ticket.id)}">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${ticket.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select>` : `<span class="badge status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>`}</div>
        <div><small>Prioridad</small>${options.isStaff ? `<select data-ticket-field="priority" data-id="${escapeHtml(ticket.id)}">${Object.entries(PRIORITY_LABELS).map(([key, label]) => `<option value="${key}" ${ticket.priority === key ? 'selected' : ''}>${label}</option>`).join('')}</select>` : `<span class="badge priority-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>`}</div>
        <div><small>Asignado a</small>${options.isStaff ? `<select data-ticket-field="assignedTo" data-id="${escapeHtml(ticket.id)}"><option value="">Sin asignar</option>${options.users.filter((user) => user.active && user.role !== 'user').map((user) => `<option value="${escapeHtml(user.uid)}" ${ticket.assignedTo === user.uid ? 'selected' : ''}>${escapeHtml(user.name)}</option>`).join('')}</select>` : `<strong>${escapeHtml(assignee?.name ?? 'Sin asignar')}</strong>`}</div>
        <div><small>Fecha límite</small><strong class="${options.isLate(ticket) ? 'late' : ''}">${escapeHtml(ticket.dueDate || '—')}</strong></div>
        <div><small>Creado</small><strong>${options.formatDate(ticket.createdAt)}</strong></div>
      </div>
      <section class="activity"><h3>Actividad <span>${comments.length}</span></h3>
        ${comments.length ? comments.map((comment) => `<article class="comment"><div><strong>${escapeHtml(comment.authorName)}</strong><time>${options.formatDate(comment.createdAt)}</time></div><p>${escapeHtml(comment.text)}</p></article>`).join('') : '<p class="muted">Aún no hay comentarios.</p>'}
      </section>
      <form id="comment-form" class="comment-form" data-id="${escapeHtml(ticket.id)}"><textarea name="comment" rows="2" maxlength="4000" required placeholder="Escribe una actualización..."></textarea><button class="button primary" type="submit">Comentar</button></form>
    </div>`;
}
