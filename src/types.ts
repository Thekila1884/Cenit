import type { Timestamp } from 'firebase/firestore';

export type Role = 'admin' | 'agent' | 'user';
export type TicketStatus = 'abierto' | 'progreso' | 'revision' | 'resuelto';
export type Priority = 'baja' | 'media' | 'alta' | 'critica';

export interface UserProfile {
  uid: string;
  companyId: string;
  name: string;
  email: string;
  department: string;
  role: Role;
  active: boolean;
}

export interface Ticket {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  createdBy: string;
  createdByName: string;
  assignedTo: string | null;
  createdAt: Timestamp | null;
  dueDate: string;
  updatedAt: Timestamp | null;
  closedAt: Timestamp | null;
}

export interface TicketComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface ErrorReport {
  id: string;
  companyId: string;
  description: string;
  reporterEmail: string | null;
  reporterUid: string | null;
  route: string;
  createdAt: Timestamp | null;
  emailStatus: 'sending' | 'sent' | 'failed';
  reviewStatus: 'pending' | 'reviewed';
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: 'Abierto',
  progreso: 'En progreso',
  revision: 'En revisión',
  resuelto: 'Resuelto',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export const CATEGORIES = [
  'Soporte TI',
  'Infraestructura',
  'Recursos humanos',
  'Finanzas',
  'Mantenimiento',
  'Otro',
];
