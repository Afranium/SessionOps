import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CheckCircle2,
  Download,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Search,
  Upload,
  X
} from 'lucide-react';

import {
  AuthError,
  bulkTracking,
  checkSession,
  fetchSessions,
  filterSessions,
  logout as apiLogout,
  patchTracking
} from './api';
import type { AttendanceStatus, Filters, ImportRecord, SessionRow, Tracking } from './types';
import { formatWeekend, isoDateOf, uniqueSorted, weekendKey } from './lib';
import { Login } from './components/Login';
import { Overview } from './components/Overview';
import { SessionsTable } from './components/SessionsTable';
import { ImportWizard } from './components/ImportWizard';
import { ExportDialog } from './components/ExportDialog';

type View = 'overview' | 'sessions';
type Toast = { kind: 'success' | 'error' | 'info'; message: string };

const EMPTY_FILTERS: Filters = {
  weekend: '',
  programme: '',
  centre: '',
  modality: '',
  status: '',
  q: ''
};

function pickDefaultWeekend(keys: string[]) {
  if (!keys.length) return '';
  const todayKey = weekendKey(isoDateOf(new Date()));
  if (keys.includes(todayKey)) return todayKey;
  return keys.find((key) => key > todayKey) ?? keys[keys.length - 1];
}

export default function App() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [savingCount, setSavingCount] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const weekendInitialized = useRef(false);
  const saveQueue = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; patch: Partial<Tracking> }>());

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    setToast({ kind, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const data = await fetchSessions();
        setSessions(data.sessions);
        setImports(data.imports);
        if (!weekendInitialized.current && data.sessions.length) {
          const keys = uniqueSorted(data.sessions.map((session) => weekendKey(session.date)));
          setFilters((current) => ({ ...current, weekend: pickDefaultWeekend(keys) }));
          weekendInitialized.current = true;
        }
      } catch (error) {
        if (error instanceof AuthError) {
          setAuth('out');
        } else {
          pushToast('error', error instanceof Error ? error.message : 'Could not load the tracker');
        }
      } finally {
        setLoading(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await checkSession();
        if (cancelled) return;
        if (result.authenticated) {
          setAuth('in');
          await load(true);
        } else {
          setAuth('out');
        }
      } catch {
        if (!cancelled) setAuth('out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const flush = useCallback(
    (id: number) => {
      const entry = saveQueue.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      saveQueue.current.delete(id);
      setSavingCount((count) => count + 1);

      patchTracking(id, entry.patch)
        .then(({ tracking }) => {
          setSessions((current) =>
            current.map((session) => (session.id === id ? { ...session, tracking } : session))
          );
        })
        .catch((error) => {
          if (error instanceof AuthError) {
            setAuth('out');
            return;
          }
          pushToast('error', error instanceof Error ? error.message : 'Could not save that change');
          void load();
        })
        .finally(() => setSavingCount((count) => Math.max(0, count - 1)));
    },
    [load, pushToast]
  );

  const patch = useCallback(
    (id: number, changes: Partial<Tracking>) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === id ? { ...session, tracking: { ...session.tracking, ...changes } } : session
        )
      );

      const existing = saveQueue.current.get(id);
      if (existing) clearTimeout(existing.timer);
      const merged = { ...(existing?.patch ?? {}), ...changes };
      const timer = setTimeout(() => flush(id), 450);
      saveQueue.current.set(id, { timer, patch: merged });
    },
    [flush]
  );

  const bulk = useCallback(
    async (status: AttendanceStatus) => {
      const ids = [...selected];
      if (!ids.length) return;

      ids.forEach((id) => {
        const entry = saveQueue.current.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          saveQueue.current.delete(id);
        }
      });

      setSessions((current) =>
        current.map((session) =>
          ids.includes(session.id)
            ? { ...session, tracking: { ...session.tracking, status } }
            : session
        )
      );
      setSelected(new Set());

      try {
        const result = await bulkTracking(ids, { status });
        const updated = new Map(result.updated.map((item) => [item.id, item.tracking]));
        setSessions((current) =>
          current.map((session) => (updated.has(session.id) ? { ...session, tracking: updated.get(session.id)! } : session))
        );
        pushToast('success', `${ids.length} classes marked ${status.toLowerCase()}.`);
      } catch (error) {
        if (error instanceof AuthError) {
          setAuth('out');
          return;
        }
        pushToast('error', error instanceof Error ? error.message : 'Bulk update failed');
        void load();
      }
    },
    [load, pushToast, selected]
  );

  const filtered = useMemo(() => filterSessions(sessions, filters), [sessions, filters]);

  const weekendOptions = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach((session) => {
      const key = weekendKey(session.date);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sessions]);

  const programmes = useMemo(() => uniqueSorted(sessions.map((session) => session.programme)), [sessions]);
  const centres = useMemo(() => uniqueSorted(sessions.map((session) => session.centre)), [sessions]);

  const pendingCount = useMemo(
    () => sessions.filter((session) => session.tracking.status === 'Pending').length,
    [sessions]
  );

  useEffect(() => {
    setSelected(new Set());
  }, [filters]);

  const toggleSelect = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectMany = (ids: number[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      setSessions([]);
      setImports([]);
      setAuth('out');
    }
  };

  const handleImported = async () => {
    weekendInitialized.current = false;
    await load();
    setFilters((current) => ({ ...current, weekend: '' }));
    weekendInitialized.current = true;
  };

  const clearFilters = () => {
    setFilters((current) => ({ ...EMPTY_FILTERS, weekend: current.weekend }));
  };

  const activeFilterCount = [filters.programme, filters.centre, filters.modality, filters.status, filters.q].filter(Boolean).length;

  if (auth === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060910]">
        <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
      </div>
    );
  }

  if (auth === 'out') {
    return (
      <Login
        onSuccess={() => {
          setAuth('in');
          void load(true);
        }}
      />
    );
  }

  const weekendLabel = filters.weekend ? formatWeekend(filters.weekend) : 'All weekends';

  return (
    <div className="flex min-h-screen bg-[#060910] text-slate-200">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#070b13] lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-400/25">
            <CalendarCheck2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">SessionOps</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">KNUST IDL</p>
          </div>
        </div>

        <nav className="mt-2 space-y-1 px-3">
          <NavItem
            active={view === 'overview'}
            icon={LayoutDashboard}
            label="Overview"
            onClick={() => setView('overview')}
          />
          <NavItem
            active={view === 'sessions'}
            icon={ListChecks}
            label="Attendance tracker"
            badge={pendingCount}
            onClick={() => setView('sessions')}
          />
          <button
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            <Upload className="h-4 w-4" />
            Import timetable
          </button>
        </nav>

        <div className="mt-auto p-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-[11px] font-semibold text-slate-300">
                IT
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">IT Team</p>
                <p className="truncate text-[10px] text-slate-500">Shared workspace</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[11px] text-slate-400 transition hover:border-white/15 hover:text-slate-200"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#060910]/85 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
            <div className="mr-auto flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-400/25 lg:hidden">
                <CalendarCheck2 className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-[15px] font-semibold tracking-tight text-white">
                  {view === 'overview' ? 'Overview' : 'Attendance tracker'}
                </h1>
                <p className="text-[11px] text-slate-500">
                  {weekendLabel} · {filtered.length} classes
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {view === 'sessions' && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={filters.q}
                    onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                    placeholder="Search course or facilitator"
                    className="h-8 w-48 rounded-lg border border-white/[0.07] bg-white/[0.03] pl-8 pr-7 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-400/40 sm:w-60"
                  />
                  {filters.q && (
                    <button
                      onClick={() => setFilters((current) => ({ ...current, q: '' }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              <select
                value={filters.weekend}
                onChange={(event) => setFilters((current) => ({ ...current, weekend: event.target.value }))}
                className="h-8 max-w-[190px] rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 text-xs text-slate-200 outline-none focus:border-sky-400/40"
              >
                <option value="">All weekends</option>
                {weekendOptions.map(([key, count]) => (
                  <option key={key} value={key}>
                    {formatWeekend(key)} ({count})
                  </option>
                ))}
              </select>

              <div className="hidden items-center gap-1.5 px-1 text-[10px] text-slate-500 sm:flex">
                {savingCount > 0 ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-sky-400" /> Saving
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Saved
                  </>
                )}
              </div>

              <button
                onClick={() => setImportOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-slate-300 transition hover:bg-white/[0.06]"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <button
                onClick={() => setExportOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-400 px-3 text-xs font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>

          <div className="flex gap-1 border-t border-white/[0.05] px-4 py-2 lg:hidden">
            <MobileTab active={view === 'overview'} onClick={() => setView('overview')}>Overview</MobileTab>
            <MobileTab active={view === 'sessions'} onClick={() => setView('sessions')}>
              Tracker {pendingCount > 0 && <span className="ml-1 rounded bg-white/10 px-1 text-[9px]">{pendingCount}</span>}
            </MobileTab>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 lg:px-6">
          {view === 'sessions' && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Programme"
                value={filters.programme}
                options={programmes}
                onChange={(value) => setFilters((current) => ({ ...current, programme: value }))}
              />
              <FilterSelect
                label="Centre"
                value={filters.centre}
                options={centres}
                onChange={(value) => setFilters((current) => ({ ...current, centre: value }))}
              />
              <FilterSelect
                label="Modality"
                value={filters.modality}
                options={['Online', 'Face-to-Face']}
                onChange={(value) => setFilters((current) => ({ ...current, modality: value }))}
              />
              <FilterSelect
                label="Status"
                value={filters.status}
                options={['Present', 'Absent', 'Rescheduled', 'Pending']}
                onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
              />
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition hover:text-white"
                >
                  <X className="h-3 w-3" /> Clear {activeFilterCount}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
            </div>
          ) : view === 'overview' ? (
            <Overview
              sessions={filtered}
              imports={imports}
              weekend={filters.weekend}
              onGoToSessions={() => setView('sessions')}
              onPatch={patch}
              onImport={() => setImportOpen(true)}
            />
          ) : (
            <SessionsTable
              sessions={filtered}
              selected={selected}
              onToggle={toggleSelect}
              onSelectMany={selectMany}
              onPatch={patch}
              onBulk={bulk}
              onClearSelection={() => setSelected(new Set())}
              onClearFilters={clearFilters}
            />
          )}
        </main>
      </div>

      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
        onOpenTracker={() => setView('sessions')}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        sessions={filtered}
        allCount={sessions.length}
        onDone={(message) => pushToast('success', message)}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] flex max-w-sm items-start gap-2.5 rounded-xl border border-white/10 bg-[#0d1421]/95 px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          {toast.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
          {toast.kind === 'error' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
          {toast.kind === 'info' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
          <p className="text-xs leading-relaxed text-slate-200">{toast.message}</p>
          <button onClick={() => setToast(null)} className="ml-1 text-slate-500 hover:text-white" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  icon: Icon,
  label,
  badge,
  onClick
}: {
  active: boolean;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
        active
          ? 'bg-white/[0.06] text-white ring-1 ring-inset ring-white/[0.06]'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {badge ? (
        <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">{badge}</span>
      ) : null}
    </button>
  );
}

function MobileTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs transition ${
        active ? 'bg-white/[0.07] text-white' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-8 rounded-lg border px-2.5 text-[11px] outline-none transition ${
        value
          ? 'border-sky-400/30 bg-sky-400/[0.07] text-sky-200'
          : 'border-white/[0.07] bg-white/[0.03] text-slate-400'
      }`}
    >
      <option value="">{label}: all</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
