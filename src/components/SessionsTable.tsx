import { useMemo, useState } from 'react';
import {
  CalendarX2,
  Check,
  ChevronDown,
  Minus,
  RotateCcw,
  UserRoundCog,
  X
} from 'lucide-react';
import type { AttendanceStatus, SessionRow, Tracking } from '../types';
import { formatDate, formatDateLong, formatTime, varianceMinutes, varianceTone } from '../lib';

interface Props {
  sessions: SessionRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectMany: (ids: number[], checked: boolean) => void;
  onPatch: (id: number, patch: Partial<Tracking>) => void;
  onBulk: (status: AttendanceStatus) => void;
  onClearSelection: () => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; short: string; icon: typeof Check }[] = [
  { value: 'Present', label: 'Present', short: 'P', icon: Check },
  { value: 'Absent', label: 'Absent', short: 'A', icon: X },
  { value: 'Rescheduled', label: 'Rescheduled', short: 'R', icon: RotateCcw },
  { value: 'Pending', label: 'Not marked', short: '–', icon: Minus }
];

const STATUS_ACTIVE: Record<AttendanceStatus, string> = {
  Present: 'bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/25',
  Absent: 'bg-rose-400/15 text-rose-300 ring-1 ring-inset ring-rose-400/25',
  Rescheduled: 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/25',
  Pending: 'bg-white/[0.06] text-slate-300 ring-1 ring-inset ring-white/10'
};

export function SessionsTable({
  sessions,
  selected,
  onToggle,
  onSelectMany,
  onPatch,
  onBulk,
  onClearSelection,
  onClearFilters
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const session of sessions) {
      const list = map.get(session.date) || [];
      list.push(session);
      map.set(session.date, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sessions]);

  const visibleIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));

  const toggleExpanded = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!sessions.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-500">
          <CalendarX2 className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-slate-200">No classes match these filters</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Try another weekend, or import a timetable if this is the first run.
        </p>
        <button
          onClick={onClearFilters}
          className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm text-slate-200 transition hover:bg-white/[0.07]"
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(element) => {
                if (element) element.indeterminate = someSelected && !allSelected;
              }}
              onChange={(event) => onSelectMany(visibleIds, event.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.04] accent-sky-400"
            />
            Select all
          </label>
          <span className="text-xs text-slate-600">{sessions.length} classes</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Present</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Absent</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Rescheduled</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Not marked</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0a0f1a]/80">
        <table className="w-full min-w-[1060px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[34px]" />
            <col className="w-[182px]" />
            <col className="w-[160px]" />
            <col className="w-[152px]" />
            <col className="w-[190px]" />
            <col className="w-[72px]" />
            <col className="w-[122px]" />
            <col className="w-[124px]" />
            <col className="w-[66px]" />
            <col className="w-[34px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#0b111d]/95 text-[10px] uppercase tracking-[0.12em] text-slate-500 backdrop-blur">
            <tr className="border-b border-white/[0.07]">
              <th className="px-2.5 py-3" />
              <th className="px-2.5 py-3 font-medium">Course</th>
              <th className="px-2.5 py-3 font-medium">Facilitator</th>
              <th className="px-2.5 py-3 font-medium">Session</th>
              <th className="px-2.5 py-3 font-medium">Actual time</th>
              <th className="px-2.5 py-3 font-medium" title="Participants present">Students</th>
              <th className="px-2.5 py-3 font-medium">Attendance</th>
              <th className="px-2.5 py-3 font-medium">Delegation</th>
              <th className="px-2.5 py-3 font-medium" title="Start-time variance from schedule">Var.</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {groups.map(([date, rows]) => {
              const present = rows.filter((row) => row.tracking.status === 'Present').length;
              return (
                <FragmentGroup
                  key={date}
                  date={date}
                  rows={rows}
                  present={present}
                  selected={selected}
                  expanded={expanded}
                  onToggle={onToggle}
                  onPatch={onPatch}
                  onToggleExpanded={toggleExpanded}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0d1421]/95 px-3 py-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <span className="px-2 text-xs text-slate-400">{selected.size} selected</span>
          <span className="h-4 w-px bg-white/10" />
          {(['Present', 'Absent', 'Rescheduled', 'Pending'] as AttendanceStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => onBulk(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition hover:brightness-125 ${STATUS_ACTIVE[status]}`}
            >
              {status === 'Pending' ? 'Clear' : status}
            </button>
          ))}
          <span className="h-4 w-px bg-white/10" />
          <button onClick={onClearSelection} className="rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:text-white">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

interface GroupProps {
  date: string;
  rows: SessionRow[];
  present: number;
  selected: Set<number>;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onPatch: (id: number, patch: Partial<Tracking>) => void;
  onToggleExpanded: (id: number) => void;
}

function FragmentGroup({ date, rows, present, selected, expanded, onToggle, onPatch, onToggleExpanded }: GroupProps) {
  return (
    <>
      <tr className="border-b border-white/[0.06] bg-white/[0.025]">
        <td colSpan={10} className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {formatDateLong(date)}
            </span>
            <span className="text-[11px] text-slate-500">
              {rows.length} classes · {present} present
            </span>
          </div>
        </td>
      </tr>
      {rows.map((session) => (
        <SessionRowView
          key={session.id}
          session={session}
          selected={selected.has(session.id)}
          expanded={expanded.has(session.id)}
          onToggle={onToggle}
          onPatch={onPatch}
          onToggleExpanded={onToggleExpanded}
        />
      ))}
    </>
  );
}

interface RowProps {
  session: SessionRow;
  selected: boolean;
  expanded: boolean;
  onToggle: (id: number) => void;
  onPatch: (id: number, patch: Partial<Tracking>) => void;
  onToggleExpanded: (id: number) => void;
}

function SessionRowView({ session, selected, expanded, onToggle, onPatch, onToggleExpanded }: RowProps) {
  const { tracking } = session;
  const variance = varianceMinutes(session.startTime, tracking.actualStart);
  const tone = varianceTone(variance);
  const delegated = tracking.delegated || Boolean(tracking.substitute);

  return (
    <>
      <tr
        className={`group border-b border-white/[0.05] transition-colors ${
          selected ? 'bg-sky-400/[0.06]' : 'hover:bg-white/[0.025]'
        }`}
      >
        <td className="px-2.5 py-2.5 align-top">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(session.id)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-white/[0.04] accent-sky-400"
            aria-label={`Select ${session.courseCode}`}
          />
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <p className="truncate font-medium text-slate-100" title={session.courseTitle || session.courseCode}>{session.courseTitle || session.courseCode}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500" title={`${session.courseCode}${session.programme ? ` · ${session.programme}` : ''}`}>
            {session.courseCode}
            {session.programme ? ` · ${session.programme}` : ''}
          </p>
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <p className="truncate text-slate-200" title={session.facilitator || 'Unassigned'}>{session.facilitator || <span className="text-slate-600">Unassigned</span>}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{session.facilitatorPhone || session.facilitatorEmail || ''}</p>
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <div className="flex flex-col gap-1">
            <span className="text-slate-300">
              {formatTime(session.startTime)}{session.endTime ? ` – ${formatTime(session.endTime)}` : ''}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  session.modality === 'Online'
                    ? 'bg-sky-400/10 text-sky-300'
                    : 'bg-violet-400/10 text-violet-300'
                }`}
              >
                {session.modality === 'Online' ? 'Online' : 'Face-to-face'}
              </span>
              <span className="truncate">{session.centre || '—'}</span>
            </span>
          </div>
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <div className="flex items-center gap-1">
            <input
              type="time"
              lang="en-GB"
              value={tracking.actualStart}
              onChange={(event) => onPatch(session.id, { actualStart: event.target.value })}
              className="time-plain h-7 w-[78px] rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
              aria-label="Actual start time"
            />
            <span className="text-slate-600">–</span>
            <input
              type="time"
              lang="en-GB"
              value={tracking.actualEnd}
              onChange={(event) => onPatch(session.id, { actualEnd: event.target.value })}
              className="time-plain h-7 w-[78px] rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
              aria-label="Actual end time"
            />
          </div>
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <input
            type="number"
            min={0}
            value={tracking.participants || ''}
            placeholder="0"
            onChange={(event) => onPatch(session.id, { participants: Number(event.target.value) || 0 })}
            className="h-7 w-full rounded-md border border-white/[0.07] bg-white/[0.03] px-2 text-[11px] text-slate-200 outline-none focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
            aria-label="Participants present"
          />
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = tracking.status === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => onPatch(session.id, { status: option.value })}
                  title={option.label}
                  aria-label={option.label}
                  className={`flex h-6 w-[21px] items-center justify-center rounded-md transition ${
                    active ? STATUS_ACTIVE[option.value] : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </td>

        <td className="px-2.5 py-2.5 align-top">
          {delegated ? (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                <UserRoundCog className="h-3 w-3" /> Delegated
              </span>
              <input
                type="text"
                value={tracking.substitute}
                onChange={(event) => onPatch(session.id, { substitute: event.target.value, delegated: true })}
                placeholder="Substitute name"
                className="h-7 w-full rounded-md border border-amber-400/20 bg-amber-400/[0.05] px-2 text-[11px] text-amber-100 outline-none placeholder:text-amber-200/30 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/10"
              />
            </div>
          ) : (
            <button
              onClick={() => onPatch(session.id, { delegated: true })}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11px] text-slate-400 transition hover:border-amber-400/25 hover:text-amber-300"
            >
              <UserRoundCog className="h-3 w-3" /> Delegate
            </button>
          )}
        </td>

        <td className="px-2.5 py-2.5 align-top">
          <span className={`text-[11px] font-medium ${tone.className}`}>{tone.label}</span>
        </td>

        <td className="px-2 py-2.5 align-top">
          <button
            onClick={() => onToggleExpanded(session.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200"
            aria-label={expanded ? 'Hide details' : 'Show details'}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-white/[0.05] bg-[#080d16]">
          <td />
          <td colSpan={9} className="px-3 pb-4 pt-1">
            <div className="grid gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-500">Notes</span>
                <textarea
                  rows={2}
                  value={tracking.notes}
                  onChange={(event) => onPatch(session.id, { notes: event.target.value })}
                  placeholder="Anything the report should capture"
                  className="w-full resize-none rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-500">Held as</span>
                <select
                  value={tracking.modalityHeld}
                  onChange={(event) => onPatch(session.id, { modalityHeld: event.target.value })}
                  className="h-9 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 text-xs text-slate-200 outline-none focus:border-sky-400/40"
                >
                  <option value="">As scheduled ({session.modality})</option>
                  <option value="Online">Online</option>
                  <option value="Face-to-Face">Face-to-Face</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-500">Reschedule date</span>
                <input
                  type="date"
                  lang="en-GB"
                  value={tracking.rescheduleDate}
                  onChange={(event) => onPatch(session.id, { rescheduleDate: event.target.value })}
                  className="h-9 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 text-xs text-slate-200 outline-none focus:border-sky-400/40"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-slate-500">Reschedule time</span>
                <input
                  type="time"
                  lang="en-GB"
                  value={tracking.rescheduleTime}
                  onChange={(event) => onPatch(session.id, { rescheduleTime: event.target.value })}
                  className="h-9 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 text-xs text-slate-200 outline-none focus:border-sky-400/40"
                />
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
              <span>
                {formatDate(session.date)} · {session.level || 'Level not set'}
                {session.year ? ` · Year ${session.year}` : ''}
                {session.block ? ` · ${session.block}` : ''}
              </span>
              <span>{tracking.updatedAt ? `Last saved ${new Date(tracking.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet'}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
