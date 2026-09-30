import React, { useEffect, useState } from 'react';
import { CalendarClock, Calendar, CheckCircle2, Clock, LogOut, MapPin, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { adminApi, appointmentsApi, availabilityApi, catalogsApi, reschedulesApi, schedulingErrorMessage } from '../api/schedulingApi';
import type { Appointment, AvailabilityBlock, CatalogItem, Professional, Reschedule, Specialty, User } from '../types';

interface Props { user: User; onOpenBooking: () => void; onLogout: () => void; refreshKey?: number; }
const heading = (role: string) => role === 'ADMIN' ? 'Administración de la oferta' : role === 'PROFESSIONAL' ? 'Mi disponibilidad' : 'Agenda tu atención';

const STATUS_LABEL: Record<string, string> = { REQUESTED: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', COMPLETED: 'Atendida', NO_SHOW: 'No asistió' };
const STATUS_STYLE: Record<string, string> = { REQUESTED: 'bg-amber-50 text-amber-700 border-amber-200', APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200', REJECTED: 'bg-red-50 text-red-700 border-red-200', CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200', COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200', NO_SHOW: 'bg-slate-100 text-slate-600 border-slate-200' };
const CANCELLABLE = new Set(['REQUESTED', 'APPROVED']);
const formatDateTime = (iso: string) => { try { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso)); } catch { return iso; } };
const formatTime = (iso: string) => { try { return new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso)); } catch { return iso; } };
const isFuture = (iso: string) => { const t = new Date(iso).getTime(); return Number.isFinite(t) && t > Date.now(); };

export function DashboardScreen({ user, onOpenBooking, onLogout, refreshKey = 0 }: Props) {
  const role = user.roles?.includes('ADMIN') ? 'ADMIN' : user.roles?.includes('PROFESSIONAL') ? 'PROFESSIONAL' : 'USER';
  return <div className="w-full max-w-6xl mx-auto space-y-6 pb-12" id="portal-dashboard">
    <header className="bg-white rounded-2xl shadow-sm border border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 text-white flex items-center justify-center shadow-md"><Calendar className="w-5 h-5" /></div><div><strong className="block text-slate-900">Portal de Citas</strong><span className="text-xs text-slate-400 uppercase">{heading(role)}</span></div></div><div className="flex items-center gap-3"><div className="hidden sm:block text-right"><strong className="block text-sm text-slate-900">{user.name}</strong><span className="text-xs text-slate-400">{role}</span></div>{role === 'USER' && <button type="button" onClick={onOpenBooking} className="px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-xl"><Plus className="inline w-4 h-4 mr-1" />Agendar cita</button>}<button type="button" onClick={onLogout} title="Cerrar sesión" className="p-2 text-slate-400 hover:text-red-600"><LogOut className="w-5 h-5" /></button></div></header>
    {role === 'USER' ? <UserHome onOpenBooking={onOpenBooking} refreshKey={refreshKey} /> : role === 'ADMIN' ? <AdminHome /> : <ProfessionalHome />}
    <footer className="p-4 bg-white rounded-2xl border border-slate-100 text-center text-xs text-slate-500"><ShieldCheck className="inline w-4 h-4 text-emerald-600 mr-1" />Portal de Citas Médicas · datos sintéticos de laboratorio</footer>
  </div>;
}

function UserHome({ onOpenBooking, refreshKey }: { onOpenBooking: () => void; refreshKey: number }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // Reprogramación (HU-019): panel inline por cita.
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rDate, setRDate] = useState('');
  const [rSlots, setRSlots] = useState<string[]>([]);
  const [rLoading, setRLoading] = useState(false);
  const [rSubmitting, setRSubmitting] = useState(false);
  const [rError, setRError] = useState('');

  const load = () => { setLoading(true); return appointmentsApi.mine().then((items) => { setAppointments(items); setError(''); }).catch((cause) => setError(schedulingErrorMessage(cause))).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [refreshKey]);

  const cancel = async (appointment: Appointment) => {
    setConfirmingId(null); setCancelingId(appointment.id); setError('');
    try { await appointmentsApi.cancel(appointment.id); await load(); }
    catch (cause) { setError(schedulingErrorMessage(cause)); }
    finally { setCancelingId(null); }
  };

  const loadRSlots = async (appointment: Appointment, date: string) => {
    if (!appointment.specialtyId || !appointment.locationId) { setRError('La cita no tiene datos suficientes para reprogramar.'); return; }
    setRLoading(true); setRError(''); setRSlots([]);
    try {
      const profs = await appointmentsApi.availability({ locationId: appointment.locationId, specialtyId: appointment.specialtyId, professionalId: appointment.professionalId, date });
      const mine = profs.find((p) => p.id === appointment.professionalId) ?? profs[0];
      setRSlots((mine?.slots ?? []).map((s) => s.startAt).filter((s) => s !== appointment.startAt));
    } catch (cause) { setRError(schedulingErrorMessage(cause)); }
    finally { setRLoading(false); }
  };

  const openReschedule = (appointment: Appointment) => {
    const day = appointment.startAt.slice(0, 10);
    setReschedulingId(appointment.id); setRDate(day); setRError(''); setNotice('');
    loadRSlots(appointment, day);
  };

  const submitReschedule = async (appointment: Appointment, startAt: string) => {
    setRSubmitting(true); setRError('');
    try {
      await appointmentsApi.reschedule(appointment.id, { professionalId: appointment.professionalId, locationId: appointment.locationId, requestedStartAt: startAt });
      setReschedulingId(null); setNotice('Solicitud de reprogramación enviada. Un administrador la revisará; tu cita actual sigue vigente.');
      await load();
    } catch (cause) { setRError(schedulingErrorMessage(cause)); }
    finally { setRSubmitting(false); }
  };

  return <div className="space-y-6">
    <section className="bg-gradient-to-br from-[#07152B] to-[#0E2952] rounded-3xl p-6 sm:p-8 text-white flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-xl sm:text-2xl font-bold">Tus citas médicas</h1><p className="text-sm text-slate-300 mt-1">Agenda una nueva cita o gestiona las existentes.</p></div>
      <button type="button" onClick={onOpenBooking} className="px-5 py-3 bg-white text-blue-700 text-sm font-semibold rounded-xl shadow"><Plus className="inline w-4 h-4 mr-1" />Agendar cita</button>
    </section>

    <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Mis citas</h2><button type="button" onClick={load} className="text-xs text-blue-600 font-semibold">Actualizar</button></div>
      {notice && <p className="p-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">{notice}</p>}
      {error && <p role="alert" className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Cargando tus citas…</p>}
      {!loading && appointments.length === 0 && <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl"><Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />Todavía no tienes citas. Agenda la primera con el botón de arriba.</div>}
      <ul className="space-y-3">
        {appointments.map((item) => <li key={item.id} className="p-4 border border-slate-100 rounded-2xl space-y-3">
          <div className="grid md:grid-cols-[1fr_auto] gap-3 items-center">
          <div>
            <div className="flex items-center gap-2 flex-wrap"><strong className="text-sm text-slate-900">{item.specialtyName}</strong><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[item.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>{STATUS_LABEL[item.status] ?? item.status}</span></div>
            <p className="text-xs text-slate-500 mt-1"><UserRound className="inline w-3.5 h-3.5 mr-1" />{item.professionalName} · <MapPin className="inline w-3.5 h-3.5 mx-1" />{item.locationName}</p>
            <p className="text-xs text-slate-500 mt-1"><Clock className="inline w-3.5 h-3.5 mr-1" />{formatDateTime(item.startAt)} · {item.durationMinutes} min</p>
            {item.status === 'REJECTED' && item.rejectionReason && <p className="text-xs text-red-600 mt-1">Motivo: {item.rejectionReason}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {item.status === 'APPROVED' && isFuture(item.startAt) && reschedulingId !== item.id && <button type="button" onClick={() => openReschedule(item)} className="px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50"><CalendarClock className="inline w-3.5 h-3.5 mr-1" />Reprogramar</button>}
            {CANCELLABLE.has(item.status) && (confirmingId === item.id
              ? <div className="flex items-center gap-2"><span className="text-xs text-slate-500">¿Seguro?</span><button type="button" disabled={cancelingId === item.id} onClick={() => cancel(item)} className="px-3 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50">{cancelingId === item.id ? 'Cancelando…' : 'Sí, cancelar'}</button><button type="button" onClick={() => setConfirmingId(null)} className="px-3 py-2 text-xs font-semibold text-slate-500 rounded-xl">No</button></div>
              : <button type="button" onClick={() => setConfirmingId(item.id)} className="px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50">Cancelar</button>)}
          </div>
          </div>
          {reschedulingId === item.id && <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap"><strong className="text-xs text-slate-700">Elige una nueva fecha y hora (mismo profesional y especialidad)</strong><button type="button" onClick={() => setReschedulingId(null)} className="text-xs text-slate-500">Cerrar</button></div>
            <label className="block text-xs text-slate-600">Día<input type="date" value={rDate} onChange={(event) => { setRDate(event.target.value); loadRSlots(item, event.target.value); }} className="mt-1 block w-full sm:w-52 p-2 border rounded-lg text-sm" /></label>
            {rError && <p role="alert" className="text-xs text-red-600">{rError}</p>}
            {rLoading && <p className="text-xs text-slate-500">Buscando horarios disponibles…</p>}
            {!rLoading && rSlots.length === 0 && !rError && <p className="text-xs text-slate-500">No hay horarios disponibles ese día. Prueba con otra fecha.</p>}
            <div className="flex flex-wrap gap-2">{rSlots.map((slot) => <button key={slot} type="button" disabled={rSubmitting} onClick={() => submitReschedule(item, slot)} className="px-3 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-600 hover:text-white disabled:opacity-50">{formatTime(slot)}</button>)}</div>
          </div>}
        </li>)}
      </ul>
    </section>
  </div>;
}

function AdminHome() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]); const [pending, setPending] = useState<Appointment[]>([]); const [reschedules, setReschedules] = useState<Reschedule[]>([]); const [error, setError] = useState(''); const [name, setName] = useState(''); const [code, setCode] = useState(''); const [duration, setDuration] = useState<30 | 60>(30); const [general, setGeneral] = useState(false); const [reasons, setReasons] = useState<Record<string, string>>({}); const [rReasons, setRReasons] = useState<Record<string, string>>({});
  const load = () => Promise.all([adminApi.specialties(), appointmentsApi.pendingSpecialized(), reschedulesApi.pending()]).then(([s, a, r]) => { setSpecialties(s); setPending(a); setReschedules(r); }).catch((cause) => setError(schedulingErrorMessage(cause)));
  useEffect(() => { load(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (!name.trim() || !code.trim()) return; try { await adminApi.createSpecialty({ code: code.trim(), name: name.trim(), durationMinutes: duration, general }); setName(''); setCode(''); setGeneral(false); await load(); } catch (cause) { setError(schedulingErrorMessage(cause)); } };
  const decide = async (appointment: Appointment, decision: 'APPROVE' | 'REJECT') => { const rejectionReason = reasons[appointment.id]?.trim(); if (decision === 'REJECT' && !rejectionReason) { setError('El rechazo requiere un motivo.'); return; } try { await appointmentsApi.decide(appointment.id, decision, rejectionReason); await load(); } catch (cause) { setError(schedulingErrorMessage(cause)); } };
  const decideReschedule = async (item: Reschedule, decision: 'APPROVE' | 'REJECT') => { const reason = rReasons[item.id]?.trim(); if (decision === 'REJECT' && !reason) { setError('El rechazo de una reprogramación requiere un motivo.'); return; } try { await reschedulesApi.decide(item.id, decision, reason); await load(); } catch (cause) { setError(schedulingErrorMessage(cause)); } };
  return <div className="grid lg:grid-cols-2 gap-6">{error && <p role="alert" className="lg:col-span-2 p-3 text-sm text-red-700 bg-red-50 rounded-xl">{error}</p>}<section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4"><h2 className="text-lg font-bold">Especialidades</h2><form onSubmit={create} className="grid grid-cols-2 gap-2"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código" className="p-2 border rounded-xl text-sm" /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nueva especialidad" className="p-2 border rounded-xl text-sm" /><select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 30 | 60)} className="p-2 border rounded-xl text-sm"><option value={30}>30 min</option><option value={60}>60 min</option></select><label className="text-xs p-2"><input type="checkbox" checked={general} onChange={(event) => setGeneral(event.target.checked)} /> Medicina general</label><button className="col-span-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">Crear especialidad</button></form><div className="space-y-2">{specialties.map((item) => <div key={item.id} className="p-3 bg-slate-50 rounded-xl flex justify-between text-sm"><span>{item.name}</span><span className="text-slate-500">{item.durationMinutes} min · {item.active === false ? 'Inactiva' : 'Activa'}</span></div>)}</div></section><section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-3"><h2 className="text-lg font-bold">Profesionales y asignaciones</h2><p className="text-sm text-slate-500">La creación, asignación de especialidades/sedes y activación usan los endpoints de administración. La API aún no expone la consulta de profesionales necesaria para mostrar un listado confiable.</p></section><section className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-3"><h2 className="text-lg font-bold">Solicitudes especializadas pendientes</h2>{pending.length ? pending.map((item) => <div key={item.id} className="p-4 border rounded-xl grid md:grid-cols-[1fr_auto] gap-3"><div><strong>{item.professionalName}</strong><p className="text-xs text-slate-500">{item.specialtyName} · {item.locationName} · {item.startAt}</p><input value={reasons[item.id] ?? ''} onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} placeholder="Motivo obligatorio si rechaza" className="mt-2 p-2 border rounded-lg text-xs w-full md:max-w-md" /></div><div className="flex gap-2"><button type="button" onClick={() => decide(item, 'APPROVE')} className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-xl">Aprobar</button><button type="button" onClick={() => decide(item, 'REJECT')} className="px-3 py-2 text-xs bg-red-600 text-white rounded-xl">Rechazar</button></div></div>) : <p className="text-sm text-slate-500">No hay solicitudes especializadas pendientes.</p>}</section><section className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-3"><h2 className="text-lg font-bold"><CalendarClock className="inline w-5 h-5 text-blue-600 mr-1" />Reprogramaciones pendientes</h2>{reschedules.length ? reschedules.map((item) => <div key={item.id} className="p-4 border rounded-xl grid md:grid-cols-[1fr_auto] gap-3"><div><strong>{item.patientName}</strong> · <span className="text-sm">{item.specialtyName}</span><p className="text-xs text-slate-500">{item.professionalName} · {item.locationName}</p><p className="text-xs text-slate-600 mt-1">De <span className="line-through">{formatDateTime(item.previousStartAt)}</span> a <strong className="text-blue-700">{formatDateTime(item.requestedStartAt)}</strong></p><input value={rReasons[item.id] ?? ''} onChange={(event) => setRReasons({ ...rReasons, [item.id]: event.target.value })} placeholder="Motivo obligatorio si rechaza" className="mt-2 p-2 border rounded-lg text-xs w-full md:max-w-md" /></div><div className="flex gap-2 items-start"><button type="button" onClick={() => decideReschedule(item, 'APPROVE')} className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-xl">Aprobar</button><button type="button" onClick={() => decideReschedule(item, 'REJECT')} className="px-3 py-2 text-xs bg-red-600 text-white rounded-xl">Rechazar</button></div></div>) : <p className="text-sm text-slate-500">No hay reprogramaciones pendientes.</p>}</section></div>;
}

function ProfessionalHome() {
  const [locations, setLocations] = useState<CatalogItem[]>([]); const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]); const [locationId, setLocationId] = useState(''); const [startAt, setStartAt] = useState(''); const [endAt, setEndAt] = useState(''); const [error, setError] = useState('');
  const load = () => availabilityApi.listMine().then(setBlocks).catch((cause) => setError(schedulingErrorMessage(cause)));
  useEffect(() => { catalogsApi.locations().then(setLocations).catch((cause) => setError(schedulingErrorMessage(cause))); load(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); try { await availabilityApi.create({ locationId, startAt, endAt }); setLocationId(''); setStartAt(''); setEndAt(''); await load(); } catch (cause) { setError(schedulingErrorMessage(cause)); } };
  return <div className="grid lg:grid-cols-2 gap-6">{error && <p role="alert" className="lg:col-span-2 p-3 text-sm text-red-700 bg-red-50 rounded-xl">{error}</p>}<section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"><h2 className="text-lg font-bold mb-4">Publicar bloque de disponibilidad</h2><form onSubmit={create} className="space-y-3"><select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className="w-full p-3 border rounded-xl"><option value="">Selecciona una sede</option>{locations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><label className="block text-xs">Inicio<input required type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="mt-1 w-full p-3 border rounded-xl" /></label><label className="block text-xs">Fin<input required type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="mt-1 w-full p-3 border rounded-xl" /></label><button className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl">Publicar bloque</button></form></section><section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100"><h2 className="text-lg font-bold mb-4">Mi calendario</h2><div className="space-y-3">{blocks.length ? blocks.map((block) => <div key={block.id} className="p-3 rounded-xl bg-slate-50 border flex justify-between gap-3 text-sm"><span><MapPin className="inline w-4 h-4 text-blue-600 mr-1" />{block.locationName ?? block.locationId}<br /><Clock className="inline w-4 h-4 text-blue-600 mr-1" />{block.startAt} — {block.endAt}</span><button type="button" onClick={async () => { try { await availabilityApi.remove(block.id); await load(); } catch (cause) { setError(schedulingErrorMessage(cause)); } }} className="text-xs text-red-600">Eliminar</button></div>) : <p className="text-sm text-slate-500">No tienes bloques publicados.</p>}</div></section></div>;
}
