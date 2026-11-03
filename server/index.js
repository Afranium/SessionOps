import './env.js';

import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db, listSessions, listImports, saveTracking, nowIso } from './db.js';
import { checkPassword, rateLimit, clearRateLimit, issueCookie, clearCookie, requireAuth, isAuthenticated } from './auth.js';
import { readSheets, detectHeaderRow, autoMap, buildRecords, displayCell } from './excel.js';
import { parseWeeklySheets } from './weekly.js';
import { buildWorkbook, buildWeeklyWorkbook } from './export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const name = (file.originalname || '').toLowerCase();
    const ok = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    callback(ok ? null : new Error('Only .xlsx, .xls, or .csv files are accepted'), ok);
  }
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const pendingImports = new Map();
const IMPORT_TTL_MS = 20 * 60 * 1000;

function prunePendingImports() {
  const now = Date.now();
  for (const [token, entry] of pendingImports) {
    if (now - entry.createdAt > IMPORT_TTL_MS) pendingImports.delete(token);
  }
}

function serializeTracking(row) {
  return {
    status: row.status || 'Pending',
    actualStart: row.actual_start || '',
    actualEnd: row.actual_end || '',
    participants: row.participants || 0,
    delegated: Boolean(row.delegated),
    substitute: row.substitute || '',
    modalityHeld: row.modality_held || '',
    rescheduleDate: row.reschedule_date || '',
    rescheduleTime: row.reschedule_time || '',
    notes: row.notes || '',
    updatedAt: row.updated_at || ''
  };
}

function parseExtra(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function serializeSession(row) {
  return {
    id: row.id,
    externalKey: row.external_key,
    date: row.date,
    day: row.day,
    startTime: row.start_time,
    endTime: row.end_time,
    centre: row.centre,
    modality: row.modality,
    programme: row.programme,
    courseCode: row.course_code,
    courseTitle: row.course_title,
    facilitator: row.facilitator,
    facilitatorPhone: row.facilitator_phone,
    facilitatorEmail: row.facilitator_email,
    level: row.level,
    year: row.year,
    block: row.block,
    extra: parseExtra(row.extra),
    tracking: serializeTracking(row)
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const limit = rateLimit(ip);
  if (!limit.allowed) {
    return res.status(429).json({ error: `Too many attempts. Try again in ${limit.retryAfter} seconds.` });
  }
  if (!checkPassword(req.body?.password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  clearRateLimit(ip);
  issueCookie(req, res);
  return res.json({ authenticated: true });
});

app.post('/api/logout', (_req, res) => {
  clearCookie(res);
  res.json({ authenticated: false });
});

app.use('/api', requireAuth);

app.get('/api/sessions', (_req, res) => {
  res.json({
    sessions: listSessions().map(serializeSession),
    imports: listImports()
  });
});

app.patch('/api/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid session id' });
  const exists = db.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Session not found' });

  const tracking = saveTracking(id, req.body || {});
  res.json({ tracking: serializeTracking(tracking) });
});

app.post('/api/tracking/bulk', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  const patch = req.body?.patch || {};
  if (!ids.length) return res.status(400).json({ error: 'No sessions selected' });

  const updated = [];
  for (const id of ids) {
    const exists = db.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
    if (!exists) continue;
    const tracking = saveTracking(id, patch);
    updated.push({ id, tracking: serializeTracking(tracking) });
  }
  res.json({ updated });
});

function persistRecords({ filename, sheetLabel, records, createdAt }) {
  const unique = new Map();
  for (const record of records) {
    if (!unique.has(record.externalKey)) unique.set(record.externalKey, record);
  }
  const finalRecords = [...unique.values()];
  const duplicates = records.length - finalRecords.length;

  let inserted = 0;
  let updated = 0;

  db.exec('BEGIN');
  try {
    const importResult = db
      .prepare(
        'INSERT INTO imports (filename, sheet, row_count, inserted_count, updated_count, created_at) VALUES (?, ?, ?, 0, 0, ?)'
      )
      .run(filename, sheetLabel, finalRecords.length, createdAt);
    const importId = Number(importResult.lastInsertRowid);

    const existsStatement = db.prepare('SELECT id FROM sessions WHERE external_key = ?');
    const insertStatement = db.prepare(`
      INSERT INTO sessions (
        external_key, import_id, date, day, start_time, end_time, centre, modality, programme,
        course_code, course_title, facilitator, facilitator_phone, facilitator_email, level, year, block,
        extra, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStatement = db.prepare(`
      UPDATE sessions SET
        import_id = ?, date = ?, day = ?, start_time = ?, end_time = ?, centre = ?, modality = ?,
        programme = ?, course_code = ?, course_title = ?, facilitator = ?, facilitator_phone = ?,
        facilitator_email = ?, level = ?, year = ?, block = ?, extra = ?, updated_at = ?
      WHERE external_key = ?
    `);

    for (const record of finalRecords) {
      const extra = JSON.stringify(record.extra || {});
      const existing = existsStatement.get(record.externalKey);
      if (existing) {
        updateStatement.run(
          importId, record.date, record.day, record.startTime, record.endTime, record.centre,
          record.modality, record.programme, record.courseCode, record.courseTitle, record.facilitator,
          record.facilitatorPhone, record.facilitatorEmail, record.level, record.year, record.block,
          extra, createdAt, record.externalKey
        );
        updated += 1;
      } else {
        const result = insertStatement.run(
          record.externalKey, importId, record.date, record.day, record.startTime, record.endTime,
          record.centre, record.modality, record.programme, record.courseCode, record.courseTitle,
          record.facilitator, record.facilitatorPhone, record.facilitatorEmail, record.level,
          record.year, record.block, extra, createdAt, createdAt
        );
        // Pre-fill tracking only for new classes so a re-import never overwrites work.
        if (record.tracking) saveTracking(Number(result.lastInsertRowid), record.tracking);
        inserted += 1;
      }
    }

    db.prepare('UPDATE imports SET inserted_count = ?, updated_count = ? WHERE id = ?').run(inserted, updated, importId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { inserted, updated, duplicates, total: finalRecords.length };
}

function summarizeWeekly(weekly) {
  const sections = weekly.sections.map((section) => {
    const summary = {
      Present: 0,
      Pending: 0,
      Rescheduled: 0,
      Absent: 0,
      delegated: 0,
      withTimes: 0
    };
    for (const record of section.records) {
      const status = record.tracking?.status || 'Pending';
      summary[status] = (summary[status] || 0) + 1;
      if (record.tracking?.delegated) summary.delegated += 1;
      if (record.startTime) summary.withTimes += 1;
    }

    const warnings = [];
    if (section.weekday !== 'saturday' && section.weekday !== 'sunday') {
      warnings.push(`Date falls on a ${section.weekday}`);
    }
    if (section.records.length < 3) {
      warnings.push(`Only ${section.records.length} class row${section.records.length === 1 ? '' : 's'} found`);
    }
    if (section.labelYear && section.labelYear !== Number(section.date.slice(0, 4))) {
      warnings.push(`Sheet says ${section.labelYear}, using ${section.date.slice(0, 4)}`);
    }
    if (weekly.sections.filter((item) => item.date === section.date).length > 1) {
      warnings.push(`Another section also uses ${section.date}`);
    }

    return {
      id: section.id,
      sheetName: section.sheetName,
      date: section.date,
      weekday: section.weekday,
      rowCount: section.rowCount,
      skipped: section.skipped,
      recordCount: section.records.length,
      summary,
      warnings,
      courses: section.records
        .slice(0, 5)
        .map((record) => record.courseCode || record.courseTitle)
        .filter(Boolean)
    };
  });

  return { mode: 'weekly', academicYear: weekly.academicYear, sections };
}

app.post('/api/import/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    prunePendingImports();

    const filename = req.file.originalname || 'timetable.xlsx';
    const sheets = readSheets(req.file.buffer);
    const weekly = parseWeeklySheets(sheets, filename);
    const isWeekly = weekly.sections.length >= 2 && weekly.sections.some((section) => section.labelled);

    const token = crypto.randomUUID();
    pendingImports.set(token, { buffer: req.file.buffer, filename, createdAt: Date.now() });

    if (isWeekly) {
      return res.json({ token, filename, ...summarizeWeekly(weekly) });
    }

    const flatSheets = sheets.map((sheet) => {
      const headerRow = detectHeaderRow(sheet.rows);
      const headers = (sheet.rows[headerRow] || []).map(displayCell);
      const previewRows = sheet.rows
        .slice(headerRow + 1, headerRow + 26)
        .map((row) => row.map(displayCell));

      return {
        name: sheet.name,
        headerRow,
        headers,
        rowCount: Math.max(0, sheet.rows.length - headerRow - 1),
        rows: sheet.rows.slice(0, 40).map((row) => row.map(displayCell)),
        previewRows,
        suggestedMapping: autoMap(headers)
      };
    });

    res.json({ token, filename, mode: 'flat', sheets: flatSheets });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not read the workbook' });
  }
});

app.post('/api/import/commit', (req, res) => {
  try {
    const { token, sheetName, headerRow, mapping } = req.body || {};
    const pending = pendingImports.get(token);
    if (!pending) return res.status(400).json({ error: 'This upload has expired. Please choose the file again.' });

    const sheet = readSheets(pending.buffer).find((item) => item.name === sheetName);
    if (!sheet) return res.status(400).json({ error: 'Sheet not found in the uploaded workbook' });

    const rowIndex = Number.isInteger(headerRow) ? headerRow : detectHeaderRow(sheet.rows);
    const { records, skipped } = buildRecords(sheet.rows, rowIndex, mapping || {});
    if (!records.length) {
      return res.status(400).json({ error: 'No usable rows found. Check that Date and Course columns are mapped.' });
    }

    const summary = persistRecords({
      filename: pending.filename,
      sheetLabel: sheetName,
      records,
      createdAt: nowIso()
    });

    pendingImports.delete(token);
    res.json({ ...summary, skipped });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Import failed' });
  }
});

app.post('/api/import/weekly/commit', (req, res) => {
  try {
    const { token, sectionIds } = req.body || {};
    const pending = pendingImports.get(token);
    if (!pending) return res.status(400).json({ error: 'This upload has expired. Please choose the file again.' });

    const weekly = parseWeeklySheets(readSheets(pending.buffer), pending.filename);
    const wanted = Array.isArray(sectionIds) && sectionIds.length
      ? new Set(sectionIds.map(String))
      : null;
    const sections = wanted ? weekly.sections.filter((section) => wanted.has(section.id)) : weekly.sections;
    if (!sections.length) {
      return res.status(400).json({ error: 'Select at least one weekend section to import.' });
    }

    const records = sections.flatMap((section) => section.records);
    const skipped = sections.reduce((total, section) => total + section.skipped, 0);
    const summary = persistRecords({
      filename: pending.filename,
      sheetLabel: `Weekly workbook (${sections.length} sections)`,
      records,
      createdAt: nowIso()
    });

    pendingImports.delete(token);
    res.json({ ...summary, skipped, sections: sections.length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Import failed' });
  }
});

app.get('/api/imports', (_req, res) => {
  res.json({ imports: listImports() });
});

app.post('/api/export', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  const layout = req.body?.layout === 'tracking' ? 'tracking' : 'weekly';
  const all = listSessions();
  const rows = ids ? all.filter((row) => ids.includes(row.id)) : all;
  if (!rows.length) return res.status(400).json({ error: 'Nothing to export' });

  const buffer = layout === 'weekly' ? buildWeeklyWorkbook(rows) : buildWorkbook(rows);
  const name = layout === 'weekly' ? 'IDL-weekend-attendance' : 'session-tracking';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.end(buffer);
});

app.use(express.static(distDir));

app.get(/^(?!\/api).*/, (_req, res, next) => {
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) return next();
  res.sendFile(indexFile);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Unexpected server error' });
});

const port = Number(process.env.PORT || 3002);
app.listen(port, () => {
  console.log(`SessionOps listening on http://localhost:${port}`);
});
