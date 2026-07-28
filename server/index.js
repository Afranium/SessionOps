import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const uploadDir = path.join(__dirname, 'uploads');
const sharedDataDir = path.join(projectRoot, 'data');
const seedWorkbookPath = path.join(projectRoot, 'IDL 1ST AND 2ND SEMESTER 2025_2026.xlsx');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(sharedDataDir, { recursive: true });

const app = express();
const upload = multer({ dest: uploadDir });

app.use(cors());
app.use(express.json());

const normalize = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const getValue = (row, keys) => {
  const lookup = Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value;
    return acc;
  }, {});

  for (const key of keys) {
    const value = lookup[normalizeKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const formatTimeValue = (value) => {
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';
    if (text.includes('T')) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.valueOf())) {
        return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
      }
    }
    if (/^\d{1,2}:\d{2}/.test(text)) {
      return text;
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
      const totalMinutes = Math.round(Number(text) * 24 * 60);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return text;
  }

  return '';
};

const toMinutes = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text) return 0;
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }
  return 0;
};

const parseWorkbook = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(firstSheet, { defval: '' });
};

const buildMetrics = (sessions) => ({
  totalClasses: sessions.length,
  onlineClasses: sessions.filter((item) => item.modality === 'Online').length,
  faceToFaceClasses: sessions.filter((item) => item.modality === 'Face-to-Face').length,
  totalHours: (sessions.reduce((sum, item) => sum + item.durationMins, 0) / 60).toFixed(1),
  substituteRate: ((sessions.filter((item) => item.delegated).length / Math.max(1, sessions.length)) * 100).toFixed(1)
});

const buildSessionRecord = (row, index) => {
  const courseName = normalize(getValue(row, ['Course Name', 'Course Title', 'Course', 'Subject', 'Module', 'Module Name', 'Title', 'Name'])) || '';
  const courseCode = normalize(getValue(row, ['Course Code', 'CourseCode', 'Code', 'Course ID'])) || courseName || `COURSE-${index + 1}`;
  const date = normalize(getValue(row, ['Date', 'date'])) || '';
  const centre = normalize(getValue(row, ['Centre', 'Centre Location', 'Location', 'Center', 'Center Location'])) || 'Main Campus';
  const modalityValue = String(normalize(getValue(row, ['Modality', 'Mode', 'Delivery', 'Delivery Mode'])) || 'Face-to-Face').toLowerCase();
  const startTime = formatTimeValue(getValue(row, ['Start Time', 'Start', 'Scheduled Start']));
  const endTime = formatTimeValue(getValue(row, ['End Time', 'End', 'Scheduled End']));
  const actualStart = formatTimeValue(getValue(row, ['Actual Start', 'Actual Start Time', 'Time Started'])) || startTime;
  const actualEnd = formatTimeValue(getValue(row, ['Actual End', 'Actual End Time', 'Time Ended'])) || endTime;
  const durationMins = Math.max(0, toMinutes(endTime) - toMinutes(startTime));
  const participantsValue = Number(normalize(getValue(row, ['Participants', 'No. of Participants', 'Number of Participants'])) || 0);
  const delegatedValue = String(normalize(getValue(row, ['Did Lecturer Assign Someone Else?', 'Delegate', 'Delegated', 'Substitute Assigned'])) || 'No');
  const substituteValue = normalize(getValue(row, ['Substitute Facilitator Name', 'Substitute', 'Facilitator', 'Lecturer', 'Tutor', 'Instructor'])) || '';
  const facilitatorValue = normalize(getValue(row, ['Facilitator', 'Lecturer', 'Tutor', 'Instructor', 'Teacher', 'Lead Facilitator'])) || substituteValue;
  const statusValue = normalize(getValue(row, ['Attendance Status', 'Status'])) || 'Pending';
  const courseKey = `${courseCode}-${date}-${centre}`.replace(/\s+/g, '-').toUpperCase();

  return {
    id: `${index + 1}`,
    courseKey,
    courseName,
    courseCode,
    date,
    centre,
    modality: modalityValue.includes('online') || modalityValue.includes('virtual') || modalityValue.includes('zoom') ? 'Online' : 'Face-to-Face',
    startTime,
    endTime,
    actualStart,
    actualEnd,
    durationMins,
    participants: Number.isFinite(participantsValue) ? participantsValue : 0,
    delegated: delegatedValue === 'Yes' || delegatedValue === 'true' || delegatedValue === '1',
    substitute: substituteValue,
    facilitator: facilitatorValue,
    status: statusValue,
    block: normalize(getValue(row, ['Block', 'block'])) || 'A'
  };
};

const toSessionsPayload = (rows) => {
  const sessions = rows.map(buildSessionRecord).filter((item) => item.courseCode || item.courseName);
  return { sessions, metrics: buildMetrics(sessions) };
};

const listWorkbookNames = () => fs.readdirSync(sharedDataDir)
  .filter((name) => name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.xls'))
  .sort();

const resolveWorkbookPath = (preferredName) => {
  if (preferredName) {
    const cleanName = preferredName.trim();
    const directPath = path.isAbsolute(cleanName) ? cleanName : path.join(sharedDataDir, cleanName);
    if (fs.existsSync(directPath)) return directPath;
    if (!cleanName.toLowerCase().endsWith('.xlsx') && !cleanName.toLowerCase().endsWith('.xls')) {
      const withExt = path.join(sharedDataDir, `${cleanName}.xlsx`);
      if (fs.existsSync(withExt)) return withExt;
    }
  }

  if (fs.existsSync(seedWorkbookPath)) return seedWorkbookPath;
  const sharedWorkbooks = listWorkbookNames();
  if (sharedWorkbooks.length) return path.join(sharedDataDir, sharedWorkbooks[0]);
  return seedWorkbookPath;
};

app.get('/api/workbooks', (_req, res) => {
  res.json({ workbooks: listWorkbookNames() });
});

app.get('/api/seed', (req, res) => {
  try {
    const workbookName = req.query.name ? String(req.query.name) : '';
    const workbookPath = resolveWorkbookPath(workbookName);
    const workbookBuffer = fs.readFileSync(workbookPath);
    const rows = parseWorkbook(workbookBuffer);
    res.json({ workbookName: path.basename(workbookPath), ...toSessionsPayload(rows) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/load-workbook', (req, res) => {
  try {
    const workbookName = req.query.name ? String(req.query.name) : '';
    const workbookPath = resolveWorkbookPath(workbookName);
    const workbookBuffer = fs.readFileSync(workbookPath);
    const rows = parseWorkbook(workbookBuffer);
    res.json({ workbookName: path.basename(workbookPath), ...toSessionsPayload(rows) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const targetPath = path.join(sharedDataDir, req.file.originalname || 'uploaded-workbook.xlsx');
    fs.copyFileSync(req.file.path, targetPath);
    const workbookBuffer = fs.readFileSync(req.file.path);
    const rows = parseWorkbook(workbookBuffer);
    const payload = toSessionsPayload(rows);
    fs.unlinkSync(req.file.path);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/template', (_req, res) => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    ['Course Name', 'Course Code', 'Date', 'Centre Location', 'Modality', 'Start Time', 'End Time', 'Participants', 'Attendance Status', 'Did Lecturer Assign Someone Else?', 'Substitute Facilitator Name', 'Facilitator']
  ]);
  sheet['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
  xlsx.utils.book_append_sheet(workbook, sheet, 'Template');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tracker-template.xlsx"');
  res.end(buffer);
});

app.post('/api/export', express.json(), (req, res) => {
  const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  const workbook = xlsx.utils.book_new();

  const rows = [
    ['Course Name', 'Course Code', 'Date', 'Centre', 'Modality', 'Start Time', 'End Time', 'Actual Start', 'Actual End', 'Duration Mins', 'Participants', 'Delegation', 'Substitute Facilitator', 'Facilitator', 'Status']
  ];
  sessions.forEach((session) => {
    rows.push([
      session.courseName || session.courseCode,
      session.courseCode,
      session.date,
      session.centre,
      session.modality,
      session.startTime,
      session.endTime,
      session.actualStart,
      session.actualEnd,
      session.durationMins,
      session.participants,
      session.delegated ? 'Yes' : 'No',
      session.substitute || '',
      session.facilitator || '',
      session.status
    ]);
  });

  const operationsSheet = xlsx.utils.aoa_to_sheet(rows);
  operationsSheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 14 }];
  xlsx.utils.book_append_sheet(workbook, operationsSheet, 'Operations');

  const summaryRows = [
    ['Metric', 'Value'],
    ['Total Classes', sessions.length],
    ['Online Classes', sessions.filter((session) => session.modality === 'Online').length],
    ['Face-to-Face Classes', sessions.filter((session) => session.modality === 'Face-to-Face').length],
    ['Substitute Coverage', `${((sessions.filter((session) => session.delegated).length / Math.max(1, sessions.length)) * 100).toFixed(1)}%`]
  ];
  const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
  xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="weekend-class-operations.xlsx"');
  res.end(buffer);
});

const port = Number(process.env.PORT || 3002);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
