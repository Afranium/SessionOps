import xlsx from 'xlsx';

function minutes(value) {
  if (!value) return null;
  const [hour, minute] = String(value).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function varianceMinutes(start, actualStart) {
  const scheduled = minutes(start);
  const actual = minutes(actualStart);
  if (scheduled === null || actual === null) return null;
  return actual - scheduled;
}

export function durationHours(start, end) {
  const from = minutes(start);
  const to = minutes(end);
  if (from === null || to === null || to <= from) return 0;
  return (to - from) / 60;
}

const COLUMNS = [
  ['Date', 'date'],
  ['Day', 'day'],
  ['Start', 'start_time'],
  ['End', 'end_time'],
  ['Programme', 'programme'],
  ['Level', 'level'],
  ['Year', 'year'],
  ['Block', 'block'],
  ['Course Code', 'course_code'],
  ['Course Title', 'course_title'],
  ['Facilitator', 'facilitator'],
  ['Phone', 'facilitator_phone'],
  ['Email', 'facilitator_email'],
  ['Centre', 'centre'],
  ['Modality (scheduled)', 'modality'],
  ['Modality (held)', 'modality_held'],
  ['Status', 'status'],
  ['Actual Start', 'actual_start'],
  ['Actual End', 'actual_end'],
  ['Participants', 'participants'],
  ['Delegated', 'delegated'],
  ['Substitute', 'substitute'],
  ['Reschedule Date', 'reschedule_date'],
  ['Reschedule Time', 'reschedule_time'],
  ['Variance (mins)', 'variance'],
  ['Notes', 'notes']
];

function appendSummarySheets(workbook, sessions) {
  const total = sessions.length;
  const present = sessions.filter((s) => s.status === 'Present').length;
  const absent = sessions.filter((s) => s.status === 'Absent').length;
  const rescheduled = sessions.filter((s) => s.status === 'Rescheduled').length;
  const pending = total - present - absent - rescheduled;
  const online = sessions.filter((s) => (s.modality_held || s.modality) === 'Online').length;
  const delegated = sessions.filter((s) => s.delegated).length;
  const scheduledHours = sessions.reduce((sum, s) => sum + durationHours(s.start_time, s.end_time), 0);
  const actualHours = sessions
    .filter((s) => s.status === 'Present')
    .reduce((sum, s) => sum + durationHours(s.actual_start || s.start_time, s.actual_end || s.end_time), 0);
  const deviations = sessions.filter((s) => {
    const value = varianceMinutes(s.start_time, s.actual_start);
    return value !== null && Math.abs(value) > 15;
  }).length;
  const attendanceBase = present + absent;

  const summaryRows = [
    ['Metric', 'Value'],
    ['Total classes', total],
    ['Present', present],
    ['Absent', absent],
    ['Rescheduled', rescheduled],
    ['Pending', pending],
    ['Attendance rate', attendanceBase ? `${((present / attendanceBase) * 100).toFixed(1)}%` : 'n/a'],
    ['Online classes', online],
    ['Face-to-face classes', total - online],
    ['Scheduled hours', scheduledHours.toFixed(1)],
    ['Actual hours (present)', actualHours.toFixed(1)],
    ['Substitute coverage', total ? `${((delegated / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Deviations over 15 minutes', deviations],
    ['Exported', new Date().toISOString()]
  ];
  const summary = xlsx.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 30 }, { wch: 28 }];
  xlsx.utils.book_append_sheet(workbook, summary, 'Summary');

  const byProgramme = new Map();
  sessions.forEach((session) => {
    const key = session.programme || 'Unassigned';
    const entry = byProgramme.get(key) || { total: 0, present: 0, absent: 0, rescheduled: 0, pending: 0 };
    entry.total += 1;
    if (session.status === 'Present') entry.present += 1;
    else if (session.status === 'Absent') entry.absent += 1;
    else if (session.status === 'Rescheduled') entry.rescheduled += 1;
    else entry.pending += 1;
    byProgramme.set(key, entry);
  });
  const programmeRows = [
    ['Programme', 'Classes', 'Present', 'Absent', 'Rescheduled', 'Pending'],
    ...[...byProgramme.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, entry]) => [name, entry.total, entry.present, entry.absent, entry.rescheduled, entry.pending])
  ];
  const programmeSheet = xlsx.utils.aoa_to_sheet(programmeRows);
  programmeSheet['!cols'] = [{ wch: 46 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 10 }];
  xlsx.utils.book_append_sheet(workbook, programmeSheet, 'By programme');
}

export function buildWorkbook(sessions) {
  const workbook = xlsx.utils.book_new();

  const rows = [COLUMNS.map(([label]) => label)];
  sessions.forEach((session) => {
    const row = COLUMNS.map(([, key]) => {
      if (key === 'modality_held') return session.modality_held || session.modality || '';
      if (key === 'status') return session.status || 'Pending';
      if (key === 'delegated') return session.delegated ? 'Yes' : 'No';
      if (key === 'variance') {
        const value = varianceMinutes(session.start_time, session.actual_start);
        return value === null ? '' : value;
      }
      return session[key] ?? '';
    });
    rows.push(row);
  });

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 34 }, { wch: 14 },
    { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 38 }, { wch: 24 }, { wch: 14 },
    { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 11 },
    { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
    { wch: 13 }, { wch: 40 }
  ];
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  sheet['!autofilter'] = { ref: xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: COLUMNS.length - 1 } }) };
  xlsx.utils.book_append_sheet(workbook, sheet, 'Tracking');

  appendSummarySheets(workbook, sessions);

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const WEEKLY_COLUMNS = [
  ['PROGRAM', 34],
  ['COURSE CODE', 12],
  ['COURSE TITLE', 38],
  ['LEAD FACILITATOR', 24],
  ['CONTACT', 14],
  ['VENUE', 18],
  ['FACILITATOR PRESENT', 24],
  ['CONTACT', 14],
  ['NO. OF STUDENTS', 12],
  ['S_TIME', 9],
  ['E_TIME', 9],
  ['EXPECTED HOURS', 12],
  ['STATUS', 12],
  ['ACTUAL START', 11],
  ['ACTUAL END', 11],
  ['MODALITY HELD', 15],
  ['DELEGATED', 10],
  ['SUBSTITUTE', 24],
  ['RESCHEDULE DATE', 14],
  ['RESCHEDULE TIME', 14],
  ['VARIANCE (MIN)', 13],
  ['NOTES', 36],
  ['VIDEO STATUS', 15],
  ['ZOOM LINK', 40]
];

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function ordinal(day) {
  if (day >= 11 && day <= 13) return `${day}TH`;
  const suffix = ['TH', 'ST', 'ND', 'RD'][day % 10] || 'TH';
  return `${day}${suffix}`;
}

function parseIso(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function sectionLabel(date) {
  const parsed = parseIso(date);
  if (!parsed) return date;
  return `${DAYS[parsed.getUTCDay()]} ${ordinal(parsed.getUTCDate())} ${MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

function weekendStart(date) {
  const parsed = parseIso(date);
  if (!parsed) return date;
  const offset = -((parsed.getUTCDay() + 1) % 7);
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function weekendLabel(start) {
  const from = parseIso(start);
  if (!from) return start;
  const to = new Date(from.valueOf());
  to.setUTCDate(to.getUTCDate() + 1);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const left = sameMonth
    ? `${from.getUTCDate()}`
    : `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()].slice(0, 3)}`;
  return `${left}-${to.getUTCDate()} ${MONTHS[to.getUTCMonth()].slice(0, 3)} ${to.getUTCFullYear()}`;
}

function parseExtra(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function extraValue(extra, pattern) {
  for (const [key, value] of Object.entries(extra)) {
    if (pattern.test(key) && value) return value;
  }
  return '';
}

function weeklyRow(session) {
  const extra = parseExtra(session.extra);
  const status = session.status || 'Pending';
  const held = session.modality_held || (status === 'Present' ? session.modality : '');
  const participants =
    status === 'Present' || status === 'Absent' ? session.participants ?? '' : '';
  const computedExpected =
    session.start_time && session.end_time
      ? durationHours(session.start_time, session.end_time)
      : '';
  const rawExpected =
    extraValue(extra, /expected\s*hours|actual\s*duration|duration/i) || computedExpected;
  const numericExpected = Number(rawExpected);
  const expected = Number.isFinite(numericExpected)
    ? Math.round(numericExpected * 100) / 100
    : rawExpected;

  return [
    session.programme || '',
    session.course_code || '',
    session.course_title || '',
    session.facilitator || '',
    session.facilitator_phone || '',
    session.centre || '',
    session.delegated ? session.substitute || '' : session.facilitator || '',
    '',
    participants,
    session.start_time || '',
    session.end_time || '',
    expected,
    status,
    session.actual_start || '',
    session.actual_end || '',
    held,
    session.delegated ? 'Yes' : 'No',
    session.substitute || '',
    session.reschedule_date || '',
    session.reschedule_time || '',
    (() => {
      const value = varianceMinutes(session.start_time, session.actual_start);
      return value === null ? '' : value;
    })(),
    session.notes || '',
    extraValue(extra, /video/i),
    extraValue(extra, /zoom|account\s*\/?\s*link/i)
  ];
}

/**
 * Recreate the school's weekend layout: one sheet per weekend, with a dated
 * Saturday section and Sunday section and the recorded attendance appended.
 */
export function buildWeeklyWorkbook(sessions) {
  const workbook = xlsx.utils.book_new();
  const groups = new Map();

  for (const session of sessions) {
    const start = weekendStart(session.date);
    const group = groups.get(start) || [];
    group.push(session);
    groups.set(start, group);
  }

  const usedNames = new Set();

  for (const [start, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rows = [];
    const merges = [];
    const byDate = new Map();

    for (const session of group) {
      const list = byDate.get(session.date) || [];
      list.push(session);
      byDate.set(session.date, list);
    }

    let firstSection = true;
    for (const [date, daySessions] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!firstSection) rows.push([]);
      firstSection = false;

      const labelIndex = rows.length;
      rows.push([sectionLabel(date)]);
      merges.push({
        s: { r: labelIndex, c: 0 },
        e: { r: labelIndex, c: WEEKLY_COLUMNS.length - 1 }
      });

      rows.push(WEEKLY_COLUMNS.map(([label]) => label));

      daySessions.sort((a, b) =>
        String(a.start_time).localeCompare(String(b.start_time)) ||
        String(a.programme).localeCompare(String(b.programme)) ||
        String(a.course_code).localeCompare(String(b.course_code))
      );

      let programmeStart = -1;
      let currentProgramme = null;

      for (const session of daySessions) {
        rows.push(weeklyRow(session));
        const rowIndex = rows.length - 1;
        if (session.programme && session.programme === currentProgramme) continue;
        if (programmeStart >= 0 && rowIndex - 1 > programmeStart) {
          merges.push({ s: { r: programmeStart, c: 0 }, e: { r: rowIndex - 1, c: 0 } });
        }
        programmeStart = rowIndex;
        currentProgramme = session.programme;
      }

      if (programmeStart >= 0 && rows.length - 1 > programmeStart) {
        merges.push({ s: { r: programmeStart, c: 0 }, e: { r: rows.length - 1, c: 0 } });
      }
    }

    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet['!cols'] = WEEKLY_COLUMNS.map(([, width]) => ({ wch: width }));
    if (merges.length) sheet['!merges'] = merges;

    let name = weekendLabel(start).slice(0, 31);
    let suffix = 2;
    while (usedNames.has(name)) {
      const extra = ` (${suffix})`;
      name = `${weekendLabel(start).slice(0, 31 - extra.length)}${extra}`;
      suffix += 1;
    }
    usedNames.add(name);
    xlsx.utils.book_append_sheet(workbook, sheet, name);
  }

  appendSummarySheets(workbook, sessions);

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
