import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDateLabel,
  inferAcademicYear,
  mapWeeklyHeaders,
  parseWeeklySheets
} from '../server/weekly.js';

const semesterOneHeaders = [
  'PROGRAM',
  'COURSE CODE',
  'COURSE TITLE',
  'LEAD FACILITATOR',
  'CONTACT',
  'VENUE',
  'FACILITATOR PRESENT',
  'CONTACT',
  'NO. OF STUDENTS',
  'S_TIME',
  'E_TIME',
  'EXPECTED HOURS',
  'ZOOM MAIL',
  'ZOOM PASSWORD',
  'MEETING ID',
  'MEETING CODE',
  'ASSIGNED PERSONNEL',
  'SATURDAY EDITORS',
  'VIDEO STATUS',
  'DURATION',
  'ZOOM LINKS'
];

const semesterTwoHeaders = [
  'PROGRAM',
  'COURSE CODE',
  'COURSE NAME',
  'ONLINE/F2F',
  'LEAD FACILITATOR',
  'CONTACT',
  'FACILITATOR PRESENT',
  'STAFF ID',
  'START TIME',
  'END TIME',
  'ACTUAL DURATION (HOUR)',
  'N0. OF PARTIIICPANTS',
  'VIDEO EDITING STATUS',
  'ASSIGNED TO EDIT',
  'ACCOUNT/LINK'
];

test('parseDateLabel reads printed weekend labels', () => {
  assert.deepEqual(parseDateLabel('SATURDAY 24TH JANUARY 2026'), {
    date: '2026-01-24',
    weekday: 'saturday',
    labelled: true,
    labelYear: 2026
  });
  assert.equal(parseDateLabel('SUNDAY 1ST MARCH,2026').date, '2026-03-01');
  assert.equal(parseDateLabel('SATURDAY 8TH AUG, 2026').date, '2026-08-08');
  assert.equal(parseDateLabel('not a date'), null);
});

test('parseDateLabel corrects a label to the workbook academic year', () => {
  const parsed = parseDateLabel('SATURDAY 16TH AUGUST 2025', { start: 2025, end: 2026 });
  assert.equal(parsed.date, '2026-08-16');
  assert.equal(parsed.labelYear, 2025);
});

test('inferAcademicYear falls back to the dates inside the workbook', () => {
  const sheets = [
    {
      name: 'SEM1',
      rows: [
        ['SATURDAY 17TH JANUARY 2026'],
        ['SUNDAY 18TH JANUARY 2026']
      ]
    }
  ];
  assert.deepEqual(inferAcademicYear(sheets), { start: 2025, end: 2026 });

  const autumn = [
    {
      name: 'SEM1',
      rows: [['SATURDAY 11TH OCTOBER 2025']]
    }
  ];
  assert.deepEqual(inferAcademicYear(autumn), { start: 2025, end: 2026 });
  assert.equal(inferAcademicYear([{ name: 'empty', rows: [] }]), null);
});

test('mapWeeklyHeaders handles both semester column layouts', () => {
  const first = mapWeeklyHeaders(semesterOneHeaders);
  assert.equal(first.courseCode, 1);
  assert.equal(first.courseTitle, 2);
  assert.equal(first.facilitator, 3);
  assert.equal(first.facilitatorPhone, 4);
  assert.equal(first.facilitatorPresent, 6);
  assert.equal(first.presentPhone, 7);
  assert.equal(first.participants, 8);
  assert.equal(first.start, 9);
  assert.equal(first.end, 10);
  assert.equal(first.zoomLink, 20);

  const second = mapWeeklyHeaders(semesterTwoHeaders);
  assert.equal(second.courseTitle, 2);
  assert.equal(second.modality, 3);
  assert.equal(second.facilitator, 4);
  assert.equal(second.participants, 11);
  assert.equal(second.start, 8);
  assert.equal(second.end, 9);
  assert.equal(second.expectedHours, 10);
  assert.equal(second.videoStatus, 12);
  assert.equal(second.assignedEditor, 13);
  assert.equal(second.zoomLink, 14);
});

test('parseWeeklySheets splits Saturday and Sunday sections', () => {
  const rows = [
    ['SATURDAY 17TH JANUARY 2026'],
    [],
    semesterOneHeaders,
    [
      'BSC. COMPUTER SCIENCE (IDL) (YEAR 4)',
      'CSM 355',
      'DATA STRUCTURES',
      'Ama Mensah',
      246304704,
      'KUMASI and ACCRA',
      'Ama Mensah',
      246304704,
      42,
      '08:00',
      '10:00',
      '2',
      'class@example.com',
      'pass',
      '123',
      '456',
      'Editor One',
      '',
      'UPLOADED',
      '120',
      'https://zoom.example/1'
    ],
    [
      '',
      'CSM 356',
      'OPERATING SYSTEMS',
      'Kofi Boateng',
      209219708,
      'KUMASI',
      'Yaw Owusu',
      209219708,
      0,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ],
    [
      '',
      'CSM 359',
      'PENDING COURSE',
      'Ama Mensah',
      '',
      'KUMASI',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ],
    [
      '',
      'CSM 357',
      'POSTPONED COURSE',
      'Kofi Boateng',
      '',
      'KUMASI',
      'Kofi Boateng',
      '',
      'Postponed',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ],
    [],
    ['SUNDAY 18TH JANUARY 2026'],
    [],
    semesterOneHeaders.slice(0, 12),
    [
      'BSC. COMPUTER SCIENCE (IDL) (YEAR 4)',
      'CSM 358',
      'ALGORITHMS',
      'Ama Mensah',
      '',
      'KUMASI',
      'Ama Mensah',
      '',
      10,
      '09:00',
      '11:00',
      '2'
    ]
  ];

  const { academicYear, sections } = parseWeeklySheets(
    [{ name: 'SEM1 BLOCK 1 - WEEK 1 - 17TH AN', rows }],
    'IDL 1ST AND 2ND SEMESTER 2025_2026.xlsx'
  );

  assert.deepEqual(academicYear, { start: 2025, end: 2026 });
  assert.equal(sections.length, 2);
  assert.equal(sections[0].date, '2026-01-17');
  assert.equal(sections[0].weekday, 'saturday');
  assert.equal(sections[0].records.length, 4);
  assert.equal(sections[1].date, '2026-01-18');
  assert.equal(sections[1].records.length, 1);

  const [present, delegated, pending, postponed] = sections[0].records;
  assert.equal(present.programme, 'BSC. COMPUTER SCIENCE (IDL) (YEAR 4)');
  assert.equal(present.courseCode, 'CSM 355');
  assert.equal(present.centre, 'Kumasi, Accra');
  assert.equal(present.startTime, '08:00');
  assert.equal(present.endTime, '10:00');
  assert.equal(present.tracking.status, 'Present');
  assert.equal(present.tracking.participants, 42);
  assert.equal(present.tracking.delegated, false);
  assert.equal(present.extra.DURATION, '120');

  assert.equal(delegated.tracking.status, 'Present');
  assert.equal(delegated.tracking.participants, 0);
  assert.equal(delegated.tracking.delegated, true);
  assert.equal(delegated.tracking.substitute, 'Yaw Owusu');

  assert.equal(pending.tracking.status, 'Pending');
  assert.equal(pending.tracking.participants, 0);
  assert.equal(pending.tracking.delegated, false);

  assert.equal(postponed.tracking.status, 'Rescheduled');
  assert.equal(postponed.tracking.participants, 0);

  assert.equal(sections[1].records[0].programme, 'BSC. COMPUTER SCIENCE (IDL) (YEAR 4)');
  assert.equal(sections[1].records[0].tracking.status, 'Present');
  assert.equal(sections[1].records[0].tracking.participants, 10);
});
