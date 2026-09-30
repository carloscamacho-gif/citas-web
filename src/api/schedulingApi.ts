import { getAccessToken } from '../auth/authApi';
import type { Appointment, AvailabilityBlock, AvailableProfessional, CatalogItem, Eps, EpsPlan, InsuranceRegime, Professional, Reschedule, Specialty } from '../types';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
export class SchedulingApiError extends Error { constructor(public readonly status: number, message: string) { super(message); this.name = 'SchedulingApiError'; } }
function query(params: Record<string, string | undefined>): string { const entries = Object.entries(params).filter(([, value]) => value) as [string, string][]; return entries.length ? `?${new URLSearchParams(entries).toString()}` : ''; }
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken(); let response: Response;
  try { response = await fetch(`${API_URL}/api/v1${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } }); }
  catch { throw new SchedulingApiError(0, 'No fue posible conectar con el servicio de citas.'); }
  if (!response.ok) { const problem = await response.json().catch(() => null) as { detail?: string } | null; throw new SchedulingApiError(response.status, problem?.detail ?? 'No fue posible completar la solicitud.'); }
  if (response.status === 204) return undefined as T; return response.json() as Promise<T>;
}
export const catalogsApi = { locations: () => request<CatalogItem[]>('/catalogs/locations'), insurancePlans: () => request<CatalogItem[]>('/catalogs/plans'), specialties: () => request<Specialty[]>('/specialties') };
export const appointmentsApi = {
  availability: (filters: { locationId: string; specialtyId: string; professionalId?: string; date: string }) => request<AvailableProfessional[]>(`/availability${query(filters)}`),
  create: (input: { professionalId: string; locationId: string; specialtyId: string; startAt: string; reason?: string }) => request<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(input) }),
  mine: (filters: { status?: string; date?: string } = {}) => request<Appointment[]>(`/appointments${query(filters)}`),
  cancel: (id: string) => request<Appointment>(`/appointments/${id}/cancel`, { method: 'POST' }),
  reschedule: (id: string, input: { professionalId?: string; locationId?: string; requestedStartAt: string }) => request<Reschedule>(`/appointments/${id}/reschedule`, { method: 'POST', body: JSON.stringify(input) }),
  pendingSpecialized: () => request<Appointment[]>('/admin/appointments/pending-specialized'),
  decide: (id: string, decision: 'APPROVE' | 'REJECT', reason?: string) => request<Appointment>(`/admin/appointments/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) }),
};
export const adminApi = {
  specialties: () => request<Specialty[]>('/admin/specialties'), createSpecialty: (input: { code: string; name: string; durationMinutes: 30 | 60; general: boolean }) => request<Specialty>('/admin/specialties', { method: 'POST', body: JSON.stringify(input) }),
  updateSpecialty: (id: string, input: Partial<{ name: string; durationMinutes: 30 | 60; active: boolean }>) => request<Specialty>(`/admin/specialties/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createProfessional: (input: Record<string, unknown>) => request<Professional>('/admin/professionals', { method: 'POST', body: JSON.stringify(input) }),
  assignSpecialties: (id: string, specialtyIds: string[], primarySpecialtyId: string) => request<void>(`/admin/professionals/${id}/specialties`, { method: 'PUT', body: JSON.stringify({ specialtyIds, primarySpecialtyId }) }),
  assignLocations: (id: string, locationIds: string[]) => request<void>(`/admin/professionals/${id}/locations`, { method: 'PUT', body: JSON.stringify({ locationIds }) }), setActive: (id: string, active: boolean) => request<Professional>(`/admin/professionals/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
};
export const epsApi = {
  list: () => request<Eps[]>('/admin/eps'),
  create: (input: { code: string; name: string }) => request<Eps>('/admin/eps', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<{ name: string; active: boolean }>) => request<Eps>(`/admin/eps/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/admin/eps/${id}`, { method: 'DELETE' }),
};
export const epsPlansApi = {
  list: () => request<EpsPlan[]>('/admin/eps-plans'),
  regimes: () => request<InsuranceRegime[]>('/admin/eps-plans/regimes'),
  create: (input: { epsId: string; regimeId: string; code: string; name: string }) => request<EpsPlan>('/admin/eps-plans', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<{ name: string; active: boolean }>) => request<EpsPlan>(`/admin/eps-plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/admin/eps-plans/${id}`, { method: 'DELETE' }),
};
export const professionalApi = {
  agenda: (filters: { from?: string; to?: string; locationId?: string } = {}) => request<Appointment[]>(`/professional/agenda${query(filters)}`),
  close: (id: string, outcome: 'COMPLETED' | 'NO_SHOW') => request<Appointment>(`/professional/appointments/${id}/close`, { method: 'POST', body: JSON.stringify({ outcome }) }),
};
export const reschedulesApi = {
  pending: () => request<Reschedule[]>('/admin/reschedules/pending'),
  decide: (id: string, decision: 'APPROVE' | 'REJECT', reason?: string) => request<Reschedule>(`/admin/reschedules/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) }),
};
export const availabilityApi = {
  listMine: (date?: string, locationId?: string) => request<AvailabilityBlock[]>(`/professional/availability-blocks${query({ date, locationId })}`), create: (input: Omit<AvailabilityBlock, 'id' | 'locationName'>) => request<AvailabilityBlock>('/professional/availability-blocks', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<Omit<AvailabilityBlock, 'id' | 'locationName'>>) => request<AvailabilityBlock>(`/professional/availability-blocks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }), remove: (id: string) => request<void>(`/professional/availability-blocks/${id}`, { method: 'DELETE' }),
};
export function schedulingErrorMessage(error: unknown): string { if (!(error instanceof SchedulingApiError)) return 'Ocurrió un error inesperado.'; if (error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.'; if (error.status === 403) return 'No tienes permiso para realizar esta acción.'; if (error.status === 404) return 'El recurso solicitado no está disponible.'; if (error.status === 409) return 'El horario dejó de estar disponible. Selecciona otro horario.'; if (error.status === 400) return 'Revisa los datos ingresados.'; return error.message; }
export function catalogErrorMessage(error: unknown): string { if (!(error instanceof SchedulingApiError)) return 'Ocurrió un error inesperado.'; if (error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.'; if (error.status === 403) return 'No tienes permiso para realizar esta acción.'; if (error.status === 404) return 'El elemento ya no existe. Actualiza la vista.'; if (error.status === 409) return 'El código ya está en uso, o el elemento está referenciado por otros registros: desactívalo en lugar de eliminarlo.'; if (error.status === 400) return 'Revisa los datos ingresados (EPS y régimen deben existir).'; return error.message; }
