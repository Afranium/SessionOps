export type AttendanceStatus = 'Pending' | 'Present' | 'Absent' | 'Rescheduled';

export interface Tracking {
  status: AttendanceStatus;
  actualStart: string;
  actualEnd: string;
  participants: number;
  delegated: boolean;
  substitute: string;
  modalityHeld: string;
  rescheduleDate: string;
  rescheduleTime: string;
  notes: string;
  updatedAt: string;
}

export interface SessionRow {
  id: number;
  externalKey: string;
  date: string;
  day: string;
  startTime: string;
  endTime: string;
  centre: string;
  modality: 'Online' | 'Face-to-Face';
  programme: string;
  courseCode: string;
  courseTitle: string;
  facilitator: string;
  facilitatorPhone: string;
  facilitatorEmail: string;
  level: string;
  year: string;
  block: string;
  tracking: Tracking;
}

export interface ImportRecord {
  id: number;
  filename: string;
  sheet: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  created_at: string;
}

export interface PreviewSheet {
  name: string;
  headerRow: number;
  headers: string[];
  rowCount: number;
  rows: string[][];
  previewRows: string[][];
  suggestedMapping: Record<string, number>;
}

export interface PreviewResponse {
  token: string;
  filename: string;
  sheets: PreviewSheet[];
}

export type Mapping = Record<string, number | null>;

export interface Filters {
  weekend: string;
  programme: string;
  centre: string;
  modality: string;
  status: string;
  q: string;
}
