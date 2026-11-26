import './styles.css';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, configurationError, db } from './firebase';
import { renderLoginView } from './modules/auth-view';
import { escapeHtml } from './modules/escape-html';
import { renderHomeView } from './modules/home-view';
import { renderErrorReportDialog, renderReports } from './modules/reports-view';
import { routeFromHash, routeHref, type AuthenticatedRoute } from './modules/router';
import { isSalesPlanId, renderSalesContactDialog, type SalesPlanId } from './modules/sales-view';
import { renderTicketSettings } from './modules/settings-view';
import { renderNewTicketDialog, renderTicketDetailDialog, renderTicketRows } from './modules/ticket-view';
import {
  parseTicketCategoryMap,
  ticketCategoriesFromForm,
  ticketCategoriesToMap,
} from './modules/ticket-settings';
import {
  renderInviteConfirmation as renderInviteConfirmationView,
  renderInviteDialog,
  renderUsersTable,
} from './modules/users-view';
import {
  DEFAULT_TICKET_CATEGORIES,
  STATUS_LABELS,
  type Priority,
  type Role,
  type ErrorReport,
  type Ticket,
  type TicketCategoryOption,
  type TicketComment,
  type TicketStatus,
  type UserProfile,
} from './types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No se encontró el contenedor principal.');

function defaultTicketCategoryOptions(): TicketCategoryOption[] {
  return DEFAULT_TICKET_CATEGORIES.map((category) => ({
    ...category,
    types: category.types.map((type) => ({ ...type, issues: [...type.issues] })),
  }));
}

let currentUser: User | null = null;
let profile: UserProfile | null = null;
let tickets: Ticket[] = [];
let users: UserProfile[] = [];
let reports: ErrorReport[] = [];
let reportsLoadError = '';
let activeView: AuthenticatedRoute = 'mine';
let companyName = '';
let ticketCategories = defaultTicketCategoryOptions();
let ticketSettingsError = '';
let expandedTicketCategoryIndex = -1;
let loginCompanyId = '';
let pendingLoginMessage = '';
let search = '';
let statusFilter: TicketStatus | '' = '';
let toastTimer = 0;

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const isStaff = () => profile?.role === 'admin' || profile?.role === 'agent';
const isAdmin = () => profile?.role === 'admin';
const isLate = (ticket: Ticket) => ticket.status !== 'resuelto' && ticket.dueDate < today();
const showToast = (message: string) => {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
};

function errorText(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/user-disabled': 'Esta cuenta está desactivada. Contacta al administrador.',
    'auth/network-request-failed': 'No se pudo conectar. Revisa tu conexión.',
    'functions/failed-precondition': 'La invitación no pudo completarse. Verifica la configuración de Firebase.',
    'functions/permission-denied': 'No tienes permiso para realizar esta acción.',
    'functions/unauthenticated': 'Tu sesión venció. Inicia sesión nuevamente.',
    'functions/resource-exhausted': 'Espera un minuto antes de enviar otra solicitud.',
    'functions/unavailable': 'No se pudo enviar la solicitud ahora. Inténtalo más tarde.',
    'functions/already-exists': 'Ya existe una cuenta con ese correo.',
    'functions/invalid-argument': 'Verifica los datos ingresados.',
  };
  return messages[code] ?? (error instanceof Error ? error.message : 'Ocurrió un error inesperado.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postVercelApi(
  path: string,
  payload: Record<string, string>,
  idToken?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('El servicio de correo respondió en un formato inesperado.');
  }

  if (!response.ok) {
    const message = isRecord(result) && typeof result.error === 'string'
      ? result.error
      : 'No se pudo completar la solicitud.';
    if (path === '/api/invite-user') {
      const code = isRecord(result) && typeof result.code === 'string' ? result.code : 'unavailable';
      const detailCode = isRecord(result) && typeof result.detailCode === 'string'
        ? result.detailCode
        : 'unavailable';
      console.error('Cenit invite-user request failed', { status: response.status, code, detailCode });
      throw new Error(`${message} (etapa: ${code}; detalle: ${detailCode})`);
    }
    throw new Error(message);
  }
  if (!isRecord(result)) {
    throw new Error('El servicio respondió en un formato inesperado.');
  }
  return result;
}

async function sendVercelEmail(path: string, payload: Record<string, string>) {
  const result = await postVercelApi(path, payload);
  if (result.sent !== true) {
    throw new Error('El servicio de correo no confirmó el envío.');
  }
}

function setBusy(value: boolean) {
  root!.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((button) => {
    button.disabled = value;
  });
}

async function loadProfile(user: User): Promise<UserProfile> {
  const [token, snapshot] = await Promise.all([user.getIdTokenResult(true), getDoc(doc(db, 'users', user.uid))]);
  if (!snapshot.exists()) throw new Error('Tu cuenta aún no tiene un perfil autorizado. Contacta al administrador.');
  const data = snapshot.data() as UserProfile;
  const claimRole = token.claims.role;
  const claimCompanyId = token.claims.companyId;
  if (!data.active || token.claims.active !== true || data.uid !== user.uid
    || data.role !== claimRole || data.companyId !== claimCompanyId) {
    throw new Error('La cuenta no está activa o sus permisos requieren revisión. Contacta al administrador.');
  }
  if (!['admin', 'agent', 'user'].includes(data.role)) throw new Error('El perfil tiene un rol no válido.');
  if (!/^\d{10}$/.test(data.companyId)) throw new Error('El perfil no tiene un ID de empresa válido. Contacta al administrador.');
  return data;
}

async function loadCompany() {
  if (!profile) return;
  const snapshot = await getDoc(doc(db, 'companies', profile.companyId));
  if (!snapshot.exists() || snapshot.get('companyId') !== profile.companyId || snapshot.get('active') !== true) {
    throw new Error('La empresa asociada no está configurada. Contacta al administrador.');
  }
  const name = snapshot.get('name');
  if (typeof name !== 'string' || !name.trim()) throw new Error('El perfil de empresa no es válido.');
  companyName = name;
}

async function loadTicketSettings() {
  if (!profile) return;
  try {
    const snapshot = await getDoc(doc(db, 'companySettings', profile.companyId));
    ticketCategories = snapshot.exists()
      ? parseTicketCategoryMap(snapshot.get('ticketCategories'))
      : defaultTicketCategoryOptions();
    ticketSettingsError = '';
  } catch (error) {
    ticketSettingsError = errorText(error);
    ticketCategories = [];
  }
}

async function loadTickets() {
  if (!currentUser || !profile) return;
  const source = collection(db, 'tickets');
  const tenantQuery = isStaff()
    ? query(source, where('companyId', '==', profile.companyId))
    : query(source, where('companyId', '==', profile.companyId), where('createdBy', '==', currentUser.uid));
  const result = await getDocs(tenantQuery);
  tickets = result.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Ticket);
  tickets.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

async function loadUsers() {
  if (!isStaff() || !profile) return;
  const result = await getDocs(query(collection(db, 'users'), where('companyId', '==', profile.companyId)));
  users = result.docs.map((snapshot) => snapshot.data() as UserProfile);
}

async function loadReports() {
  if (!isAdmin() || !profile) return;
  const result = await getDocs(query(
    collection(db, 'errorReports'),
    where('companyId', '==', profile.companyId),
    orderBy('createdAt', 'desc'),
  ));
  reports = result.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as ErrorReport);
}

function renderLogin(message = '') {
  root!.innerHTML = renderLoginView(configurationError, message);
}

function renderPublicRoute() {
  const hash = window.location.hash;
  const sectionId = ['#como-funciona', '#planes', '#empresa'].includes(hash) ? hash.slice(1) : '';
  if (sectionId) {
    if (!root!.querySelector('.landing')) {
      root!.innerHTML = renderHomeView();
      requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView());
    }
    return;
  }

  if (routeFromHash(hash) === 'login') renderLogin();
  else root!.innerHTML = renderHomeView();
}

function roleName(role: Role) {
  return ({ admin: 'Administrador', agent: 'Agente', user: 'Solicitante' })[role];
}

function visibleTickets() {
  const scopedTickets = activeView === 'mine'
    ? tickets.filter((ticket) => ticket.createdBy === currentUser?.uid || ticket.assignedTo === currentUser?.uid)
    : tickets;
  return scopedTickets.filter((ticket) => {
    const matchesSearch = !search || [
      ticket.title,
      ticket.id,
      ticket.description,
      ticket.category,
      ticket.categoryType ?? '',
      ticket.issue ?? '',
      ticket.createdByName,
    ]
      .some((value) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return matchesSearch && (!statusFilter || ticket.status === statusFilter);
  });
}

function renderApp() {
  const signedInUser = currentUser;
  if (!profile || !signedInUser) return;
  if (activeView === 'users' && !isAdmin()) activeView = 'mine';
  if (activeView === 'tickets' && !isStaff()) activeView = 'mine';
  if (activeView === 'settings' && !isAdmin()) activeView = 'mine';

  const openCount = tickets.filter((ticket) => ticket.status !== 'resuelto').length;
  const myOpenCount = tickets.filter((ticket) => ticket.status !== 'resuelto'
    && (ticket.createdBy === signedInUser.uid || ticket.assignedTo === signedInUser.uid)).length;
  const viewTitle = activeView === 'settings'
    ? 'Configuración'
    : activeView === 'users'
      ? 'Usuarios'
      : activeView === 'tickets'
        ? 'Tickets del equipo'
        : 'Mis tickets';
  const pageTitle = activeView === 'reports' ? 'Reportes de error' : viewTitle;
  const pageDescription = activeView === 'reports'
    ? 'Revisa los errores reportados por el equipo.'
    : activeView === 'settings'
      ? 'Administra la clasificación que se usa al crear tickets en tu empresa.'
    : activeView === 'users'
      ? 'Invita personas y revisa sus roles dentro de tu empresa.'
      : activeView === 'tickets'
        ? 'Solicitudes de toda la organización.'
        : 'Tus solicitudes y su avance.';

  root!.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">C</span><span>Cenit</span></div>
        <p class="side-label">ESPACIO DE TRABAJO</p>
        <nav class="navigation" aria-label="Navegación principal">
          <a class="nav-item ${activeView === 'mine' ? 'selected' : ''}" href="${routeHref('mine')}"><span>▤</span>Mis tickets<span class="nav-count">${myOpenCount}</span></a>
          ${isStaff() ? `<a class="nav-item ${activeView === 'tickets' ? 'selected' : ''}" href="${routeHref('tickets')}"><span>▣</span>Todos los tickets${openCount ? `<span class="nav-count">${openCount}</span>` : ''}</a>` : ''}
          ${isAdmin() ? `<a class="nav-item ${activeView === 'users' ? 'selected' : ''}" href="${routeHref('users')}"><span>♙</span>Usuarios</a>` : ''}
          ${isAdmin() ? `<a class="nav-item ${activeView === 'reports' ? 'selected' : ''}" href="${routeHref('reports')}"><span>⚑</span>Reportes</a>` : ''}
          ${isAdmin() ? `<a class="nav-item ${activeView === 'settings' ? 'selected' : ''}" href="${routeHref('settings')}"><span>⚙</span>Configuración</a>` : ''}
        </nav>
        <div class="sidebar-bottom">
          <div class="user-summary"><span class="avatar">${escapeHtml(profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase())}</span><span class="user-meta"><strong>${escapeHtml(profile.name)}</strong><small>${roleName(profile.role)}</small></span></div>
          <button class="nav-item signout" data-action="signout"><span>↪</span>Cerrar sesión</button>
        </div>
      </aside>
      <main class="workspace">
        <header class="topbar"><span class="breadcrumbs">Cenit <span>/</span> ${pageTitle}</span><div class="topbar-actions"><button class="button secondary" type="button" data-action="report-error">Reportar error</button><span class="online"><i></i> Conectado</span></div></header>
        <section class="page-content">
          <div class="page-heading"><div><p class="eyebrow">GESTIÓN DE SOPORTE</p><h1>${pageTitle}</h1><p class="muted">${pageDescription}</p></div>
            ${activeView === 'users' ? '<button class="button primary" data-action="invite"><span>＋</span> Invitar usuario</button>' : activeView === 'reports' || activeView === 'settings' ? '' : '<button class="button primary" data-action="new-ticket"><span>＋</span> Nueva solicitud</button>'}
          </div>
          ${activeView === 'users' ? `<p class="notice">Empresa: <strong>${escapeHtml(companyName)}</strong> · Código ${escapeHtml(profile.companyId)}</p>` : ''}
          ${ticketSettingsError && activeView !== 'settings' ? `<div class="notice error" role="alert">No se pudo cargar la configuración de tickets: ${escapeHtml(ticketSettingsError)}</div>` : ''}
          ${activeView === 'settings' ? renderTicketSettings(ticketCategories, ticketSettingsError, expandedTicketCategoryIndex)
            : activeView === 'users' ? renderUsersTable(users, roleName) : activeView === 'reports'
            ? reportsLoadError
              ? `<div class="notice error" role="alert">${escapeHtml(reportsLoadError)}</div>`
              : renderReports(reports, (report) => report.createdAt?.toDate().toLocaleString('es', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }) ?? 'Recibido recientemente')
            : `
            <div class="toolbar">
              <label class="search"><span>⌕</span><input id="search" type="search" placeholder="Buscar solicitudes..." value="${escapeHtml(search)}"></label>
              <select id="status-filter" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${statusFilter === key ? 'selected' : ''}>${label}</option>`).join('')}</select>
              <span class="result-count">${visibleTickets().length} solicitudes</span>
            </div>
            ${renderTicketRows(visibleTickets(), isLate)}`}
        </section>
      </main>
    </div>
    <dialog id="modal" class="modal"></dialog>
    <div id="toast" role="status" aria-live="polite"></div>`;
}

async function renderCurrentRoute() {
  if (!profile || !currentUser) return;

  const requestedRoute = routeFromHash(window.location.hash);
  let nextRoute: AuthenticatedRoute = requestedRoute === 'home' || requestedRoute === 'login'
    ? 'mine'
    : requestedRoute;
  if (((nextRoute === 'users' || nextRoute === 'reports' || nextRoute === 'settings') && !isAdmin())
    || (nextRoute === 'tickets' && !isStaff())) {
    nextRoute = 'mine';
  }
  activeView = nextRoute;
  reportsLoadError = '';
  if (activeView === 'reports') {
    try {
      await loadReports();
    } catch (error) {
      reportsLoadError = errorText(error);
    }
  }
  renderApp();
  if (reportsLoadError) showToast(`No se pudieron cargar los reportes. ${reportsLoadError}`);

  const expectedHash = routeHref(nextRoute);
  if (window.location.hash !== expectedHash) window.location.hash = expectedHash;
}

async function renderNewTicket() {
  await loadTicketSettings();
  if (ticketSettingsError || !ticketCategories.length) {
    showToast('No se pudo cargar la configuración de categorías. Contacta al administrador.');
    return;
  }
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = renderNewTicketDialog(today(), ticketCategories);
  dialog.showModal();
}

async function renderTicketDetail(id: string) {
  const ticket = tickets.find((item) => item.id === id);
  if (!ticket) return;
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.classList.add('ticket-detail-modal');
  dialog.onclose = () => dialog.classList.remove('ticket-detail-modal');
  dialog.innerHTML = '<div class="ticket-detail-loading">Cargando conversación…</div>';
  if (!dialog.open) dialog.showModal();
  const commentsSnapshot = await getDocs(query(collection(db, 'tickets', id, 'comments'), orderBy('createdAt', 'asc')));
  const comments = commentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TicketComment);
  dialog.innerHTML = renderTicketDetailDialog(ticket, comments, {
    isStaff: isStaff(),
    users,
    currentUserId: currentUser?.uid ?? '',
    isLate,
    formatDate: (timestamp) => timestamp?.toDate().toLocaleString('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }) ?? 'Ahora',
  });
  const messages = dialog.querySelector<HTMLElement>('.ticket-chat-messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function renderInvite() {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = renderInviteDialog(companyName, profile?.companyId ?? '');
  if (!dialog.open) dialog.showModal();
}

function renderErrorReport() {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal');
  if (!dialog) return;
  const email = currentUser?.email
    ?? root!.querySelector<HTMLInputElement>('#login-form [name="email"]')?.value.trim()
    ?? '';
  const companyId = profile?.companyId
    ?? root!.querySelector<HTMLInputElement>('#login-form [name="companyId"]')?.value.trim()
    ?? '';
  dialog.innerHTML = renderErrorReportDialog(email, window.location.hash.slice(0, 120), companyId, Boolean(profile));
  dialog.showModal();
}

function renderSalesContact(plan: SalesPlanId) {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal');
  if (!dialog) return;
  dialog.innerHTML = renderSalesContactDialog(plan);
  dialog.showModal();
}

function updateTicketTypeOptions(categorySelect: HTMLSelectElement) {
  const form = categorySelect.form;
  const typeSelect = form?.querySelector<HTMLSelectElement>('[data-ticket-type]');
  const issueSelect = form?.querySelector<HTMLSelectElement>('[data-ticket-issue]');
  if (!form || !typeSelect || !issueSelect) return;
  const category = ticketCategories.find((item) => item.name === categorySelect.value);
  const types = category?.types ?? [];
  typeSelect.innerHTML = types.map((type) => `<option value="${escapeHtml(type.name)}">${escapeHtml(type.name)}</option>`).join('');
  updateTicketIssueOptions(typeSelect);
}

function updateTicketIssueOptions(typeSelect: HTMLSelectElement) {
  const form = typeSelect.form;
  const categorySelect = form?.querySelector<HTMLSelectElement>('[data-ticket-category]');
  const issueSelect = form?.querySelector<HTMLSelectElement>('[data-ticket-issue]');
  if (!form || !categorySelect || !issueSelect) return;
  const category = ticketCategories.find((item) => item.name === categorySelect.value);
  const type = category?.types.find((item) => item.name === typeSelect.value);
  issueSelect.innerHTML = (type?.issues ?? []).map((issue) => `<option value="${escapeHtml(issue)}">${escapeHtml(issue)}</option>`).join('');
}

function renderInviteConfirmation(email: string) {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = renderInviteConfirmationView(email);
}

async function handleLogin(form: HTMLFormElement) {
  const data = new FormData(form);
  const companyId = String(data.get('companyId') ?? '').trim();
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  if (!/^\d{10}$/.test(companyId)) {
    renderLogin('Ingresa el ID de empresa de 10 dígitos.');
    return;
  }
  loginCompanyId = companyId;
  setBusy(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    loginCompanyId = '';
    renderLogin(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleErrorReport(form: HTMLFormElement) {
  const data = new FormData(form);
  const description = String(data.get('description') ?? '').trim();
  if (!description) return;
  if (String(data.get('website') ?? '').trim()) return showToast('No se pudo procesar el reporte.');
  setBusy(true);
  try {
    const idToken = currentUser ? await currentUser.getIdToken() : undefined;
    const result = await postVercelApi('/api/send-error-report', {
      companyId: String(data.get('companyId') ?? '').trim(),
      description,
      email: String(data.get('email') ?? '').trim(),
      route: String(data.get('route') ?? ''),
      website: String(data.get('website') ?? ''),
    }, idToken);
    if (result.saved !== true || typeof result.sent !== 'boolean') {
      throw new Error('El servicio no confirmó que el reporte quedó guardado.');
    }

    let message = result.sent
      ? 'Reporte enviado y guardado en la bandeja de Cenit.'
      : typeof result.message === 'string'
        ? result.message
        : 'Reporte guardado en Cenit, pero no se pudo enviar el correo.';
    root!.querySelector<HTMLDialogElement>('#modal')?.close();
    if (activeView === 'reports') {
      try {
        await loadReports();
      } catch (error) {
        reportsLoadError = errorText(error);
        message += ' No se pudo actualizar la bandeja.';
      }
      renderApp();
    }
    showToast(message);
  } catch (error) {
    showToast(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleSalesContact(form: HTMLFormElement) {
  const data = new FormData(form);
  const plan = String(data.get('plan') ?? '');
  if (!isSalesPlanId(plan)) return showToast('Selecciona uno de los planes disponibles.');
  if (String(data.get('website') ?? '').trim()) return showToast('No se pudo procesar la solicitud.');
  setBusy(true);
  try {
    await sendVercelEmail('/api/contact-sales', {
      name: String(data.get('name') ?? '').trim(),
      company: String(data.get('company') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      plan,
      website: String(data.get('website') ?? ''),
    });
    root!.querySelector<HTMLDialogElement>('#modal')?.close();
    showToast('Solicitud enviada a ventas. Nos pondremos en contacto contigo.');
  } catch (error) {
    showToast(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleTicketCreate(form: HTMLFormElement) {
  if (!currentUser || !profile || ticketSettingsError) return;
  const data = new FormData(form);
  const title = String(data.get('title') ?? '').trim();
  if (!title) return;
  const category = String(data.get('category') ?? '');
  const categoryType = String(data.get('categoryType') ?? '');
  const issue = String(data.get('issue') ?? '');
  const configuredType = ticketCategories.find((item) => item.name === category)
    ?.types.find((item) => item.name === categoryType);
  if (!configuredType?.issues.includes(issue)) {
    showToast('Selecciona una categoría, tipo y falla válidos.');
    return;
  }
  setBusy(true);
  try {
    await addDoc(collection(db, 'tickets'), {
      companyId: profile.companyId,
      title,
      description: String(data.get('description') ?? '').trim(),
      category,
      categoryType,
      issue,
      priority: String(data.get('priority') ?? 'media') as Priority,
      status: 'abierto',
      createdBy: currentUser.uid,
      createdByName: profile.name,
      assignedTo: null,
      createdAt: serverTimestamp(),
      dueDate: String(data.get('dueDate') ?? today()),
      updatedAt: serverTimestamp(),
      closedAt: null,
    });
    root!.querySelector<HTMLDialogElement>('#modal')?.close();
    await loadTickets();
    renderApp();
    showToast('Solicitud creada.');
  } catch (error) {
    showToast(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleTicketSettingsSave(form: HTMLFormElement) {
  if (!profile || !isAdmin()) return;
  let categories: TicketCategoryOption[];
  try {
    categories = ticketCategoriesFromForm(form, ticketCategories);
  } catch (error) {
    showToast(errorText(error));
    return;
  }
  setBusy(true);
  try {
    await setDoc(doc(db, 'companySettings', profile.companyId), {
      companyId: profile.companyId,
      ticketCategories: ticketCategoriesToMap(categories),
      updatedAt: serverTimestamp(),
    });
    ticketCategories = categories;
    ticketSettingsError = '';
    renderApp();
    showToast('Configuración de tickets guardada.');
  } catch (error) {
    showToast(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleInvite(form: HTMLFormElement) {
  const data = new FormData(form);
  if (!currentUser) return;
  setBusy(true);
  try {
    const idToken = await currentUser.getIdToken();
    const result = await postVercelApi('/api/invite-user', {
      email: String(data.get('email') ?? '').trim(),
      name: String(data.get('name') ?? '').trim(),
      department: String(data.get('department') ?? '').trim(),
      role: String(data.get('role') ?? 'user') as Role,
    }, idToken);
    if (typeof result.email !== 'string' || result.sent !== true) {
      throw new Error('El servicio no confirmó el envío de la invitación.');
    }
    renderInviteConfirmation(result.email);
    await loadUsers();
  } catch (error) {
    showToast(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleComment(form: HTMLFormElement) {
  if (!currentUser || !profile) return;
  const data = new FormData(form);
  const text = String(data.get('comment') ?? '').trim();
  const id = form.dataset.id;
  if (!text || !id) return;
  setBusy(true);
  try {
    await addDoc(collection(db, 'tickets', id, 'comments'), {
      authorId: currentUser.uid,
      authorName: profile.name,
      text,
      createdAt: serverTimestamp(),
    });
    await renderTicketDetail(id);
  } catch (error) {
    showToast(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function updateTicketField(select: HTMLSelectElement) {
  const ticket = tickets.find((item) => item.id === select.dataset.id);
  const field = select.dataset.ticketField;
  if (!ticket || !field || !isStaff()) return;
  const value = select.value;
  const update: {
    updatedAt: ReturnType<typeof serverTimestamp>;
    status?: TicketStatus;
    priority?: Priority;
    assignedTo?: string | null;
    closedAt?: ReturnType<typeof serverTimestamp> | null;
  } = { updatedAt: serverTimestamp() };
  if (field === 'status') {
    update.status = value as TicketStatus;
    update.closedAt = value === 'resuelto' ? serverTimestamp() : null;
  } else if (field === 'priority') {
    update.priority = value as Priority;
  } else if (field === 'assignedTo') {
    update.assignedTo = value || null;
  } else return;

  try {
    await updateDoc(doc(db, 'tickets', ticket.id), update);
    await loadTickets();
    renderApp();
    await renderTicketDetail(ticket.id);
    showToast('Ticket actualizado.');
  } catch (error) {
    showToast(errorText(error));
    await renderTicketDetail(ticket.id);
  }
}

async function updateReportStatus(button: HTMLButtonElement) {
  const id = button.dataset.id;
  const status = button.dataset.status;
  if (!id || !isAdmin() || (status !== 'pending' && status !== 'reviewed')) return;
  try {
    await updateDoc(doc(db, 'errorReports', id), { reviewStatus: status });
    reports = reports.map((report) => report.id === id ? { ...report, reviewStatus: status } : report);
    renderApp();
    showToast(status === 'reviewed' ? 'Reporte marcado como revisado.' : 'Reporte reabierto.');
  } catch (error) {
    showToast(errorText(error));
  }
}

root.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === 'login-form') void handleLogin(form);
  if (form.id === 'error-report-form') void handleErrorReport(form);
  if (form.id === 'sales-contact-form') void handleSalesContact(form);
  if (form.id === 'ticket-form') void handleTicketCreate(form);
  if (form.id === 'ticket-settings-form') void handleTicketSettingsSave(form);
  if (form.id === 'invite-form') void handleInvite(form);
  if (form.id === 'comment-form') void handleComment(form);
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === 'search') {
    search = target.value;
    const list = root!.querySelector('.ticket-list, .empty-state');
    if (list) list.outerHTML = renderTicketRows(visibleTickets(), isLate);
    const count = root!.querySelector('.result-count');
    if (count) count.textContent = `${visibleTickets().length} solicitudes`;
  }
  if (target instanceof HTMLInputElement && target.dataset.ticketCategoryName !== undefined) {
    const categoryIndex = Number(target.dataset.ticketCategoryName);
    const category = ticketCategories[categoryIndex];
    if (category) {
      category.name = target.value;
      const summaryName = target.closest('details')?.querySelector<HTMLElement>('[data-ticket-category-title]');
      if (summaryName) summaryName.textContent = target.value.trim() || 'Nueva categoría';
    }
  }
  if (target instanceof HTMLInputElement && target.dataset.ticketTypeName) {
    const [categoryIndex, typeIndex] = target.dataset.ticketTypeName.split(':').map(Number);
    const type = ticketCategories[categoryIndex]?.types[typeIndex];
    if (type) type.name = target.value;
  }
  if (target instanceof HTMLTextAreaElement && target.dataset.ticketIssues) {
    const [categoryIndex, typeIndex] = target.dataset.ticketIssues.split(':').map(Number);
    const type = ticketCategories[categoryIndex]?.types[typeIndex];
    if (type) {
      type.issues = target.value.split(/\r?\n/).map((issue) => issue.trim()).filter(Boolean);
    }
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.id === 'status-filter') {
    statusFilter = target.value as TicketStatus | '';
    const list = root!.querySelector('.ticket-list, .empty-state');
    if (list) list.outerHTML = renderTicketRows(visibleTickets(), isLate);
    const count = root!.querySelector('.result-count');
    if (count) count.textContent = `${visibleTickets().length} solicitudes`;
  }
  if (target.matches('[data-ticket-category]')) updateTicketTypeOptions(target);
  if (target.matches('[data-ticket-type]')) updateTicketIssueOptions(target);
  if (target.dataset.ticketField) void updateTicketField(target);
});

root.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const summary = target.closest<HTMLElement>('[data-ticket-category-summary]');
  if (summary) {
    const details = summary.closest<HTMLDetailsElement>('details[data-category-index]');
    const index = Number(details?.dataset.categoryIndex);
    if (Number.isInteger(index)) expandedTicketCategoryIndex = details?.open ? -1 : index;
  }
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'forgot') {
    const email = root!.querySelector<HTMLInputElement>('[name="email"]')?.value.trim();
    if (!email) return showToast('Escribe tu correo y vuelve a seleccionar esta opción.');
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Si el correo está registrado, recibirás instrucciones para recuperar el acceso.');
    } catch (error) {
      showToast(errorText(error));
    }
  } else if (action === 'report-error') {
    renderErrorReport();
  } else if (action === 'contact-sales') {
    const plan = button.dataset.plan ?? '';
    if (isSalesPlanId(plan)) renderSalesContact(plan);
    else showToast('No se pudo identificar el plan seleccionado.');
  } else if (action === 'update-report-status') {
    await updateReportStatus(button);
  } else if (action === 'signout') {
    await signOut(auth);
  } else if (action === 'new-ticket') {
    await renderNewTicket();
  } else if (action === 'add-ticket-category') {
    ticketCategories.push({ name: '', types: [{ name: '', issues: [''] }] });
    expandedTicketCategoryIndex = ticketCategories.length - 1;
    renderApp();
  } else if (action === 'remove-ticket-category') {
    const index = Number(button.dataset.categoryIndex);
    if (Number.isInteger(index) && index >= 0 && index < ticketCategories.length) {
      ticketCategories.splice(index, 1);
      if (expandedTicketCategoryIndex === index) expandedTicketCategoryIndex = -1;
      else if (expandedTicketCategoryIndex > index) expandedTicketCategoryIndex -= 1;
      renderApp();
    }
  } else if (action === 'add-ticket-type') {
    const index = Number(button.dataset.categoryIndex);
    if (Number.isInteger(index) && ticketCategories[index]) {
      ticketCategories[index].types.push({ name: '', issues: [''] });
      expandedTicketCategoryIndex = index;
      renderApp();
    }
  } else if (action === 'remove-ticket-type') {
    const categoryIndex = Number(button.dataset.categoryIndex);
    const typeIndex = Number(button.dataset.typeIndex);
    if (Number.isInteger(categoryIndex) && Number.isInteger(typeIndex)
      && ticketCategories[categoryIndex]?.types[typeIndex]) {
      ticketCategories[categoryIndex].types.splice(typeIndex, 1);
      renderApp();
    }
  } else if (action === 'invite') {
    renderInvite();
  } else if (action === 'detail' && button.dataset.id) {
    try {
      await renderTicketDetail(button.dataset.id);
    } catch (error) {
      showToast(errorText(error));
    }
  } else if (action === 'close-modal') {
    root!.querySelector<HTMLDialogElement>('#modal')?.close();
  }
});

window.addEventListener('hashchange', () => {
  if (profile && currentUser) void renderCurrentRoute();
  else renderPublicRoute();
});

root.addEventListener('click', (event) => {
  if (event.target === root!.querySelector('#modal')) {
    (event.target as HTMLDialogElement).close();
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    profile = null;
    tickets = [];
    users = [];
    reports = [];
    reportsLoadError = '';
    companyName = '';
    ticketCategories = defaultTicketCategoryOptions();
    ticketSettingsError = '';
    expandedTicketCategoryIndex = -1;
    if (pendingLoginMessage) {
      const message = pendingLoginMessage;
      pendingLoginMessage = '';
      renderLogin(message);
    } else {
      renderPublicRoute();
    }
    return;
  }

  root!.innerHTML = '<main class="loading"><span class="spinner"></span><p>Verificando acceso…</p></main>';
  try {
    profile = await loadProfile(user);
    if (loginCompanyId && loginCompanyId !== profile.companyId) {
      loginCompanyId = '';
      pendingLoginMessage = 'El ID de empresa no coincide con la cuenta.';
      await signOut(auth);
      return;
    }
    loginCompanyId = '';
    await loadCompany();
    await loadTicketSettings();
    await loadTickets();
    if (isStaff()) await loadUsers();
    await renderCurrentRoute();
  } catch (error) {
    loginCompanyId = '';
    await signOut(auth);
    renderLogin(errorText(error));
  }
});
