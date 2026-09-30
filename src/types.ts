export type ScreenType = 'login' | 'register' | 'dashboard';
export type UserRole = 'USER' | 'ADMIN' | 'PROFESSIONAL';

export interface User { id: string; name: string; email: string; phone?: string; roles?: string[]; }
export interface CatalogItem { id: string; name: string; code?: string; active?: boolean; }
export interface Specialty extends CatalogItem { durationMinutes: 30 | 60; appointmentType?: 'GENERAL' | 'SPECIALIZED'; }
export interface Professional extends CatalogItem { firstName?: string; lastName?: string; professionalCode?: string; licenseNumber?: string; specialties?: Specialty[]; locationIds?: string[]; }
export interface AvailabilitySlot { startAt: string; endAt?: string; }
export interface AvailableProfessional { id: string; name: string; slots: AvailabilitySlot[]; }
export type AppointmentStatus = 'APPROVED' | 'REQUESTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export interface Appointment { id: string; status: AppointmentStatus; professionalName: string; specialtyName: string; locationName: string; professionalId?: string; specialtyId?: string; locationId?: string; startAt: string; durationMinutes: number; rejectionReason?: string; }
export interface Eps { id: string; code: string; name: string; active: boolean; }
export interface InsuranceRegime { id: string; code: string; name: string; }
export interface EpsPlan { id: string; epsId: string; epsName: string; regimeId: string; regimeName: string; code: string; name: string; active: boolean; }
export type RescheduleStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface Reschedule { id: string; appointmentId: string; status: RescheduleStatus; patientName: string; professionalName: string; specialtyName: string; locationName: string; previousStartAt: string; requestedStartAt: string; durationMinutes: number; decisionReason?: string; }
export interface AvailabilityBlock { id: string; locationId: string; locationName?: string; startAt: string; endAt: string; }
