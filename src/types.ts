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
  categoryType?: string;
  issue?: string;
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

export interface TicketTypeOption {
  name: string;
  issues: string[];
}

export interface TicketCategoryOption {
  name: string;
  types: TicketTypeOption[];
}

export type TicketCategoryMap = Record<string, Record<string, string[]>>;

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

export const DEFAULT_TICKET_CATEGORIES: TicketCategoryOption[] = [
  {
    name: 'Periféricos',
    types: [
      { name: 'Mouse', issues: ['Dañado', 'Sin batería', 'No funciona'] },
      { name: 'Teclado', issues: ['Dañado', 'No funciona', 'Teclas no responden'] },
      { name: 'Monitor', issues: ['Dañado', 'Sin señal', 'No enciende'] },
    ],
  },
  { name: 'Soporte TI', types: [{ name: 'General', issues: ['No funciona', 'Error', 'Otro'] }] },
  { name: 'Infraestructura', types: [{ name: 'General', issues: ['Sin conexión', 'Intermitente', 'Otro'] }] },
  { name: 'Recursos humanos', types: [{ name: 'General', issues: ['Consulta', 'Actualización', 'Otro'] }] },
  { name: 'Finanzas', types: [{ name: 'General', issues: ['Consulta', 'Otro'] }] },
  { name: 'Mantenimiento', types: [{ name: 'General', issues: ['Dañado', 'No funciona', 'Otro'] }] },
  { name: 'Otro', types: [{ name: 'General', issues: ['Otro'] }] },
];
