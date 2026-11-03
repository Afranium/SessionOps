import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import type { SessionRow } from '../types';
import { downloadExport } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  sessions: SessionRow[];
  allCount: number;
  onDone: (message: string) => void;
}

export function ExportDialog({ open, onClose, sessions, allCount, onDone }: Props) {
  const [scope, setScope] = useState<'view' | 'all'>('view');
  const [layout, setLayout] = useState<'weekly' | 'tracking'>('weekly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setScope('view');
      setLayout('weekly');
      setBusy(false);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const count = scope === 'view' ? sessions.length : allCount;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadExport(scope === 'view' ? sessions.map((session) => session.id) : null, layout);
      onDone(`Exported ${count} classes to Excel.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Export report</h2>
              <p className="text-[11px] text-slate-500">Excel workbook for the school report</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.05] hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">Layout</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <LayoutOption
                checked={layout === 'weekly'}
                onChange={() => setLayout('weekly')}
                title="Weekend report"
                description="One sheet per weekend, like the school workbook."
              />
              <LayoutOption
                checked={layout === 'tracking'}
                onChange={() => setLayout('tracking')}
                title="Flat tracking"
                description="One row per class with every tracker field."
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Rows</p>
            <ScopeOption
              checked={scope === 'view'}
              onChange={() => setScope('view')}
              title="Current view"
              description={`${sessions.length} classes after filters`}
            />
            <ScopeOption
              checked={scope === 'all'}
              onChange={() => setScope('all')}
              title="Everything"
              description={`${allCount} classes in the tracker`}
            />
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
            {layout === 'weekly' ? (
              <>
                Each weekend sheet keeps the school columns and adds{' '}
                <span className="text-slate-300">status, actual times, delegation, variance,</span> and{' '}
                <span className="text-slate-300">notes</span>. A Summary and By programme sheet are included.
              </>
            ) : (
              <>
                Includes a <span className="text-slate-300">Tracking</span> sheet, a{' '}
                <span className="text-slate-300">Summary</span> sheet, and a{' '}
                <span className="text-slate-300">By programme</span> breakdown.
              </>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:text-white">
            Cancel
          </button>
          <button
            onClick={run}
            disabled={busy || count === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? 'Preparing…' : `Download ${count} rows`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ScopeOption({
  checked,
  onChange,
  title,
  description
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
        checked
          ? 'border-sky-400/30 bg-sky-400/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
          checked ? 'border-sky-400' : 'border-white/20'
        }`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-sky-400" />}
      </span>
      <span>
        <span className="block text-sm text-slate-200">{title}</span>
        <span className="block text-[11px] text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function LayoutOption({
  checked,
  onChange,
  title,
  description
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`rounded-xl border px-3.5 py-3 text-left transition ${
        checked
          ? 'border-sky-400/30 bg-sky-400/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
            checked ? 'border-sky-400' : 'border-white/20'
          }`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-sky-400" />}
        </span>
        <span className="text-sm text-slate-200">{title}</span>
      </span>
      <span className="mt-1 block text-[11px] leading-snug text-slate-500">{description}</span>
    </button>
  );
}
