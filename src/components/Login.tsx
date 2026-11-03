import { useState, type FormEvent } from 'react';
import { CalendarCheck2, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { login } from '../api';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060910] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.12),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(16,185,129,0.10),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl md:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden flex-col justify-between border-r border-white/[0.06] bg-gradient-to-br from-sky-500/[0.07] via-transparent to-emerald-500/[0.05] p-10 md:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-400/25">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-white">SessionOps</p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">KNUST IDL</p>
              </div>
            </div>
            <h1 className="mt-10 max-w-sm text-[28px] font-semibold leading-tight tracking-tight text-white">
              Weekend class tracking, without the spreadsheet.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              Import the timetable, mark attendance as classes run, and export the report the
              Institute already expects.
            </p>
          </div>

          <div className="space-y-3 text-sm text-slate-400">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Shared team access, one password
            </div>
            <div className="flex items-center gap-2.5">
              <CalendarCheck2 className="h-4 w-4 text-sky-400" />
              Attendance saved as you work
            </div>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-400/25">
              <CalendarCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">SessionOps</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">KNUST IDL</p>
            </div>
          </div>

          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">IT team access</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-400">Enter the shared team password to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Team password</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:bg-white/[0.05] focus:ring-4 focus:ring-sky-400/10"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3.5 py-2.5 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!password || busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Signing in' : 'Enter workspace'}
            </button>
          </form>

          <p className="mt-8 text-[11px] leading-relaxed text-slate-600">
            Access is limited to the IT team. Contact the administrator if the password has changed.
          </p>
        </div>
      </div>
    </div>
  );
}
