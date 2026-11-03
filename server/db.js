import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export const dbPath = process.env.DB_PATH || path.join(projectRoot, 'data', 'sessionops.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    sheet TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_key TEXT NOT NULL UNIQUE,
    import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
    date TEXT NOT NULL DEFAULT '',
    day TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL DEFAULT '',
    end_time TEXT NOT NULL DEFAULT '',
    centre TEXT NOT NULL DEFAULT '',
    modality TEXT NOT NULL DEFAULT 'Face-to-Face',
    programme TEXT NOT NULL DEFAULT '',
    course_code TEXT NOT NULL DEFAULT '',
    course_title TEXT NOT NULL DEFAULT '',
    facilitator TEXT NOT NULL DEFAULT '',
    facilitator_phone TEXT NOT NULL DEFAULT '',
    facilitator_email TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    block TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracking (
    session_id INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Pending',
    actual_start TEXT NOT NULL DEFAULT '',
    actual_end TEXT NOT NULL DEFAULT '',
    participants INTEGER NOT NULL DEFAULT 0,
    delegated INTEGER NOT NULL DEFAULT 0,
    substitute TEXT NOT NULL DEFAULT '',
    modality_held TEXT NOT NULL DEFAULT '',
    reschedule_date TEXT NOT NULL DEFAULT '',
    reschedule_time TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
  CREATE INDEX IF NOT EXISTS idx_sessions_programme ON sessions(programme);
  CREATE INDEX IF NOT EXISTS idx_sessions_centre ON sessions(centre);
  CREATE INDEX IF NOT EXISTS idx_tracking_status ON tracking(status);
`);

const trackingColumns = db.prepare('PRAGMA table_info(tracking)').all().map((column) => column.name);
if (!trackingColumns.includes('modality_held')) {
  db.exec("ALTER TABLE tracking ADD COLUMN modality_held TEXT NOT NULL DEFAULT ''");
}

export const nowIso = () => new Date().toISOString();

export function listSessions() {
  return db
    .prepare(
      `SELECT
        s.id, s.external_key, s.date, s.day, s.start_time, s.end_time, s.centre, s.modality,
        s.programme, s.course_code, s.course_title, s.facilitator, s.facilitator_phone,
        s.facilitator_email, s.level, s.year, s.block,
        t.status, t.actual_start, t.actual_end, t.participants, t.delegated, t.substitute,
        t.modality_held, t.reschedule_date, t.reschedule_time, t.notes, t.updated_at
      FROM sessions s
      LEFT JOIN tracking t ON t.session_id = s.id
      ORDER BY s.date ASC, s.start_time ASC, s.course_code ASC`
    )
    .all();
}

export function listImports() {
  return db.prepare('SELECT * FROM imports ORDER BY created_at DESC').all();
}

export function getTracking(sessionId) {
  return db.prepare('SELECT * FROM tracking WHERE session_id = ?').get(sessionId);
}

const TRACKING_FIELDS = [
  'status',
  'actual_start',
  'actual_end',
  'participants',
  'delegated',
  'substitute',
  'modality_held',
  'reschedule_date',
  'reschedule_time',
  'notes'
];

export function saveTracking(sessionId, patch, updatedBy = '') {
  const current = getTracking(sessionId);
  const merged = {
    status: patch.status ?? current?.status ?? 'Pending',
    actual_start: patch.actualStart ?? current?.actual_start ?? '',
    actual_end: patch.actualEnd ?? current?.actual_end ?? '',
    participants: patch.participants ?? current?.participants ?? 0,
    delegated: patch.delegated ?? current?.delegated ?? 0,
    substitute: patch.substitute ?? current?.substitute ?? '',
    modality_held: patch.modalityHeld ?? current?.modality_held ?? '',
    reschedule_date: patch.rescheduleDate ?? current?.reschedule_date ?? '',
    reschedule_time: patch.rescheduleTime ?? current?.reschedule_time ?? '',
    notes: patch.notes ?? current?.notes ?? ''
  };

  const values = {
    ...merged,
    participants: Number.isFinite(Number(merged.participants)) ? Math.max(0, Number(merged.participants)) : 0,
    delegated: merged.delegated ? 1 : 0,
    updated_at: nowIso(),
    updated_by: updatedBy
  };

  db.prepare(
    `INSERT INTO tracking (session_id, ${TRACKING_FIELDS.join(', ')}, updated_at, updated_by)
     VALUES (?, ${TRACKING_FIELDS.map(() => '?').join(', ')}, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       ${TRACKING_FIELDS.map((field) => `${field} = excluded.${field}`).join(', ')},
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  ).run(
    sessionId,
    ...TRACKING_FIELDS.map((field) => values[field]),
    values.updated_at,
    values.updated_by
  );

  return getTracking(sessionId);
}
