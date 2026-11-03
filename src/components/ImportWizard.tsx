import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  UploadCloud,
  X
} from 'lucide-react';
import { commitImport, commitWeeklyImport, previewImport } from '../api';
import type { Mapping, PreviewResponse, WeeklySection } from '../types';

const formatSectionDate = (date: string) => {
  if (!date) return 'No date';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return date;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const FIELDS: { key: string; label: string; required?: boolean; hint?: string }[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'start', label: 'Start time' },
  { key: 'end', label: 'End time' },
  { key: 'courseCode', label: 'Course code' },
  { key: 'courseTitle', label: 'Course title' },
  { key: 'facilitator', label: 'Facilitator' },
  { key: 'facilitatorPhone', label: 'Phone' },
  { key: 'facilitatorEmail', label: 'Email' },
  { key: 'centre', label: 'Centre' },
  { key: 'modality', label: 'Modality' },
  { key: 'programme', label: 'Programme' },
  { key: 'level', label: 'Level' },
  { key: 'year', label: 'Year' },
  { key: 'block', label: 'Block' },
  { key: 'uniqueId', label: 'Unique ID', hint: 'Optional. Keeps re-imports stable.' }
];

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
  onOpenTracker: () => void;
}

export function ImportWizard({ open, onClose, onImported, onOpenTracker }: Props) {
  const [step, setStep] = useState<'upload' | 'map' | 'review' | 'done'>('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; total: number; sections?: number } | null>(null);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setBusy(false);
    setError('');
    setPreview(null);
    setSheetIndex(0);
    setHeaderRow(0);
    setMapping({});
    setResult(null);
    setSelectedSections(new Set());
    setDragActive(false);
  }, [open]);

  if (!open) return null;

  const sheet = preview?.sheets?.[sheetIndex];

  const applySheet = (index: number) => {
    if (!preview?.sheets) return;
    const next = preview.sheets[index];
    setSheetIndex(index);
    setHeaderRow(next.headerRow);
    setMapping({ ...next.suggestedMapping });
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const data = await previewImport(file);
      setPreview(data);
      if (data.mode === 'weekly') {
        setSelectedSections(new Set((data.sections ?? []).map((section) => section.id)));
        setStep('review');
      } else {
        setSheetIndex(0);
        setHeaderRow(data.sheets?.[0]?.headerRow ?? 0);
        setMapping({ ...(data.sheets?.[0]?.suggestedMapping ?? {}) });
        setStep('map');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const loadSample = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/sample-timetable.xlsx');
      if (!response.ok) throw new Error('Sample timetable is not available');
      const blob = await response.blob();
      await handleFile(new File([blob], 'sample-timetable.xlsx', { type: blob.type }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the sample');
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview || !sheet) return;
    if (mapping.date === undefined || mapping.date === null) {
      setError('Map the Date column before importing.');
      return;
    }
    if ((mapping.courseCode === undefined || mapping.courseCode === null) && (mapping.courseTitle === undefined || mapping.courseTitle === null)) {
      setError('Map a Course code or Course title column before importing.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const clean: Mapping = {};
      Object.entries(mapping).forEach(([key, value]) => {
        if (value !== null && value !== undefined) clean[key] = value;
      });
      const summary = await commitImport({
        token: preview.token,
        sheetName: sheet.name,
        headerRow,
        mapping: clean
      });
      setResult(summary);
      setStep('done');
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleSection = (id: string) => {
    setSelectedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitWeekly = async () => {
    if (!preview) return;
    const sectionIds = [...selectedSections];
    if (!sectionIds.length) {
      setError('Select at least one weekend section to import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const summary = await commitWeeklyImport({ token: preview.token, sectionIds });
      setResult(summary);
      setStep('done');
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const weeklySections: WeeklySection[] = preview?.sections ?? [];
  const selectedRecords = weeklySections
    .filter((section) => selectedSections.has(section.id))
    .reduce((total, section) => total + section.recordCount, 0);
  const allSelected = weeklySections.length > 0 && selectedSections.size === weeklySections.length;

  const rows = sheet?.rows ?? [];
  const headers = rows[headerRow] ?? [];
  const dataRows = rows.slice(headerRow + 1, headerRow + 7);
  const adjustedCount = sheet ? Math.max(0, sheet.rowCount + sheet.headerRow - headerRow) : 0;
  const mappedColumns = new Map<number, string>();
  Object.entries(mapping).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const field = FIELDS.find((item) => item.key === key);
    mappedColumns.set(Number(value), field?.label ?? key);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f19] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/20">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Import timetable</h2>
              <p className="text-[11px] text-slate-500">
                {step === 'upload' && 'Choose the Excel file the Institute publishes.'}
                {step === 'map' && 'Match the spreadsheet columns to the tracker fields.'}
                {step === 'review' && 'Check each weekend, then import the sections you want.'}
                {step === 'done' && 'The timetable is now in the tracker.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.05] hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3.5 py-2.5 text-sm text-rose-200">
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="mx-auto max-w-xl py-6">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
                  dragActive
                    ? 'border-sky-400/50 bg-sky-400/[0.06]'
                    : 'border-white/[0.09] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-400">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                </div>
                <p className="mt-4 text-sm font-medium text-slate-200">
                  {busy ? 'Reading the workbook…' : 'Drop the timetable here'}
                </p>
                <p className="mt-1 text-xs text-slate-500">or click to choose an .xlsx, .xls, or .csv file</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.target.value = '';
                  }}
                />
              </div>

              <div className="mt-4 flex flex-col items-center gap-3 text-center">
                <button
                  onClick={loadSample}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  Try the sample schedule
                </button>
                <p className="max-w-sm text-[11px] leading-relaxed text-slate-600">
                  Re-importing a corrected timetable updates the classes and keeps any attendance already
                  recorded against them.
                </p>
              </div>
            </div>
          )}


          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">File</p>
                  <p className="mt-1 truncate text-sm text-slate-200">{preview?.filename}</p>
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                  {weeklySections.length} weekend sections · {weeklySections.reduce((total, section) => total + section.recordCount, 0)} classes
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setSelectedSections(
                        allSelected ? new Set() : new Set(weeklySections.map((section) => section.id))
                      )
                    }
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/[0.06]"
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                  <button
                    onClick={() => {
                      setPreview(null);
                      setStep('upload');
                    }}
                    className="text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
                  >
                    Choose another file
                  </button>
                </div>
              </div>

              <div className="max-h-[46vh] overflow-auto rounded-xl border border-white/[0.07]">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#0b111d] text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() =>
                            setSelectedSections(
                              allSelected ? new Set() : new Set(weeklySections.map((section) => section.id))
                            )
                          }
                          className="h-3.5 w-3.5 accent-sky-400"
                          aria-label="Select all sections"
                        />
                      </th>
                      <th className="px-3 py-2.5 font-medium">Date</th>
                      <th className="px-3 py-2.5 font-medium">Sheet</th>
                      <th className="px-3 py-2.5 text-right font-medium">Classes</th>
                      <th className="px-3 py-2.5 font-medium">Recorded</th>
                      <th className="px-3 py-2.5 font-medium">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {weeklySections.map((section) => {
                      const selected = selectedSections.has(section.id);
                      return (
                        <tr
                          key={section.id}
                          onClick={() => toggleSection(section.id)}
                          className={`cursor-pointer transition ${selected ? 'bg-sky-400/[0.04]' : 'opacity-55 hover:opacity-80'}`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSection(section.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-3.5 w-3.5 accent-sky-400"
                              aria-label={`Include ${section.sheetName} ${section.date}`}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className="font-medium text-slate-200">{formatSectionDate(section.date)}</span>
                            <span className="ml-1.5 text-slate-500">{section.weekday}</span>
                          </td>
                          <td className="max-w-[230px] truncate px-3 py-2.5 text-slate-500" title={section.sheetName}>
                            {section.sheetName}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{section.recordCount}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-slate-500">
                            <span className="text-emerald-300/80">{section.summary.Present} present</span>
                            {section.summary.Pending > 0 && <span className="ml-1.5">{section.summary.Pending} pending</span>}
                            {section.summary.Rescheduled > 0 && (
                              <span className="ml-1.5 text-amber-300/80">{section.summary.Rescheduled} rescheduled</span>
                            )}
                            {section.summary.delegated > 0 && (
                              <span className="ml-1.5 text-sky-300/70">{section.summary.delegated} delegated</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {section.warnings.length ? (
                              <span className="inline-flex items-start gap-1.5 text-[11px] leading-snug text-amber-300">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                {section.warnings.join(' · ')}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-600">
                Classes are matched by course, date, programme, and facilitator. Re-importing updates the
                timetable but keeps attendance already recorded. Untick any weekend that looks wrong.
              </p>
            </div>
          )}

          {step === 'map' && sheet && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[180px] flex-1">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">File</p>
                  <p className="mt-1 truncate text-sm text-slate-200">{preview?.filename}</p>
                </div>
                {preview && (preview.sheets?.length ?? 0) > 1 && (
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-slate-500">Sheet</span>
                    <select
                      value={sheetIndex}
                      onChange={(event) => applySheet(Number(event.target.value))}
                      className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-slate-200 outline-none focus:border-sky-400/40"
                    >
                      {(preview.sheets ?? []).map((item, index) => (
                        <option key={item.name} value={index}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-slate-500">Header row</span>
                  <input
                    type="number"
                    min={1}
                    value={headerRow + 1}
                    onChange={(event) => setHeaderRow(Math.max(0, Number(event.target.value) - 1))}
                    className="h-9 w-24 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs text-slate-200 outline-none focus:border-sky-400/40"
                  />
                </label>
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                  {adjustedCount} data rows
                </div>
                <button
                  onClick={() => {
                    setPreview(null);
                    setStep('upload');
                  }}
                  className="ml-auto text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
                >
                  Choose another file
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map((field) => (
                  <label key={field.key} className="block rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-300">
                        {field.label}
                        {field.required && <span className="ml-1 text-rose-400">*</span>}
                      </span>
                    </span>
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: event.target.value === '' ? null : Number(event.target.value)
                        }))
                      }
                      className="mt-1.5 h-8 w-full rounded-md border border-white/[0.07] bg-[#0b111c] px-2 text-xs text-slate-200 outline-none focus:border-sky-400/40"
                    >
                      <option value="">Not mapped</option>
                      {headers.map((header, index) => (
                        <option key={`${field.key}-${index}`} value={index}>
                          {index + 1}. {header || '(empty)'}
                        </option>
                      ))}
                    </select>
                    {field.hint && <span className="mt-1 block text-[10px] text-slate-600">{field.hint}</span>}
                  </label>
                ))}
              </div>

              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">Preview</p>
                <div className="max-h-64 overflow-auto rounded-xl border border-white/[0.07]">
                  <table className="w-full min-w-[720px] text-left text-[11px]">
                    <thead className="sticky top-0 bg-[#0b111d] text-slate-400">
                      <tr>
                        <th className="w-10 px-2 py-2 font-medium">#</th>
                        {headers.map((header, index) => (
                          <th key={index} className="whitespace-nowrap px-2 py-2 font-medium">
                            <span className="block text-slate-300">{header || '—'}</span>
                            {mappedColumns.has(index) && (
                              <span className="mt-0.5 inline-block rounded bg-sky-400/10 px-1 py-0.5 text-[9px] font-normal text-sky-300">
                                {mappedColumns.get(index)}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] text-slate-400">
                      {dataRows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="px-2 py-1.5 text-slate-600">{rowIndex + 1}</td>
                          {headers.map((_, columnIndex) => (
                            <td key={columnIndex} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1.5">
                              {row[columnIndex] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div className="mx-auto max-w-md py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">Timetable imported</h3>
              <p className="mt-1 text-sm text-slate-400">
                {result.inserted} new classes added, {result.updated} updated.
                {result.skipped ? ` ${result.skipped} rows skipped.` : ''}
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <button
                  onClick={() => {
                    onOpenTracker();
                    onClose();
                  }}
                  className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  Open tracker
                </button>
                <button
                  onClick={() => {
                    setStep('upload');
                    setPreview(null);
                    setResult(null);
                  }}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06]"
                >
                  Import another
                </button>
              </div>
            </div>
          )}
        </div>

        {(step === 'map' || step === 'review') && (
          <footer className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-4">
            <button
              onClick={() => setStep('upload')}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-600">
                {step === 'review'
                  ? `${selectedSections.size} of ${weeklySections.length} sections · ${selectedRecords} classes`
                  : 'Existing attendance is preserved.'}
              </span>
              <button
                onClick={step === 'review' ? commitWeekly : commit}
                disabled={busy || (step === 'review' && selectedSections.size === 0)}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Importing…' : step === 'review' ? `Import ${selectedRecords} classes` : 'Import timetable'}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
