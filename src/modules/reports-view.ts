import { escapeHtml } from './escape-html';
import type { ErrorReport } from '../types';

export function renderErrorReportDialog(email: string, route: string, companyId: string, companyIdReadOnly = false) {
  return `
    <form id="error-report-form" class="dialog-content">
      <div class="dialog-heading"><div><p class="eyebrow">AYÚDANOS A MEJORAR</p><h2>Reportar un error</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div>
      <p class="muted">El reporte se guardará en Cenit y se enviará a soporte@vendedores.site. No incluyas contraseñas ni información sensible.</p>
      <label>ID de empresa<input name="companyId" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" value="${escapeHtml(companyId)}" ${companyIdReadOnly ? 'readonly' : ''} required></label>
      <label>Correo de contacto (opcional)<input name="email" type="email" maxlength="254" value="${escapeHtml(email)}" autocomplete="email"></label>
      <label>¿Qué ocurrió?<textarea name="description" rows="6" maxlength="2000" required placeholder="Describe qué estabas haciendo y qué error apareció."></textarea></label>
      <label class="honeypot-field" aria-hidden="true">Sitio web<input name="website" tabindex="-1" autocomplete="off"></label>
      <input type="hidden" name="route" value="${escapeHtml(route)}">
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Enviar reporte</button></div>
    </form>`;
}

export function renderReports(reports: ErrorReport[], formatDate: (report: ErrorReport) => string) {
  if (!reports.length) {
    return '<div class="empty-state"><h2>Sin reportes todavía</h2><p>Los nuevos reportes aparecerán aquí.</p></div>';
  }

  return `<div class="reports-list">${reports.map((report) => {
    const emailLabel = report.emailStatus === 'sent' ? 'Correo enviado'
      : report.emailStatus === 'failed' ? 'Correo no enviado'
        : 'Enviando correo';
    const emailClass = report.emailStatus === 'sent' ? 'status-resuelto'
      : report.emailStatus === 'failed' ? 'priority-critica'
        : 'priority-media';
    const reviewLabel = report.reviewStatus === 'reviewed' ? 'Revisado' : 'Pendiente';
    const reviewClass = report.reviewStatus === 'reviewed' ? 'status-resuelto' : 'status-abierto';
    const nextReviewStatus = report.reviewStatus === 'reviewed' ? 'pending' : 'reviewed';
    const actionLabel = report.reviewStatus === 'reviewed' ? 'Reabrir' : 'Marcar revisado';
    return `
      <article class="report-card">
        <div class="report-heading">
          <div><strong>${escapeHtml(report.reporterEmail || 'Reporte anónimo')}</strong><time>${escapeHtml(formatDate(report))}</time></div>
          <div class="report-badges"><span class="badge ${emailClass}">${emailLabel}</span><span class="badge ${reviewClass}">${reviewLabel}</span></div>
        </div>
        <p class="report-description">${escapeHtml(report.description)}</p>
        <div class="report-footer"><small>Pantalla: ${escapeHtml(report.route || 'No especificada')}</small><button class="button secondary" type="button" data-action="update-report-status" data-id="${escapeHtml(report.id)}" data-status="${nextReviewStatus}">${actionLabel}</button></div>
      </article>`;
  }).join('')}</div>`;
}
