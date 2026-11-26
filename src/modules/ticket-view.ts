import { escapeHtml } from './escape-html';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Ticket,
  type TicketCategoryOption,
  type TicketComment,
  type UserProfile,
} from '../types';

interface TicketDetailOptions {
  isStaff: boolean;
  users: UserProfile[];
  currentUserId: string;
  isLate: (ticket: Ticket) => boolean;
  formatDate: (timestamp: Ticket['createdAt']) => string;
}

export function renderTicketRows(items: Ticket[], isLate: (ticket: Ticket) => boolean) {
  if (!items.length) return '<div class="empty-state"><span class="empty-icon">✓</span><h2>No hay tickets</h2><p>Cuando haya solicitudes, aparecerán aquí.</p></div>';
  return `<div class="ticket-list">${items.map((ticket) => `
    <button class="ticket-row" type="button" data-action="detail" data-id="${escapeHtml(ticket.id)}">
      <span class="ticket-id">TK-${ticket.id.slice(0, 6).toUpperCase()}</span>
      <span class="ticket-main"><strong>${escapeHtml(ticket.title)}</strong><small>${escapeHtml([
        ticket.category,
        ticket.categoryType,
        ticket.issue,
        ticket.createdByName,
      ].filter(Boolean).join(' · '))}</small></span>
      <span class="badge status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>
      <span class="badge priority-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>
      <span class="due ${isLate(ticket) ? 'late' : ''}">${escapeHtml(ticket.dueDate)}${isLate(ticket) ? ' · vencido' : ''}</span>
    </button>`).join('')}</div>`;
}

export function renderNewTicketDialog(today: string, categories: TicketCategoryOption[]) {
  const firstCategory = categories[0];
  const firstType = firstCategory?.types[0];
  return `
    <form id="ticket-form" class="dialog-content">
      <div class="dialog-heading"><div><p class="eyebrow">NUEVA SOLICITUD</p><h2>Cuéntanos qué necesitas</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <label>Asunto<input name="title" maxlength="120" required placeholder="Resume el problema o solicitud"></label>
      <label>Descripción<textarea name="description" rows="4" maxlength="4000" placeholder="Agrega los detalles que nos ayudarán a atenderte"></textarea></label>
      <div class="form-grid">
        <label>Categoría<select name="category" data-ticket-category>${categories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('')}</select></label>
        <label>Tipo<select name="categoryType" data-ticket-type>${(firstCategory?.types ?? []).map((type) => `<option value="${escapeHtml(type.name)}">${escapeHtml(type.name)}</option>`).join('')}</select></label>
        <label>Falla<select name="issue" data-ticket-issue>${(firstType?.issues ?? []).map((issue) => `<option value="${escapeHtml(issue)}">${escapeHtml(issue)}</option>`).join('')}</select></label>
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
    <div class="ticket-detail-layout">
      <section class="ticket-detail-main">
        <div class="dialog-heading">
          <div><p class="eyebrow">TK-${ticket.id.slice(0, 6).toUpperCase()} · ${escapeHtml([ticket.category, ticket.categoryType, ticket.issue].filter(Boolean).join(' · '))}</p><small class="muted">Asunto</small><h2>${escapeHtml(ticket.title)}</h2></div>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button>
        </div>
        <p class="detail-description">${escapeHtml(ticket.description || 'Sin descripción')}</p>
        <div class="detail-grid">
          <div><small>Solicitante</small><strong>${escapeHtml(ticket.createdByName)}</strong></div>
          <div><small>Estado</small>${options.isStaff ? `<select data-ticket-field="status" data-id="${escapeHtml(ticket.id)}">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${ticket.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select>` : `<span class="badge status-${ticket.status}">${STATUS_LABELS[ticket.status]}</span>`}</div>
          <div><small>Prioridad</small>${options.isStaff ? `<select data-ticket-field="priority" data-id="${escapeHtml(ticket.id)}">${Object.entries(PRIORITY_LABELS).map(([key, label]) => `<option value="${key}" ${ticket.priority === key ? 'selected' : ''}>${label}</option>`).join('')}</select>` : `<span class="badge priority-${ticket.priority}">${PRIORITY_LABELS[ticket.priority]}</span>`}</div>
          <div><small>Asignado a</small>${options.isStaff ? `<select data-ticket-field="assignedTo" data-id="${escapeHtml(ticket.id)}"><option value="">Sin asignar</option>${options.users.filter((user) => user.active && user.role !== 'user').map((user) => `<option value="${escapeHtml(user.uid)}" ${ticket.assignedTo === user.uid ? 'selected' : ''}>${escapeHtml(user.name)}</option>`).join('')}</select>` : `<strong>${escapeHtml(assignee?.name ?? 'Sin asignar')}</strong>`}</div>
          <div><small>Fecha límite</small><strong class="${options.isLate(ticket) ? 'late' : ''}">${escapeHtml(ticket.dueDate || '—')}</strong></div>
          <div><small>Creado</small><strong>${options.formatDate(ticket.createdAt)}</strong></div>
        </div>
      </section>
      <aside class="ticket-chat-panel" aria-label="Conversación del ticket">
        <header class="ticket-chat-header"><div><h3>Conversación</h3><span>${comments.length} ${comments.length === 1 ? 'mensaje' : 'mensajes'}</span></div></header>
        <div class="ticket-chat-messages" role="log" aria-live="polite">
          ${comments.length ? comments.map((comment) => `
            <article class="ticket-chat-message ${comment.authorId === options.currentUserId ? 'message-own' : 'message-other'}">
              <div class="chat-message-meta"><strong>${escapeHtml(comment.authorName)}</strong><time>${options.formatDate(comment.createdAt)}</time></div>
              <p>${escapeHtml(comment.text)}</p>
            </article>`).join('') : '<p class="ticket-chat-empty">Aún no hay mensajes. Inicia la conversación.</p>'}
        </div>
        <form id="comment-form" class="ticket-chat-composer" data-id="${escapeHtml(ticket.id)}">
          <textarea name="comment" rows="2" maxlength="4000" required aria-label="Mensaje" placeholder="Escribe un mensaje…"></textarea>
          <button class="button primary" type="submit" aria-label="Enviar mensaje">Enviar</button>
        </form>
      </aside>
    </div>`;
}
