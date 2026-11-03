import crypto from 'node:crypto';
import xlsx from 'xlsx';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function readSheets(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  return workbook.SheetNames.map((name) => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false
    });
    return { name, rows };
  });
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoFromParts(year, month, day) {
  if (!year || !month || !day) return '';
  if (year < 100) year += year > 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.valueOf())) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function isoFromDateObject(value) {
  if (value.getFullYear() < 1900) return '';
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return isoFromDateObject(value);

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      return isoFromDateObject(new Date(ms));
    }
    return '';
  }

  const text = String(value).trim();
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const year = Number(dmy[3]);
    // Day-first unless the first number cannot be a day.
    const day = first <= 12 && second > 12 ? second : first;
    const month = first <= 12 && second > 12 ? first : second;
    return isoFromParts(year, month, day);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.valueOf())) return isoFromDateObject(parsed);
  return '';
}

function timeFromDateObject(value) {
  // Excel time cells arrive as 1899-12-30T...Z. Read those in UTC so the clock
  // time does not shift with the server's timezone.
  const useUtc = value.getUTCFullYear() < 1900;
  const hours = useUtc ? value.getUTCHours() : value.getHours();
  const minutes = useUtc ? value.getUTCMinutes() : value.getMinutes();
  return `${pad(hours)}:${pad(minutes)}`;
}

export function normalizeTime(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return timeFromDateObject(value);

  if (typeof value === 'number' && Number.isFinite(value)) {
    let fraction = value;
    if (value > 1) fraction = value - Math.floor(value);
    if (fraction < 0 || fraction >= 1) return '';
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  }

  const text = String(value).trim();
  if (!text) return '';

  const twelve = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (twelve) {
    let hour = Number(twelve[1]) % 12;
    if (/pm/i.test(twelve[3])) hour += 12;
    return `${pad(hour)}:${pad(Number(twelve[2] || 0))}`;
  }

  const twentyFour = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 23 || minute > 59) return '';
    return `${pad(hour)}:${pad(minute)}`;
  }

  // Bare hour ("9") or compact time ("800", "1230") typed by hand.
  const bareHour = text.match(/^(\d{1,2})$/);
  if (bareHour && Number(bareHour[1]) <= 23) return `${pad(Number(bareHour[1]))}:00`;

  const compact = text.match(/^(\d{3,4})$/);
  if (compact) {
    const digits = compact[1].padStart(4, '0');
    const hour = Number(digits.slice(0, 2));
    const minute = Number(digits.slice(2));
    if (hour <= 23 && minute <= 59) return `${pad(hour)}:${pad(minute)}`;
    return '';
  }

  if (/^\d+(\.\d+)?$/.test(text)) return normalizeTime(Number(text));
  return '';
}

export function normalizeModality(value) {
  const text = String(value ?? '').toLowerCase();
  if (/online|virtual|zoom|remote|teams/.test(text)) return 'Online';
  return 'Face-to-Face';
}

export function dayName(isoDate) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return '';
  return DAY_NAMES[date.getDay()] || '';
}

const HEADER_WORDS = /date|day|time|course|code|title|facilitat|lectur|tutor|program|centre|center|location|modality|mode|level|year|block|phone|email|venue|session/i;

export function detectHeaderRow(rows) {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] || [];
    const filled = row.filter((cell) => String(cell ?? '').trim() !== '');
    if (filled.length < 3) continue;
    const matches = filled.filter((cell) => HEADER_WORDS.test(String(cell))).length;
    if (matches >= 2) return index;
  }
  return 0;
}

export function displayCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (value.getFullYear() < 1900) return timeFromDateObject(value);
    return isoFromDateObject(value);
  }
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) return normalizeDate(value);
    if (value >= 0 && value < 1) return normalizeTime(value);
  }
  return String(value);
}

const FIELD_SYNONYMS = {
  date: ['date', 'class date', 'session date', 'day date', 'teaching date'],
  start: ['start', 'start time', 'from', 'time from', 'scheduled start', 'starts', 'begin'],
  end: ['end', 'end time', 'to', 'time to', 'scheduled end', 'finish', 'ends'],
  courseCode: ['course code', 'code', 'course id', 'course no', 'course number', 'subject code'],
  courseTitle: ['course title', 'course name', 'course', 'subject', 'module', 'module name', 'title'],
  facilitator: ['facilitator', 'lecturer', 'tutor', 'instructor', 'teacher', 'name', 'staff', 'resource person'],
  facilitatorEmail: ['email', 'email address', 'facilitator email', 'lecturer email', 'e-mail'],
  facilitatorPhone: ['phone', 'phone number', 'mobile', 'contact', 'telephone', 'tel'],
  centre: ['centre', 'center', 'location', 'campus', 'city', 'venue', 'study centre'],
  modality: ['modality', 'mode', 'delivery', 'delivery mode', 'online/offline', 'stream'],
  programme: ['programme', 'program', 'course of study', 'department', 'discipline'],
  level: ['level', 'study level', 'undergraduate/postgraduate'],
  year: ['year', 'year of study', 'level year'],
  block: ['block', 'semester', 'term', 'module block'],
  uniqueId: ['id', 'session id', 'sn', 'no', 'number', 'index', 'reference']
};

const normalizeHeader = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function autoMap(headers) {
  const normalized = headers.map(normalizeHeader);
  const mapping = {};

  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    let bestIndex = -1;
    let bestScore = 0;
    normalized.forEach((header, index) => {
      if (!header) return;
      synonyms.forEach((synonym) => {
        let score = 0;
        if (header === synonym) score = 3;
        else if (header.includes(synonym) || synonym.includes(header)) score = 2;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
    });
    if (bestIndex >= 0 && bestScore >= 2) mapping[field] = bestIndex;
  }

  // "Course" is ambiguous. Prefer it as the title, but if there is no code column,
  // use it as the code so records can still be keyed.
  if (mapping.courseCode === undefined && mapping.courseTitle === undefined) {
    const courseIndex = normalized.findIndex((header) => header.includes('course'));
    if (courseIndex >= 0) mapping.courseTitle = courseIndex;
  }

  return mapping;
}

export function buildRecords(rows, headerRow, mapping) {
  const records = [];
  let skipped = 0;

  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const pick = (field) => {
      const column = mapping[field];
      return column === undefined || column === null ? '' : row[column];
    };

    const date = normalizeDate(pick('date'));
    const courseCode = String(pick('courseCode') ?? '').trim();
    const courseTitle = String(pick('courseTitle') ?? '').trim();

    if (!date && !courseCode && !courseTitle) {
      skipped += 1;
      continue;
    }
    if (!date) {
      skipped += 1;
      continue;
    }

    const centre = String(pick('centre') ?? '').trim();
    const startTime = normalizeTime(pick('start'));
    const endTime = normalizeTime(pick('end'));
    const facilitator = String(pick('facilitator') ?? '').trim();
    const uniqueId = String(pick('uniqueId') ?? '').trim();

    const keyParts = uniqueId
      ? ['id', uniqueId]
      : [courseCode || courseTitle, date, startTime, centre, facilitator];

    const externalKey = crypto
      .createHash('sha1')
      .update(keyParts.join('|').toLowerCase())
      .digest('hex');

    records.push({
      externalKey,
      date,
      day: dayName(date),
      startTime,
      endTime,
      centre,
      modality: normalizeModality(pick('modality')),
      programme: String(pick('programme') ?? '').trim(),
      courseCode,
      courseTitle,
      facilitator,
      facilitatorPhone: String(pick('facilitatorPhone') ?? '').trim(),
      facilitatorEmail: String(pick('facilitatorEmail') ?? '').trim(),
      level: String(pick('level') ?? '').trim(),
      year: String(pick('year') ?? '').trim(),
      block: String(pick('block') ?? '').trim()
    });
  }

  return { records, skipped };
}
