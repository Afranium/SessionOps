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

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
