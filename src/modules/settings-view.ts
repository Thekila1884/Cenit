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

export function renderTicketSettings(
  categories: TicketCategoryOption[],
  error = '',
  expandedCategoryIndex = -1,
) {
  return `
    <section class="settings-panel">
      <div class="settings-intro"><div><h2>Clasificación de tickets</h2><p class="muted">Organiza las opciones del formulario. Abre una categoría para editar sus tipos y fallas.</p></div><span class="settings-count">${categories.length} categorías</span></div>
      ${error ? `<div class="notice error" role="alert">${escapeHtml(error)}</div>` : ''}
      <form id="ticket-settings-form" class="settings-form">
        <div class="ticket-category-editor">
          ${categories.map((category, categoryIndex) => `
            <details class="ticket-category-card" data-category-index="${categoryIndex}" ${expandedCategoryIndex === categoryIndex ? 'open' : ''}>
              <summary class="ticket-category-summary" data-ticket-category-summary>
                <span><strong data-ticket-category-title>${escapeHtml(category.name || 'Nueva categoría')}</strong><small>${category.types.length} ${category.types.length === 1 ? 'tipo' : 'tipos'}</small></span>
                <span class="category-toggle" aria-hidden="true"></span>
              </summary>
              <div class="ticket-category-body">
                <div class="ticket-category-heading">
                  <label>Categoría<input name="category-${categoryIndex}-name" data-ticket-category-name="${categoryIndex}" maxlength="80" required value="${escapeHtml(category.name)}" placeholder="Ej. Periféricos"></label>
                  <button class="button secondary compact-button" type="button" data-action="remove-ticket-category" data-category-index="${categoryIndex}">Quitar categoría</button>
                </div>
                <div class="ticket-type-list">${category.types.map((type, typeIndex) => renderType(categoryIndex, typeIndex, type)).join('')}</div>
                <button class="button secondary compact-button" type="button" data-action="add-ticket-type" data-category-index="${categoryIndex}">＋ Agregar tipo</button>
              </div>
            </details>`).join('')}
        </div>
        <div class="settings-actions">
          <button class="button secondary" type="button" data-action="add-ticket-category">＋ Agregar categoría</button>
          <button class="button primary" type="submit">Guardar configuración</button>
        </div>
      </form>
    </section>`;
}
