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
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, configurationError, db, functions } from './firebase';
import { renderLoginView } from './modules/auth-view';
import { escapeHtml } from './modules/escape-html';
import { renderHomeView } from './modules/home-view';
import { renderErrorReportDialog, renderReports } from './modules/reports-view';
import { routeFromHash, routeHref, type AuthenticatedRoute } from './modules/router';
import { renderNewTicketDialog, renderTicketDetailDialog, renderTicketRows } from './modules/ticket-view';
import { renderInviteDialog, renderInviteLink as renderInviteLinkView, renderUsersTable } from './modules/users-view';
import {
  CATEGORIES,
  STATUS_LABELS,
  type Priority,
  type Role,
  type ErrorReport,
  type Ticket,
  type TicketComment,
  type TicketStatus,
  type UserProfile,
} from './types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No se encontró el contenedor principal.');

let currentUser: User | null = null;
let profile: UserProfile | null = null;
let tickets: Ticket[] = [];
let users: UserProfile[] = [];
let reports: ErrorReport[] = [];
let reportsLoadError = '';
let activeView: AuthenticatedRoute = 'mine';
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
    'functions/resource-exhausted': 'Espera un minuto antes de enviar otro reporte.',
    'functions/already-exists': 'Ya existe una cuenta con ese correo.',
    'functions/invalid-argument': 'Verifica los datos ingresados.',
  };
  return messages[code] ?? (error instanceof Error ? error.message : 'Ocurrió un error inesperado.');
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
  if (!data.active || token.claims.active !== true || data.uid !== user.uid || data.role !== claimRole) {
    throw new Error('La cuenta no está activa o sus permisos requieren revisión. Contacta al administrador.');
  }
  if (!['admin', 'agent', 'user'].includes(data.role)) throw new Error('El perfil tiene un rol no válido.');
  return data;
}

async function loadTickets() {
  if (!currentUser || !profile) return;
  const source = collection(db, 'tickets');
  const result = isStaff()
    ? await getDocs(source)
    : await getDocs(query(source, where('createdBy', '==', currentUser.uid)));
  tickets = result.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Ticket);
  tickets.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

async function loadUsers() {
  if (!isStaff()) return;
  const result = await getDocs(collection(db, 'users'));
  users = result.docs.map((snapshot) => snapshot.data() as UserProfile);
}

async function loadReports() {
  if (!isAdmin()) return;
  const result = await getDocs(query(collection(db, 'errorReports'), orderBy('createdAt', 'desc')));
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
    const matchesSearch = !search || [ticket.title, ticket.id, ticket.description, ticket.createdByName]
      .some((value) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return matchesSearch && (!statusFilter || ticket.status === statusFilter);
  });
}

function renderApp() {
  const signedInUser = currentUser;
  if (!profile || !signedInUser) return;
  if (activeView === 'users' && !isAdmin()) activeView = 'mine';
  if (activeView === 'tickets' && !isStaff()) activeView = 'mine';

  const openCount = tickets.filter((ticket) => ticket.status !== 'resuelto').length;
  const myOpenCount = tickets.filter((ticket) => ticket.status !== 'resuelto'
    && (ticket.createdBy === signedInUser.uid || ticket.assignedTo === signedInUser.uid)).length;
  const viewTitle = activeView === 'users' ? 'Usuarios' : activeView === 'tickets' ? 'Tickets del equipo' : 'Mis tickets';
  const pageTitle = activeView === 'reports' ? 'Reportes de error' : viewTitle;
  const pageDescription = activeView === 'reports'
    ? 'Revisa los errores reportados por el equipo.'
    : activeView === 'users'
      ? 'Invita personas y revisa sus roles.'
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
            ${activeView === 'users' ? '<button class="button primary" data-action="invite"><span>＋</span> Invitar usuario</button>' : activeView === 'reports' ? '' : '<button class="button primary" data-action="new-ticket"><span>＋</span> Nueva solicitud</button>'}
          </div>
          ${activeView === 'users' ? renderUsersTable(users, roleName) : activeView === 'reports'
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
  if (((nextRoute === 'users' || nextRoute === 'reports') && !isAdmin()) || (nextRoute === 'tickets' && !isStaff())) {
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

function renderNewTicket() {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = renderNewTicketDialog(today());
  dialog.showModal();
}

async function renderTicketDetail(id: string) {
  const ticket = tickets.find((item) => item.id === id);
  if (!ticket) return;
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = '<div class="dialog-content"><p>Cargando actividad…</p></div>';
  dialog.showModal();
  const commentsSnapshot = await getDocs(query(collection(db, 'tickets', id, 'comments'), orderBy('createdAt', 'asc')));
  const comments = commentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TicketComment);
  dialog.innerHTML = renderTicketDetailDialog(ticket, comments, {
    isStaff: isStaff(),
    users,
    isLate,
    formatDate: (timestamp) => timestamp?.toDate().toLocaleString('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }) ?? 'Ahora',
  });
}

function renderInvite() {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = renderInviteDialog();
  if (!dialog.open) dialog.showModal();
}

function renderErrorReport() {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal');
  if (!dialog) return;
  const email = currentUser?.email
    ?? root!.querySelector<HTMLInputElement>('#login-form [name="email"]')?.value.trim()
    ?? '';
  dialog.innerHTML = renderErrorReportDialog(email, window.location.hash.slice(0, 120));
  dialog.showModal();
}

function renderInviteLink(email: string, link: string) {
  const dialog = root!.querySelector<HTMLDialogElement>('#modal')!;
  dialog.innerHTML = renderInviteLinkView(email, link);
}

async function handleLogin(form: HTMLFormElement) {
  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  setBusy(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    renderLogin(errorText(error));
  } finally {
    setBusy(false);
  }
}

async function handleErrorReport(form: HTMLFormElement) {
  const data = new FormData(form);
  const description = String(data.get('description') ?? '').trim();
  if (!description) return;
  const submitReport = httpsCallable<
    { description: string; email: string; route: string },
    { reportId: string; emailSent: boolean }
  >(functions, 'submitErrorReport');
  setBusy(true);
  let message = '';
  try {
    const result = await submitReport({
      description,
      email: String(data.get('email') ?? '').trim(),
      route: String(data.get('route') ?? ''),
    });
    message = result.data.emailSent
      ? 'Reporte enviado y guardado en la bandeja de Cenit.'
      : 'El reporte quedó guardado en Cenit, pero no se pudo enviar el correo.';
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

async function handleTicketCreate(form: HTMLFormElement) {
  if (!currentUser || !profile) return;
  const data = new FormData(form);
  const title = String(data.get('title') ?? '').trim();
  if (!title) return;
  setBusy(true);
  try {
    await addDoc(collection(db, 'tickets'), {
      title,
      description: String(data.get('description') ?? '').trim(),
      category: String(data.get('category') ?? CATEGORIES[0]),
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

async function handleInvite(form: HTMLFormElement) {
  const data = new FormData(form);
  const invite = httpsCallable<
    { email: string; name: string; department: string; role: Role },
    { email: string; passwordSetupLink: string }
  >(functions, 'inviteUser');
  setBusy(true);
  try {
    const result = await invite({
      email: String(data.get('email') ?? '').trim(),
      name: String(data.get('name') ?? '').trim(),
      department: String(data.get('department') ?? '').trim(),
      role: String(data.get('role') ?? 'user') as Role,
    });
    renderInviteLink(result.data.email, result.data.passwordSetupLink);
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
  if (form.id === 'ticket-form') void handleTicketCreate(form);
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
  if (target.dataset.ticketField) void updateTicketField(target);
});

root.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
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
  } else if (action === 'update-report-status') {
    await updateReportStatus(button);
  } else if (action === 'signout') {
    await signOut(auth);
  } else if (action === 'new-ticket') {
    renderNewTicket();
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
  } else if (action === 'copy-link') {
    const input = root!.querySelector<HTMLTextAreaElement>('#invite-link');
    if (input) {
      await navigator.clipboard.writeText(input.value);
      showToast('Enlace copiado.');
    }
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
    renderPublicRoute();
    return;
  }

  root!.innerHTML = '<main class="loading"><span class="spinner"></span><p>Verificando acceso…</p></main>';
  try {
    profile = await loadProfile(user);
    await loadTickets();
    if (isStaff()) await loadUsers();
    await renderCurrentRoute();
  } catch (error) {
    await signOut(auth);
    renderLogin(errorText(error));
  }
});
