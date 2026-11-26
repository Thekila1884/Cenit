import { escapeHtml } from './escape-html';

export const SALES_PLANS = {
  basico: 'Básico',
  profesional: 'Profesional',
  empresarial: 'Empresarial',
} as const;

export type SalesPlanId = keyof typeof SALES_PLANS;

export function isSalesPlanId(value: string): value is SalesPlanId {
  return Object.hasOwn(SALES_PLANS, value);
}

export function renderSalesContactDialog(plan: SalesPlanId) {
  return `
    <form id="sales-contact-form" class="dialog-content">
      <div class="dialog-heading"><div><p class="eyebrow">CONTACTO COMERCIAL</p><h2>Habla con ventas</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <p class="muted">Plan seleccionado: <strong>${SALES_PLANS[plan]}</strong>. Tu solicitud se enviará a soporte@vendedores.site; no se realizará ningún cobro con este formulario.</p>
      <div class="form-grid">
        <label>Nombre completo<input name="name" maxlength="120" autocomplete="name" required></label>
        <label>Empresa<input name="company" maxlength="120" autocomplete="organization"></label>
        <label>Correo electrónico<input name="email" type="email" maxlength="254" autocomplete="email" required></label>
        <label>Teléfono (opcional)<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
        <label>Mensaje (opcional)<textarea name="message" rows="4" maxlength="2000" placeholder="Cuéntanos qué necesita tu equipo."></textarea></label>
      </div>
      <label class="honeypot-field" aria-hidden="true">Sitio web<input name="website" tabindex="-1" autocomplete="off"></label>
      <input type="hidden" name="plan" value="${escapeHtml(plan)}">
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Enviar solicitud</button></div>
    </form>`;
}
