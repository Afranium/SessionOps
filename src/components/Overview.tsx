import { useMemo } from 'react';
import {
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  MonitorPlay,
  Upload,
  UserRoundCog
} from 'lucide-react';
import type { ImportRecord, SessionRow, Tracking } from '../types';
import { computeMetrics, formatDate, formatTime, formatWeekend, varianceMinutes } from '../lib';

interface Props {
  sessions: SessionRow[];
  imports: ImportRecord[];
  weekend: string;
  onGoToSessions: () => void;
  onPatch: (id: number, patch: Partial<Tracking>) => void;
  onImport: () => void;
}

export function Overview({ sessions, imports, weekend, onGoToSessions, onPatch, onImport }: Props) {
  const metrics = useMemo(() => computeMetrics(sessions), [sessions]);
  const pending = useMemo(
    () =>
      sessions
        .filter((session) => session.tracking.status === 'Pending')
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [sessions]
  );
  const delegated = useMemo(
    () => sessions.filter((session) => session.tracking.delegated || session.tracking.substitute),
    [sessions]
  );
  const deviations = useMemo(
    () =>
      sessions.filter((session) => {
        const value = varianceMinutes(session.startTime, session.tracking.actualStart);
        return value !== null && Math.abs(value) > 15;
      }),
    [sessions]
  );

  const markedPercent = metrics.total ? Math.round((metrics.marked / metrics.total) * 100) : 0;

  const cards = [
    {
      label: 'Classes scheduled',
      value: metrics.total,
      sub: `${metrics.marked} marked · ${metrics.pending} pending`,
      icon: BookOpenCheck,
      accent: 'text-sky-300',
      ring: 'ring-sky-400/20',
      glow: 'from-sky-500/10'
    },
    {
      label: 'Present rate',
      value: metrics.present + metrics.absent ? `${metrics.attendanceRate.toFixed(0)}%` : '—',
      sub: `${metrics.present} present · ${metrics.absent} absent`,
      icon: CheckCircle2,
      accent: 'text-emerald-300',
      ring: 'ring-emerald-400/20',
      glow: 'from-emerald-500/10'
    },
    {
      label: 'Online share',
      value: metrics.total ? `${Math.round((metrics.online / metrics.total) * 100)}%` : '—',
      sub: `${metrics.online} online · ${metrics.faceToFace} face-to-face`,
      icon: MonitorPlay,
      accent: 'text-violet-300',
      ring: 'ring-violet-400/20',
      glow: 'from-violet-500/10'
    },
    {
      label: 'Scheduled hours',
      value: metrics.scheduledHours.toFixed(1),
      sub: `${metrics.actualHours.toFixed(1)} actual hours logged`,
      icon: Clock3,
      accent: 'text-amber-300',
      ring: 'ring-amber-400/20',
      glow: 'from-amber-500/10'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br ${card.glow} via-transparent to-transparent p-4`}
            >
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-inset ${card.ring} ${card.accent}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{card.value}</p>
              <p className="mt-1 text-[11px] text-slate-500">{card.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Weekend progress</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {weekend ? formatWeekend(weekend) : 'All weekends combined'}
                </p>
              </div>
              <button
                onClick={onGoToSessions}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.06]"
              >
                Open tracker <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/[0.04]">
              <Segment value={metrics.present} total={metrics.total} className="bg-emerald-400" />
              <Segment value={metrics.absent} total={metrics.total} className="bg-rose-400" />
              <Segment value={metrics.rescheduled} total={metrics.total} className="bg-amber-400" />
              <Segment value={metrics.pending} total={metrics.total} className="bg-slate-600" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Present" value={metrics.present} dot="bg-emerald-400" />
              <Stat label="Absent" value={metrics.absent} dot="bg-rose-400" />
              <Stat label="Rescheduled" value={metrics.rescheduled} dot="bg-amber-400" />
              <Stat label="Not marked" value={metrics.pending} dot="bg-slate-600" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <UserRoundCog className="h-3.5 w-3.5 text-amber-300" />
                {metrics.delegated} delegated ({metrics.substituteRate.toFixed(1)}% coverage)
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-sky-300" />
                {metrics.deviations} timing deviations over 15 min
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-white">Needs attention</h2>
                <p className="mt-0.5 text-xs text-slate-500">Classes still waiting to be marked</p>
              </div>
              <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-400">{pending.length}</span>
            </div>
            {pending.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {pending.slice(0, 5).map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-slate-200">
                        {session.courseCode || session.courseTitle}
                        <span className="ml-2 text-slate-500">{session.courseTitle && session.courseCode ? session.courseTitle : ''}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {formatDate(session.date)} · {formatTime(session.startTime)} · {session.facilitator || 'Unassigned'}
                      </p>
                    </div>
                    <button
                      onClick={() => onPatch(session.id, { status: 'Present' })}
                      className="shrink-0 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-400/[0.12]"
                    >
                      Mark present
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                <p className="mt-2 text-sm text-slate-300">Everything is marked for this selection.</p>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Completion</h2>
              <span className="text-[11px] text-slate-500">{markedPercent}%</span>
            </div>
            <div className="mt-4 flex items-center gap-5">
              <Ring percent={markedPercent} />
              <div className="space-y-1.5 text-[11px] text-slate-500">
                <p><span className="text-slate-200">{metrics.marked}</span> of {metrics.total} marked</p>
                <p>{deviations.length} timing deviations</p>
                <p>{delegated.length} delegated classes</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="text-sm font-semibold text-white">Delegations</h2>
              <p className="mt-0.5 text-xs text-slate-500">Classes handed to a substitute</p>
            </div>
            {delegated.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {delegated.slice(0, 4).map((session) => (
                  <li key={session.id} className="px-5 py-3">
                    <p className="truncate text-[12px] text-slate-200">{session.courseCode || session.courseTitle}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {session.facilitator || 'Unassigned'} → <span className="text-amber-300">{session.tracking.substitute || 'No name'}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-xs text-slate-500">No delegations recorded.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-white">Imports</h2>
                <p className="mt-0.5 text-xs text-slate-500">Recent timetable uploads</p>
              </div>
              <button
                onClick={onImport}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] text-slate-400 transition hover:text-white"
                aria-label="Import timetable"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
            </div>
            {imports.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {imports.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-slate-200">{item.filename}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.row_count} rows · {item.inserted_count} new · {item.updated_count} updated
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-xs text-slate-500">No timetable imported yet.</p>
                <button
                  onClick={onImport}
                  className="mt-3 rounded-lg bg-sky-400 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  Import timetable
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Segment({ value, total, className }: { value: number; total: number; className: string }) {
  const width = total ? (value / total) * 100 : 0;
  return <div className={`h-full transition-all ${className}`} style={{ width: `${width}%` }} />;
}

function Stat({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function Ring({ percent }: { percent: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold text-white">{percent}%</span>
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">done</span>
      </div>
    </div>
  );
}
