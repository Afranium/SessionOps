import type { AttendanceStatus, SessionRow } from './types';

export function isoDateOf(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function weekendKey(isoDate: string) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return isoDate;
  const day = date.getDay();
  if (day === 6) return isoDate;
  if (day === 0) {
    date.setDate(date.getDate() - 1);
    return isoDateOf(date);
  }
  return isoDate;
}

export function formatDate(isoDate: string) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return isoDate;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateLong(isoDate: string) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return isoDate;
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatWeekend(isoDate: string) {
  if (!isoDate) return '';
  const saturday = new Date(`${isoDate}T00:00:00`);
  const sunday = new Date(saturday);
  sunday.setDate(sunday.getDate() + 1);
  return `${saturday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function formatTime(value: string) {
  if (!value) return '';
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function timeToMinutes(value: string) {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function durationHours(start: string, end: string) {
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from === null || to === null || to <= from) return 0;
  return (to - from) / 60;
}

export function varianceMinutes(start: string, actualStart: string) {
  const scheduled = timeToMinutes(start);
  const actual = timeToMinutes(actualStart);
  if (scheduled === null || actual === null) return null;
  return actual - scheduled;
}

export interface Metrics {
  total: number;
  present: number;
  absent: number;
  rescheduled: number;
  pending: number;
  online: number;
  faceToFace: number;
  scheduledHours: number;
  actualHours: number;
  delegated: number;
  substituteRate: number;
  deviations: number;
  attendanceRate: number;
  marked: number;
}

export function computeMetrics(sessions: SessionRow[]): Metrics {
  const total = sessions.length;
  const present = sessions.filter((s) => s.tracking.status === 'Present').length;
  const absent = sessions.filter((s) => s.tracking.status === 'Absent').length;
  const rescheduled = sessions.filter((s) => s.tracking.status === 'Rescheduled').length;
  const pending = total - present - absent - rescheduled;
  const online = sessions.filter((s) => s.modality === 'Online').length;
  const delegated = sessions.filter((s) => s.tracking.delegated || s.tracking.substitute).length;
  const scheduledHours = sessions.reduce((sum, s) => sum + durationHours(s.startTime, s.endTime), 0);
  const actualHours = sessions
    .filter((s) => s.tracking.status === 'Present')
    .reduce((sum, s) => sum + durationHours(s.tracking.actualStart || s.startTime, s.tracking.actualEnd || s.endTime), 0);
  const deviations = sessions.filter((s) => {
    const value = varianceMinutes(s.startTime, s.tracking.actualStart);
    return value !== null && Math.abs(value) > 15;
  }).length;
  const marked = present + absent + rescheduled;

  return {
    total,
    present,
    absent,
    rescheduled,
    pending,
    online,
    faceToFace: total - online,
    scheduledHours,
    actualHours,
    delegated,
    substituteRate: total ? (delegated / total) * 100 : 0,
    deviations,
    attendanceRate: present + absent ? (present / (present + absent)) * 100 : 0,
    marked
  };
}

export const STATUS_META: Record<AttendanceStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  Present: {
    label: 'Present',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/25'
  },
  Absent: {
    label: 'Absent',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    bg: 'bg-rose-400/10',
    border: 'border-rose-400/25'
  },
  Rescheduled: {
    label: 'Rescheduled',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/25'
  },
  Pending: {
    label: 'Pending',
    dot: 'bg-slate-500',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/25'
  }
};

export function varianceTone(value: number | null) {
  if (value === null) return { label: '—', className: 'text-slate-500' };
  if (value === 0) return { label: 'On time', className: 'text-emerald-300' };
  if (Math.abs(value) <= 15) {
    return { label: `${value > 0 ? '+' : ''}${value}m`, className: 'text-sky-300' };
  }
  if (Math.abs(value) <= 30) {
    return { label: `${value > 0 ? '+' : ''}${value}m`, className: 'text-amber-300' };
  }
  return { label: `${value > 0 ? '+' : ''}${value}m`, className: 'text-rose-300' };
}

export function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
