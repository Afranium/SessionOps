import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';

import {
  normalizeDate,
  normalizeTime,
  normalizeModality,
  dayName,
  detectHeaderRow,
  autoMap,
  buildRecords
} from '../server/excel.js';
import { buildWorkbook, varianceMinutes } from '../server/export.js';

test('normalizeDate handles Excel serials, dates and text', () => {
  assert.equal(normalizeDate(new Date(2026, 5, 6)), '2026-06-06');
  assert.equal(normalizeDate(46179), '2026-06-06');
  assert.equal(normalizeDate('2026-06-06'), '2026-06-06');
  assert.equal(normalizeDate('2026-06-06T00:00:00.000Z'), '2026-06-06');
  assert.equal(normalizeDate('06/06/2026'), '2026-06-06');
  assert.equal(normalizeDate('23/08/2026'), '2026-08-23');
  assert.equal(normalizeDate(''), '');
  assert.equal(normalizeDate('not a date'), '');
});

test('normalizeDate treats day-first dates as day-first', () => {
  assert.equal(normalizeDate('13/02/2026'), '2026-02-13');
  assert.equal(normalizeDate('02/13/2026'), '2026-02-13');
});

test('normalizeTime handles serials, dates and text', () => {
  assert.equal(normalizeTime(0.5), '12:00');
  assert.equal(normalizeTime(0.3333333333), '08:00');
  assert.equal(normalizeTime(new Date(2026, 5, 6, 13, 45)), '13:45');
  assert.equal(normalizeTime('8:00 AM'), '08:00');
  assert.equal(normalizeTime('12:30 pm'), '12:30');
  assert.equal(normalizeTime('12:15 AM'), '00:15');
  assert.equal(normalizeTime('13:45'), '13:45');
  assert.equal(normalizeTime('9'), '09:00');
  assert.equal(normalizeTime('800'), '08:00');
  assert.equal(normalizeTime('1230'), '12:30');
  assert.equal(normalizeTime('25:00'), '');
  assert.equal(normalizeTime(''), '');
});

test('normalizeModality maps delivery wording', () => {
  assert.equal(normalizeModality('Online'), 'Online');
  assert.equal(normalizeModality('virtual via Zoom'), 'Online');
  assert.equal(normalizeModality('Face to Face'), 'Face-to-Face');
  assert.equal(normalizeModality(''), 'Face-to-Face');
});

test('dayName derives the weekday from an ISO date', () => {
  assert.equal(dayName('2026-06-06'), 'Saturday');
  assert.equal(dayName('2026-06-07'), 'Sunday');
  assert.equal(dayName(''), '');
});

test('detectHeaderRow skips title rows', () => {
  const rows = [
    ['KNUST IDL Weekend Timetable'],
    [],
    ['Session', 'Date', 'Start Time', 'End Time', 'Course Code', 'Facilitator'],
    [1, '2026-06-06', '8:00 AM', '12:30 PM', 'CSM 352', 'Rose-Mary Mensah']
  ];
  assert.equal(detectHeaderRow(rows), 2);
});

test('autoMap matches a typical timetable header', () => {
  const headers = [
    'Session ID',
    'Date',
    'Day',
    'Start Time',
    'End Time',
    'Programme',
    'Level',
    'Year',
    'Block',
    'Course Code',
    'Course Title',
    'Facilitator',
    'Facilitator Email',
    'Centre',
    'Modality'
  ];
  const mapping = autoMap(headers);
  assert.equal(mapping.date, 1);
  assert.equal(mapping.start, 3);
  assert.equal(mapping.end, 4);
  assert.equal(mapping.courseCode, 9);
  assert.equal(mapping.courseTitle, 10);
  assert.equal(mapping.facilitator, 11);
  assert.equal(mapping.centre, 13);
  assert.equal(mapping.uniqueId, 0);
});

test('buildRecords normalizes rows and skips dateless ones', () => {
  const rows = [
    ['Date', 'Start Time', 'End Time', 'Course Code', 'Course Title', 'Facilitator', 'Centre', 'Modality'],
    ['2026-06-06', '8:00 AM', '12:30 PM', 'CSM 352', 'Computer Architecture', 'Rose-Mary Mensah', 'Kumasi', 'Online'],
    ['', '8:00 AM', '12:30 PM', 'CSM 999', 'No date', 'Someone', 'Accra', 'Online'],
    ['2026-06-07', '1:00 PM', '5:30 PM', 'BIT 372', 'Internet Technologies', 'Gaddafi Abdul-Salaam', 'Accra', 'Face-to-Face']
  ];
  const mapping = { date: 0, start: 1, end: 2, courseCode: 3, courseTitle: 4, facilitator: 5, centre: 6, modality: 7 };
  const { records, skipped } = buildRecords(rows, 0, mapping);

  assert.equal(records.length, 2);
  assert.equal(skipped, 1);
  assert.equal(records[0].date, '2026-06-06');
  assert.equal(records[0].day, 'Saturday');
  assert.equal(records[0].startTime, '08:00');
  assert.equal(records[0].endTime, '12:30');
  assert.equal(records[0].modality, 'Online');
  assert.equal(records[1].modality, 'Face-to-Face');
  assert.match(records[0].externalKey, /^[a-f0-9]{40}$/);
});

test('buildRecords keeps the same key when a timetable is re-imported', () => {
  const rows = [
    ['Date', 'Start Time', 'Course Code', 'Facilitator', 'Centre'],
    ['2026-06-06', '8:00 AM', 'CSM 352', 'Rose-Mary Mensah', 'Kumasi'],
    ['2026-06-06', '8:00 AM', 'CSM 352', 'Rose-Mary Mensah', 'Kumasi']
  ];
  const mapping = { date: 0, start: 1, courseCode: 2, facilitator: 3, centre: 4 };
  const first = buildRecords(rows, 0, mapping).records;
  const second = buildRecords(rows, 0, mapping).records;
  assert.equal(first[0].externalKey, second[0].externalKey);
  assert.equal(first[0].externalKey, first[1].externalKey);
});

test('varianceMinutes measures the gap from the scheduled start', () => {
  assert.equal(varianceMinutes('08:00', '08:15'), 15);
  assert.equal(varianceMinutes('08:00', '07:45'), -15);
  assert.equal(varianceMinutes('08:00', ''), null);
  assert.equal(varianceMinutes('', '08:00'), null);
});

test('buildWorkbook writes tracking, summary and programme sheets', () => {
  const sessions = [
    {
      id: 1,
      date: '2026-06-06',
      day: 'Saturday',
      start_time: '08:00',
      end_time: '12:30',
      programme: 'BSc Computer Science',
      level: 'Undergraduate',
      year: '3',
      block: 'Block 1',
      course_code: 'CSM 352',
      course_title: 'Computer Architecture',
      facilitator: 'Rose-Mary Mensah',
      facilitator_phone: '',
      facilitator_email: 'rmo.mensah@knust.edu.gh',
      centre: 'Kumasi',
      modality: 'Online',
      modality_held: '',
      status: 'Present',
      actual_start: '08:15',
      actual_end: '12:40',
      participants: 42,
      delegated: 1,
      substitute: 'A. Mensah',
      reschedule_date: '',
      reschedule_time: '',
      notes: 'Started late'
    },
    {
      id: 2,
      date: '2026-06-07',
      day: 'Sunday',
      start_time: '13:00',
      end_time: '17:30',
      programme: 'BSc Information Technology',
      level: 'Undergraduate',
      year: '2',
      block: 'Block 1',
      course_code: 'BIT 372',
      course_title: 'Internet Technologies',
      facilitator: 'Gaddafi Abdul-Salaam',
      facilitator_phone: '',
      facilitator_email: 'gaddafi.ict@knust.edu.gh',
      centre: 'Accra',
      modality: 'Face-to-Face',
      modality_held: '',
      status: 'Pending',
      actual_start: '',
      actual_end: '',
      participants: 0,
      delegated: 0,
      substitute: '',
      reschedule_date: '',
      reschedule_time: '',
      notes: ''
    }
  ];

  const buffer = buildWorkbook(sessions);
  const workbook = xlsx.read(buffer, { type: 'buffer' });

  assert.deepEqual(workbook.SheetNames, ['Tracking', 'Summary', 'By programme']);

  const tracking = xlsx.utils.sheet_to_json(workbook.Sheets.Tracking, { header: 1, defval: '' });
  assert.equal(tracking[0][0], 'Date');
  assert.equal(tracking[0].length, 26);
  assert.equal(tracking[1][16], 'Present');
  assert.equal(tracking[1][20], 'Yes');
  assert.equal(tracking[1][21], 'A. Mensah');
  assert.equal(tracking[1][24], 15);
  assert.equal(tracking[2][16], 'Pending');
  assert.equal(tracking[2][20], 'No');

  const summary = xlsx.utils.sheet_to_json(workbook.Sheets.Summary, { header: 1, defval: '' });
  const summaryMap = Object.fromEntries(summary.slice(1).map(([key, value]) => [key, value]));
  assert.equal(summaryMap['Total classes'], 2);
  assert.equal(summaryMap.Present, 1);
  assert.equal(summaryMap.Pending, 1);
  assert.equal(summaryMap['Attendance rate'], '100.0%');

  const byProgramme = xlsx.utils.sheet_to_json(workbook.Sheets['By programme'], { header: 1, defval: '' });
  assert.equal(byProgramme.length, 3);
});
