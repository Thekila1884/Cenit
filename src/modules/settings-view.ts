import { escapeHtml } from './escape-html';
import type { TicketCategoryOption } from '../types';

function renderType(categoryIndex: number, typeIndex: number, type: TicketCategoryOption['types'][number]) {
  return `
    <article class="ticket-type-editor">
      <label>Tipo<input name="category-${categoryIndex}-type-${typeIndex}-name" data-ticket-type-name="${categoryIndex}:${typeIndex}" maxlength="80" required value="${escapeHtml(type.name)}" placeholder="Ej. Mouse"></label>
      <label>Fallas disponibles<textarea name="category-${categoryIndex}-type-${typeIndex}-issues" data-ticket-issues="${categoryIndex}:${typeIndex}" rows="3" required placeholder="Una opción por línea">${escapeHtml(type.issues.join('\n'))}</textarea></label>
      <button class="button secondary compact-button" type="button" data-action="remove-ticket-type" data-category-index="${categoryIndex}" data-type-index="${typeIndex}">Quitar tipo</button>
    </article>`;
}

export function renderTicketSettings(categories: TicketCategoryOption[], error = '') {
  return `
    <section class="settings-panel">
      <div class="settings-intro"><div><h2>Clasificación de tickets</h2><p class="muted">Define las categorías, sus tipos y las fallas que podrán seleccionar al crear una solicitud.</p></div></div>
      ${error ? `<div class="notice error" role="alert">${escapeHtml(error)}</div>` : ''}
      <form id="ticket-settings-form" class="settings-form">
        <div class="ticket-category-editor">
          ${categories.map((category, categoryIndex) => `
            <section class="ticket-category-card">
              <div class="ticket-category-heading">
                <label>Categoría<input name="category-${categoryIndex}-name" data-ticket-category-name="${categoryIndex}" maxlength="80" required value="${escapeHtml(category.name)}" placeholder="Ej. Periféricos"></label>
                <button class="button secondary compact-button" type="button" data-action="remove-ticket-category" data-category-index="${categoryIndex}">Quitar categoría</button>
              </div>
              <div class="ticket-type-list">${category.types.map((type, typeIndex) => renderType(categoryIndex, typeIndex, type)).join('')}</div>
              <button class="button secondary compact-button" type="button" data-action="add-ticket-type" data-category-index="${categoryIndex}">＋ Agregar tipo</button>
            </section>`).join('')}
        </div>
        <div class="settings-actions">
          <button class="button secondary" type="button" data-action="add-ticket-category">＋ Agregar categoría</button>
          <button class="button primary" type="submit">Guardar configuración</button>
        </div>
      </form>
    </section>`;
}
