# SessionOps

Weekend class attendance tracking for KNUST IDL. Replaces the Excel sheet the IT team
currently fills in: import the timetable, mark each class as it runs, and export the
report.

One row is one class occurrence: course + facilitator + date + start/end time. A course
that meets on four weekends produces four rows, each marked separately.

## Stack

- **Server**: Express, SQLite through Node's built-in `node:sqlite` (no native build step)
- **Frontend**: React + Vite + Tailwind, served by the same Express process
- **Auth**: one shared team password, signed http-only cookie, login rate limiting
- **Import**: `xlsx`; the school's weekend workbook is detected automatically, with a
  column-mapping fallback for any other layout
- **Export**: `xlsx` weekend report plus Tracking, Summary and By programme sheets

## Local setup

Requires Node 22.5 or newer (for `node:sqlite`).

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

Open http://localhost:3002 and sign in with `APP_PASSWORD`.

For frontend development with hot reload:

```bash
npm run dev:server   # API on :3002
npm run dev          # Vite on :5174, proxies /api to :3002
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | Yes in production | Shared password for the IT team |
| `APP_SESSION_SECRET` | Yes in production | Signs session cookies. Generate with `openssl rand -hex 32` |
| `DB_PATH` | No | SQLite file location. Defaults to `./data/sessionops.db` |
| `PORT` | No | API and static file port. Defaults to `3002` |
| `NODE_ENV` | No | Set to `production` to mark cookies `Secure` |

If `APP_PASSWORD` is unset the server falls back to `sessionops` and prints a warning.
Never run production without both secrets set.

## Importing a timetable

The school workbook (`IDL 1ST AND 2ND SEMESTER 2025_2026.xlsx`) is recognised on its own.
It has one sheet per weekend, with a dated Saturday section and Sunday section. The importer
reads every section, maps the headers per semester, and pre-fills the attendance it finds:

- `NO. OF STUDENTS` / `N0. OF PARTIIICPANTS` becomes the participant count
- a different `FACILITATOR PRESENT` becomes a delegation and substitute
- `Postponed` becomes the Rescheduled status
- `S_TIME`, `E_TIME`, venue and programme are carried over
- columns the tracker does not model are kept with the class and written back on export

After upload the wizard lists every weekend with its dates, class count, recorded statuses,
and any warning. Untick a weekend that looks wrong, then import the rest. Warnings cover
non-weekend dates, single-row sections, repeated dates, and labels whose year was corrected
to the workbook's academic year.

For any other layout, choose the file, pick the sheet and header row, map the columns, and
import. Only **Date** and either **Course code** or **Course title** are required.

Mapping notes:

- Dates accept real Excel dates, Excel serial numbers, `YYYY-MM-DD`, and `DD/MM/YYYY`.
- Times accept Excel time values, `8:00 AM`, `13:45`, `800` and `1230`.
- `Modality` is normalised to `Online` or `Face-to-Face`; anything unrecognised becomes
  `Face-to-Face`, which can be changed per class in the tracker.
- `Unique ID` is optional. When present it is used as the stable key. Without it the key
  is course + date + start time + centre + facilitator.

Re-importing a corrected timetable updates existing rows in place. Attendance already
recorded against a class is kept, because the key does not change.

`public/sample-timetable.xlsx` is a 440-row fixture taken from the original prototype.
The import screen has a **Try the sample schedule** button that loads it, which is useful
for demos and for checking a deployment.

## Tracking

Each row records:

- Status: Present, Absent, Rescheduled, or Pending
- Actual start and end time
- Participants present
- Delegation flag and substitute name
- Modality actually used (if it differed from the timetable)
- Reschedule date and time
- Notes

Changes save automatically about half a second after you stop typing. Select rows to mark
several classes at once.

Variance is the difference between the scheduled start and the actual start. Anything over
15 minutes is highlighted and counted on the overview.

## Export

**Export** writes an `.xlsx` workbook for either the current filtered view or everything.
Choose one of two layouts:

- **Weekend report**: one sheet per weekend, matching the school workbook. Each sheet has a
  dated Saturday and Sunday section, the school columns (programme, course, facilitator,
  venue, times, participants) and the recorded fields (status, actual times, modality held,
  delegation, substitute, reschedule date/time, variance, notes). Programme cells are merged
  like the original. A Summary and By programme sheet are appended.
- **Flat tracking**: one row per class with every schedule and tracking field.

Both layouts include:

- **Summary**: totals, attendance rate, hours, substitute coverage, deviations over 15
  minutes
- **By programme**: class counts per programme

## Deployment

### Run it on an office machine (no hosting cost)

One machine keeps the database and serves the app to the team over the office network.
Every staff member sees the same data because they all use that machine.

1. Use an always-on PC or small server with Node 22.5 or newer.
2. Clone the repository, run `npm ci`, create `.env` with `APP_PASSWORD` and
   `APP_SESSION_SECRET`, then run `npm run build`.
3. Start it with `npm start`. It listens on port 3002.
4. Find the machine's LAN address with `ip addr` (for example `192.168.1.20`) and allow
   port 3002 through the firewall.
5. The team opens `http://192.168.1.20:3002` on any device on the same network.

To keep it running after logout or reboot, install the sample systemd unit:

```bash
sudo cp deploy/sessionops.service.example /etc/systemd/system/sessionops.service
sudo systemctl daemon-reload
sudo systemctl enable --now sessionops
```

Edit the paths and user in the unit first. Back up `data/sessionops.db` on a schedule
(a daily `cp` to another disk is enough). The machine must stay on during working hours;
if it is off, the team cannot mark attendance.

### Render

`render.yaml` describes a single Render web service on the starter plan with a 1 GB disk
mounted at `/var/data`. The disk is what makes attendance survive a redeploy, and Render's
free tier does not offer one.

Set `APP_PASSWORD` in the Render dashboard. `APP_SESSION_SECRET` is generated by the
blueprint. `DB_PATH` is set to `/var/data/sessionops.db`.

Any host that can run Node and persist a file works. The only state is the SQLite file at
`DB_PATH`, so back it up by copying that file (and its `-wal` sibling while the server is
running).

## Tests

```bash
npm test        # normalisation, weekly workbook parsing, import records, export
npm run typecheck
```

## Layout

```
server/
  index.js    routes, auth middleware, import, export, static serving
  db.js       schema, migrations, session queries, tracking upserts
  auth.js     password check, cookie signing, rate limiting
  excel.js    workbook reading, normalisation, header detection, column mapping
  weekly.js   school weekend-workbook detection, section parsing, tracking prefill
  export.js   weekend report and flat tracking workbooks
src/
  App.tsx     shell, filters, autosave queue, bulk actions
  api.ts      typed API client
  lib.ts      formatting, metrics, variance, status metadata
  components/ Login, Overview, SessionsTable, ImportWizard, ExportDialog
tests/
  excel.test.js
  weekly.test.js
reference/
  weekend-class-tracker-prototype.html   original prototype and source of the sample data
```
