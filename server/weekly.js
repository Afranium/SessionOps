import crypto from 'node:crypto';

import { displayCell, normalizeTime, normalizeDate, dayName } from './excel.js';

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DATE_LABEL = new RegExp(
  `\\b(${WEEKDAYS.join('|')})\\b[,\\s]*(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+([a-z]{3,9})[,\\s]*(\\d{4})?`,
  'i'
);

const HEADER_FIELDS = [
  ['programme', /\bprogram(me)?\b/],
  ['courseCode', /\bcourse\s*(code|no|number)\b/],
  ['courseTitle', /\bcourse\s*(title|name)\b/],
  ['modality', /\b(online\s*\/\s*f2f|online\/f2f|modality|mode|delivery)\b/],
  ['facilitator', /\b(lead\s+)?facilitator\b/],
  ['facilitatorPresent', /\bfacilitator\s+present\b/],
  ['staffId', /\bstaff\s*id\b/],
  ['start', /\b(s\s*time|start\s*time|start)\b/],
  ['end', /\b(e\s*time|end\s*time|end)\b/],
  ['expectedHours', /\b(expected\s*hours|actual\s*duration|duration)\b/],
  ['participants', /\b(n[o0]\.?|number)\s*of\s*(students?|parti\w+)\b|\b(students?|parti\w+)\b/],
  ['venue', /\bvenue\b/],
  ['videoStatus', /\b(video\s*(status|editing\s*status)|video)\b/],
  ['assignedEditor', /\b(assigned\s*(personnel|to\s*edit)|saturday\s*editors?)\b/],
  ['zoomMail', /\bzoom\s*mail\b/],
  ['zoomPassword', /\bzoom\s*password\b/],
  ['meetingId', /\bmeeting\s*id\b/],
  ['meetingCode', /\bmeeting\s*code\b/],
  ['zoomLink', /\b(zoom\s*links?|account\s*\/\s*link)\b/],
  ['contact', /\b(contact|phone|mobile|telephone)\b/]
];

const normalizeHeader = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9/. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clean = (value) =>
  String(value ?? '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function cell(row, index) {
  if (index === undefined || index === null || index < 0) return '';
  return row[index];
}

function textCell(row, index) {
  return clean(displayCell(cell(row, index)));
}

function dateFromParts(year, month, day) {
  if (!month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.valueOf())) return '';
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Read "SATURDAY 24TH JANUARY 2026", "SUNDAY 1ST MARCH,2026" or a real date cell.
 * `academicYear` is { start, end } taken from the workbook filename, used when the
 * label has no year or carries the wrong one.
 */
export function parseDateLabel(value, academicYear) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    if (value.getFullYear() < 1900) return null;
    const iso = normalizeDate(value);
    return iso ? { date: iso, weekday: WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()], labelled: false } : null;
  }

  const text = clean(value);
  const match = text.match(DATE_LABEL);
  if (!match) return null;

  const weekday = match[1].toLowerCase();
  const day = Number(match[2]);
  const month = MONTHS[match[3].toLowerCase()];
  if (!month) return null;

  const labelYear = match[4] ? Number(match[4]) : null;
  let year = labelYear;
  if (academicYear) {
    const expected = month >= 9 ? academicYear.start : academicYear.end;
    if (!year || year !== expected) year = expected;
  }
  if (!year) year = new Date().getFullYear();

  const date = dateFromParts(year, month, day);
  if (!date) return null;
  return {
    date,
    weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
    labelled: true,
    labelYear
  };
}

/**
 * Fall back to the dates printed inside the workbook when the filename has no
 * academic year. A January–August label marks the end of the academic year;
 * a September–December label marks its start.
 */
export function inferAcademicYear(sheets) {
  let spring = null;
  let autumn = null;

  for (const sheet of sheets) {
    for (const row of sheet.rows.slice(0, 400)) {
      for (let column = 0; column < Math.min(row.length, 4); column += 1) {
        const text = clean(row[column]);
        const match = text.match(DATE_LABEL);
        if (!match || !match[4]) continue;
        const month = MONTHS[match[3].toLowerCase()];
        const year = Number(match[4]);
        if (!month || !year) continue;
        if (month >= 9) autumn = autumn === null ? year : Math.min(autumn, year);
        else spring = spring === null ? year : Math.max(spring, year);
      }
    }
  }

  if (spring !== null) return { start: spring - 1, end: spring };
  if (autumn !== null) return { start: autumn, end: autumn + 1 };
  return null;
}

export function academicYearFromFilename(filename) {
  const match = String(filename ?? '').match(/(20\d{2})\s*[_/.-]\s*(20\d{2})/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) return null;
  return { start, end };
}

function findDateRow(rows, from, academicYear) {
  for (let index = from; index < rows.length; index += 1) {
    const row = rows[index] || [];
    for (let column = 0; column < Math.min(row.length, 4); column += 1) {
      const parsed = parseDateLabel(row[column], academicYear);
      if (parsed) return { index, ...parsed };
    }
  }
  return null;
}

function findHeaderRow(rows, from) {
  for (let index = from; index < Math.min(rows.length, from + 10); index += 1) {
    const row = rows[index] || [];
    const normalized = row.map(normalizeHeader);
    const hasCode = normalized.some((header) => /course\s*(code|title|name)/.test(header));
    const hasProgramme = normalized.some((header) => /program/.test(header));
    if (hasCode && hasProgramme) return index;
  }
  return -1;
}

export function mapWeeklyHeaders(headers) {
  const mapping = {};
  const normalized = headers.map(normalizeHeader);
  let contactSeen = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const header = normalized[index];
    if (!header) continue;

    for (const [field, pattern] of HEADER_FIELDS) {
      if (!pattern.test(header)) continue;

      if (field === 'contact') {
        contactSeen += 1;
        const key = contactSeen === 1 ? 'facilitatorPhone' : 'presentPhone';
        if (mapping[key] === undefined) mapping[key] = index;
        break;
      }

      // "FACILITATOR PRESENT" must not also claim the lead facilitator column.
      if (field === 'facilitator' && /present/.test(header)) continue;
      if (mapping[field] !== undefined) break;

      mapping[field] = index;
      break;
    }
  }

  return mapping;
}

function parseAcademicYear(filename) {
  return academicYearFromFilename(filename);
}

function programmeYear(programme) {
  const match = String(programme).match(/\b(?:year|yr)\s*(\d)\b/i);
  return match ? match[1] : '';
}

function programmeLevel(programme) {
  return /^(msc|mphil|phd|ma|mba|m\.)/i.test(String(programme).trim()) ? 'Postgraduate' : 'Undergraduate';
}

function normalizedName(value) {
  return clean(value).toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ');
}

function blockFromSheet(sheetName) {
  const match = String(sheetName).match(/block\s*(\d)/i);
  return match ? `Block ${match[1]}` : '';
}

function modalityFrom(row, mapping) {
  const explicit = textCell(row, mapping.modality).toLowerCase();
  const venue = textCell(row, mapping.venue).toLowerCase();
  const source = explicit || venue;
  if (/online|virtual|zoom|remote/.test(source)) return 'Online';
  if (/f2f|face/.test(source)) return 'Face-to-Face';
  if (/online/.test(source)) return 'Online';
  return 'Face-to-Face';
}

function centreFrom(row, mapping) {
  const venue = textCell(row, mapping.venue);
  if (!venue) return '';
  const lower = venue.toLowerCase();
  if (/online|virtual|zoom|remote/.test(lower)) return 'Online';
  const places = venue
    .split(/\s*(?:,|and|&|\/)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part && !/^(fully|online|f2f|face|to)$/i.test(part))
    .map((part) => part.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()));
  return [...new Set(places)].join(', ') || venue;
}

function participantsValue(row, mapping) {
  const raw = cell(row, mapping.participants);
  const text = clean(displayCell(raw));
  if (!text) return { participants: 0, postponed: false };
  if (/postpon|suspend|cancel/i.test(text)) return { participants: 0, postponed: true };
  const number = Number(String(text).replace(/[^0-9.]/g, ''));
  return { participants: Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0, postponed: false };
}

function extraFrom(row, headers, mapping) {
  const used = new Set(Object.values(mapping));
  const extra = {};
  headers.forEach((header, index) => {
    if (used.has(index)) return;
    const label = clean(header);
    if (!label) return;
    const value = textCell(row, index);
    if (value) extra[label] = value;
  });
  return extra;
}

function buildSectionRecords(sheetName, section, academicYear) {
  const { date, weekday, headerRow, headers, mapping, rows } = section;
  const records = [];
  let programme = '';
  let skipped = 0;

  for (const row of rows) {
    const programmeCell = textCell(row, mapping.programme);
    if (programmeCell) programme = programmeCell;

    const courseCode = textCell(row, mapping.courseCode);
    const courseTitle = textCell(row, mapping.courseTitle);
    if (!courseCode && !courseTitle) {
      skipped += 1;
      continue;
    }

    const lead = textCell(row, mapping.facilitator);
    const present = textCell(row, mapping.facilitatorPresent);
    const startTime = normalizeTime(cell(row, mapping.start));
    const endTime = normalizeTime(cell(row, mapping.end));
    const { participants, postponed } = participantsValue(row, mapping);
    const delegated = Boolean(present) && normalizedName(present) !== normalizedName(lead);
    const status = postponed ? 'Rescheduled' : participants > 0 || startTime || present ? 'Present' : 'Pending';

    const key = crypto
      .createHash('sha1')
      .update([courseCode || courseTitle, date, programme, lead].join('|').toLowerCase())
      .digest('hex');

    records.push({
      externalKey: key,
      date,
      day: weekday ? weekday[0].toUpperCase() + weekday.slice(1) : dayName(date),
      startTime,
      endTime,
      centre: centreFrom(row, mapping),
      modality: modalityFrom(row, mapping),
      programme,
      courseCode,
      courseTitle,
      facilitator: lead,
      facilitatorPhone: textCell(row, mapping.facilitatorPhone),
      facilitatorEmail: '',
      level: programmeLevel(programme),
      year: programmeYear(programme),
      block: blockFromSheet(sheetName),
      sheetName,
      tracking: {
        status,
        participants,
        delegated,
        substitute: delegated ? present : '',
        notes: ''
      },
      extra: extraFrom(row, headers, mapping)
    });
  }

  return { records, skipped };
}

/**
 * Find every dated section in a weekly attendance workbook. Each section has its own
 * date label and header row, because one sheet holds both the Saturday and Sunday.
 */
export function parseWeeklySheets(sheets, filename) {
  const academicYear = parseAcademicYear(filename) || inferAcademicYear(sheets);
  const sections = [];

  for (const sheet of sheets) {
    const rows = sheet.rows;
    let cursor = 0;

    const firstDate = findDateRow(rows, 0, academicYear);
    const firstHeader = findHeaderRow(rows, 0);
    if (firstHeader !== -1 && firstDate && firstHeader < firstDate.index && firstDate.weekday === 'sunday') {
      const saturday = new Date(`${firstDate.date}T00:00:00Z`);
      saturday.setUTCDate(saturday.getUTCDate() - 1);
      const iso = saturday.toISOString().slice(0, 10);
      const headers = (rows[firstHeader] || []).map(displayCell);
      const mapping = mapWeeklyHeaders(headers);
      const dataRows = rows.slice(firstHeader + 1, firstDate.index);
      const { records, skipped } = buildSectionRecords(sheet.name, {
        date: iso,
        weekday: 'saturday',
        headerRow: firstHeader,
        headers,
        mapping,
        rows: dataRows
      }, academicYear);

      if (records.length) {
        sections.push({
          id: `${sheet.name}::top`,
          sheetName: sheet.name,
          date: iso,
          weekday: 'saturday',
          labelled: false,
          labelYear: null,
          headerRow: firstHeader,
          headers,
          mapping,
          rowCount: dataRows.length,
          skipped,
          sample: dataRows.slice(0, 3).map((row) => row.map(displayCell)),
          records
        });
      }

      cursor = firstDate.index;
    }

    while (cursor < rows.length) {
      const dateRow = findDateRow(rows, cursor, academicYear);
      if (!dateRow) break;

      const headerRow = findHeaderRow(rows, dateRow.index + 1);
      if (headerRow === -1) {
        cursor = dateRow.index + 1;
        continue;
      }

      const nextDate = findDateRow(rows, headerRow + 1, academicYear);
      const end = nextDate ? nextDate.index : rows.length;
      const headers = (rows[headerRow] || []).map(displayCell);
      const mapping = mapWeeklyHeaders(headers);
      const dataRows = rows.slice(headerRow + 1, end);

      const section = {
        sheetName: sheet.name,
        date: dateRow.date,
        weekday: dateRow.weekday,
        labelled: dateRow.labelled,
        headerRow,
        headers,
        mapping,
        rows: dataRows
      };

      const { records, skipped } = buildSectionRecords(sheet.name, section, academicYear);
      if (records.length) {
        sections.push({
          id: `${sheet.name}::${dateRow.index}`,
          sheetName: sheet.name,
          date: dateRow.date,
          weekday: dateRow.weekday,
          labelled: dateRow.labelled,
          labelYear: dateRow.labelYear ?? null,
          headerRow,
          headers,
          mapping,
          rowCount: dataRows.length,
          skipped,
          sample: dataRows.slice(0, 3).map((row) => row.map(displayCell)),
          records
        });
      }

      cursor = end;
    }
  }

  return { academicYear, sections };
}
