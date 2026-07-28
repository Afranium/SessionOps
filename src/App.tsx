import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { BarChart3, BookOpenCheck, CalendarDays, Download, FileSpreadsheet, Loader2, MonitorPlay, UserRoundCog, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type Modality = 'Online' | 'Face-to-Face';
type AttendanceStatus = 'Present' | 'Absent' | 'Rescheduled' | 'Pending';

interface SessionRecord {
  id: string;
  courseKey: string;
  courseName: string;
  courseCode: string;
  date: string;
  centre: string;
  modality: Modality;
  startTime: string;
  endTime: string;
  actualStart: string;
  actualEnd: string;
  durationMins: number;
  participants: number;
  delegated: boolean;
  substitute: string;
  facilitator: string;
  status: AttendanceStatus;
  block: string;
}

interface MetricsSummary {
  totalClasses: number;
  onlineClasses: number;
  faceToFaceClasses: number;
  totalHours: string;
  substituteRate: string;
}

const emptyMetrics: MetricsSummary = {
  totalClasses: 0,
  onlineClasses: 0,
  faceToFaceClasses: 0,
  totalHours: '0.0',
  substituteRate: '0.0'
};

const statusPalette: Record<AttendanceStatus, string> = {
  Present: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Absent: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Rescheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Pending: 'bg-slate-500/15 text-slate-300 border-slate-500/30'
};

const modalityColors = ['#38bdf8', '#818cf8'];
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary>(emptyMetrics);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [workbookNames, setWorkbookNames] = useState<string[]>([]);
  const [selectedWorkbook, setSelectedWorkbook] = useState('');
  const [message, setMessage] = useState('Load the provided timetable workbook to start tracking classes.');

  const refreshWorkbookList = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/workbooks`);
      const data = await response.json();
      setWorkbookNames(data.workbooks ?? []);
    } catch {
      setWorkbookNames([]);
    }
  };

  const loadWorkbook = async (name = '') => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/load-workbook${name ? `?name=${encodeURIComponent(name)}` : ''}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load workbook');
      setSessions(data.sessions ?? []);
      setMetrics(data.metrics ?? emptyMetrics);
      setSelectedWorkbook(data.workbookName || name || '');
      setMessage(`Loaded ${data.sessions?.length ?? 0} classes from ${data.workbookName || 'the selected workbook'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load the workbook.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshWorkbookList();
    void loadWorkbook('');
  }, []);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      setSessions(data.sessions ?? []);
      setMetrics(data.metrics ?? emptyMetrics);
      setSelectedWorkbook(file.name);
      setMessage(`Imported ${data.sessions?.length ?? 0} classes successfully.`);
      await refreshWorkbookList();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to process workbook.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const updateSelectedStatus = async (status: AttendanceStatus) => {
    if (!selectedIds.length) return;

    const nextSessions = sessions.map((session) =>
      selectedIds.includes(session.id) ? { ...session, status } : session
    );

    setSessions(nextSessions);
    setSelectedIds([]);
    setMessage(`Updated ${selectedIds.length} selected rows to ${status}.`);
  };

  const updateSessionValue = <K extends keyof SessionRecord>(sessionId: string, field: K, value: SessionRecord[K]) => {
    setSessions((current) =>
      current.map((session) => (session.id === sessionId ? { ...session, [field]: value } : session))
    );
  };

  const exportWorkbook = async () => {
    if (!sessions.length) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions })
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'weekend-class-operations.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
      setMessage('Exported a styled administrative workbook.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export was not completed.');
    }
  };

  const metricsCards = useMemo(
    () => [
      { label: 'Total classes', value: metrics.totalClasses, icon: BookOpenCheck, tone: 'from-sky-600 to-blue-500' },
      { label: 'Online stream share', value: `${(((metrics.onlineClasses / Math.max(1, metrics.totalClasses)) * 100) || 0).toFixed(0)}%`, icon: MonitorPlay, tone: 'from-violet-600 to-fuchsia-500' },
      { label: 'Face-to-face classes', value: metrics.faceToFaceClasses, icon: Users, tone: 'from-emerald-600 to-lime-500' },
      { label: 'Taught hours', value: `${metrics.totalHours}h`, icon: CalendarDays, tone: 'from-amber-600 to-orange-500' }
    ],
    [metrics]
  );

  const chartData = useMemo(
    () => [
      { name: 'Online', value: metrics.onlineClasses },
      { name: 'Face-to-face', value: metrics.faceToFaceClasses }
    ],
    [metrics]
  );

  const discrepancyCount = sessions.filter((session) => {
    const scheduled = Number(session.startTime.split(':')[0] || 0) * 60 + Number(session.startTime.split(':')[1] || 0);
    const actual = Number(session.actualStart.split(':')[0] || 0) * 60 + Number(session.actualStart.split(':')[1] || 0);
    return Math.abs(actual - scheduled) > 15;
  }).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-500/15 p-3 text-sky-400">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">KNUST IDL Weekend Class Tracker</h1>
                <p className="text-sm text-slate-400">Operational dashboard for weekend teaching, attendance, and Excel workflows.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{uploading ? 'Importing…' : 'Upload timetable'}</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
            </label>
            <button onClick={() => void loadWorkbook('')} className="rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-300" disabled={loading}>
              {loading ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading</span> : 'Reload workbook'}
            </button>
            <button onClick={() => void exportWorkbook()} className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950">
              <span className="flex items-center gap-2"><Download className="h-4 w-4" />Export workbook</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/30">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Operations overview</h2>
              <p className="text-sm text-slate-400">{message}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
              <label className="text-slate-400">Shared workbook</label>
              <select value={selectedWorkbook} onChange={(event) => {
                const workbookName = event.target.value;
                setSelectedWorkbook(workbookName);
                void loadWorkbook(workbookName);
              }} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-100">
                <option value="">Default seed workbook</option>
                {workbookNames.map((workbook) => (
                  <option key={workbook} value={workbook}>{workbook}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricsCards.map((card) => (
              <div key={card.label} className={`rounded-2xl bg-gradient-to-br ${card.tone} p-4 text-white`}>
                <div className="mb-3 inline-flex rounded-2xl bg-white/15 p-2">
                  <card.icon className="h-5 w-5" />
                </div>
                <p className="text-sm text-white/80">{card.label}</p>
                <p className="text-3xl font-semibold">{card.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/30">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Modality distribution</h3>
                <p className="text-sm text-slate-400">Online vs face-to-face stream mix</p>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-300">
                {metrics.substituteRate}% substitute coverage
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                    {chartData.map((entry, index) => (
                      <Cell key={entry.name} fill={modalityColors[index % modalityColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/30">
            <h3 className="mb-4 text-lg font-semibold">Tracking controls</h3>
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <p className="text-sm text-slate-400">Selected rows</p>
                <p className="text-2xl font-semibold">{selectedIds.length}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['Present', 'Absent', 'Rescheduled', 'Pending'] as AttendanceStatus[]).map((status) => (
                  <button key={status} onClick={() => void updateSelectedStatus(status)} className={`rounded-full border px-3 py-2 text-sm ${statusPalette[status]}`}>
                    Mark {status}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
                <div className="mb-2 flex items-center gap-2 text-sky-300"><UserRoundCog className="h-4 w-4" />Delegation monitoring</div>
                <p>Rows showing a substitute facilitator are flagged in the grid and contribute to the substitute coverage metric.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
                <div className="mb-2 flex items-center gap-2 text-amber-300"><BarChart3 className="h-4 w-4" />Deviation tracking</div>
                <p>{discrepancyCount} sessions show a timing variance beyond the 15-minute tolerance window.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-slate-950/30">
          <div className="border-b border-white/10 p-4">
            <h3 className="text-lg font-semibold">Session operations grid</h3>
            <p className="text-sm text-slate-400">Select rows to update attendance states in bulk or edit each row directly for the daily report.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-slate-950/60 text-left text-slate-400">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === sessions.length}
                      onChange={() => setSelectedIds(selectedIds.length === sessions.length ? [] : sessions.map((item) => item.id))}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                    />
                  </th>
                  <th className="px-3 py-3">Course</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Centre</th>
                  <th className="px-3 py-3">Modality</th>
                  <th className="px-3 py-3">Scheduled</th>
                  <th className="px-3 py-3">Actual</th>
                  <th className="px-3 py-3">Participants</th>
                  <th className="px-3 py-3">Facilitator</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sessions.map((session) => {
                  const isSelected = selectedIds.includes(session.id);
                  return (
                    <tr key={session.id} className={isSelected ? 'bg-sky-500/10' : 'bg-transparent'}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelectedIds((current) => (current.includes(session.id) ? current.filter((id) => id !== session.id) : [...current, session.id]))}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-100">{session.courseName || session.courseCode}</div>
                        <div className="text-xs text-slate-500">{session.courseCode}</div>
                      </td>
                      <td className="px-3 py-3">{session.date}</td>
                      <td className="px-3 py-3">{session.centre}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${session.modality === 'Online' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'}`}>
                          {session.modality}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <input type="time" value={session.startTime} onChange={(event) => updateSessionValue(session.id, 'startTime', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                          <input type="time" value={session.endTime} onChange={(event) => updateSessionValue(session.id, 'endTime', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <input type="time" value={session.actualStart} onChange={(event) => updateSessionValue(session.id, 'actualStart', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                          <input type="time" value={session.actualEnd} onChange={(event) => updateSessionValue(session.id, 'actualEnd', event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input type="number" min="0" value={session.participants} onChange={(event) => updateSessionValue(session.id, 'participants', Number(event.target.value))} className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <input type="text" value={session.substitute} onChange={(event) => updateSessionValue(session.id, 'substitute', event.target.value)} placeholder="Substitute" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                          <label className="flex items-center gap-2 text-xs text-slate-400">
                            <input type="checkbox" checked={session.delegated} onChange={(event) => updateSessionValue(session.id, 'delegated', event.target.checked)} className="h-3 w-3 rounded border-slate-700 bg-slate-900" />
                            Delegated
                          </label>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          <select value={session.status} onChange={(event) => updateSessionValue(session.id, 'status', event.target.value as AttendanceStatus)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs">
                            {(['Present', 'Absent', 'Rescheduled', 'Pending'] as AttendanceStatus[]).map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <span className={`rounded-full border px-2 py-1 text-center text-xs ${statusPalette[session.status]}`}>{session.status}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => updateSessionValue(session.id, 'status', 'Present')} className="rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300">
                          Present
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
