import type {
  ContentItem,
  ContentPillar,
  DepartmentRequest,
  OperatingCadence,
  Person,
  Stage,
  WorkflowRoute,
} from './content-types';
import type { Sheet } from 'write-excel-file/browser';

type ExcelValue = string | number | boolean | Date | null;
type InputRow = ExcelValue[];

export type CalendarImportRow = {
  importSource: string;
  sourceKey: string;
  sourceLabel: string;
  title: string;
  platform: string;
  contentType: string;
  pillar: ContentPillar;
  dueAt: string;
  workflowRoute: WorkflowRoute;
  initialStage: Stage;
  initialStep: string;
  contentStatus?: string;
  postingStatus?: string;
};

const PLATFORM_BY_SHEET: Record<string, string> = {
  linkedin: 'LinkedIn',
  insta: 'Instagram',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  twitter: 'X',
  youtube: 'YouTube',
};

function normalized(value: ExcelValue) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function contentTypeFor(platform: string, rawType: string) {
  const value = rawType.toLowerCase();
  if (platform === 'YouTube')
    return value.includes('short') ? 'Short' : 'Video';
  if (platform === 'Instagram' && value.includes('reel')) return 'Reel';
  if (value.includes('carousel')) return 'Carousel';
  return 'Post';
}

function pillarFor(title: string): ContentPillar {
  const value = title.toLowerCase();
  if (
    /(admission|enrol|enroll|register|deadline|programme|program|course|seminar|job opportunity|job opening)/.test(
      value,
    )
  )
    return 'Promotional';
  if (
    /(aafm|convention|event|team|faculty|alumni|behind the scenes|celebration|mou|newsletter)/.test(
      value,
    )
  )
    return 'AAFM India Insider';
  return 'Knowledge';
}

function dateValue(value: ExcelValue) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return undefined;
}

function isoAtNoonIndia(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00+05:30`).toISOString();
}

export async function parseMasterCalendar(
  file: File,
  today = new Date(),
): Promise<CalendarImportRow[]> {
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const sheets = await readExcelFile(file);
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 30);
  const imported: CalendarImportRow[] = [];

  for (const sheet of sheets) {
    const platform = PLATFORM_BY_SHEET[normalized(sheet.sheet)];
    if (!platform) continue;
    const data = sheet.data as InputRow[];
    const headerIndex = data.findIndex((row) => {
      const cells = row.map(normalized);
      return cells.includes('topic') && cells.includes('date');
    });
    if (headerIndex < 0) continue;
    const headers = data[headerIndex].map(normalized);
    const indexOf = (...names: string[]) =>
      headers.findIndex((header) => names.includes(header));
    const dateIndex = indexOf('date');
    const topicIndex = indexOf('topic');
    const typeIndex = indexOf('type of post', 'type');
    const contentStatusIndex = indexOf('content status');
    const postingStatusIndex = indexOf('posting status');

    for (const row of data.slice(headerIndex + 1)) {
      const title = String(row[topicIndex] ?? '').trim();
      const date = dateValue(row[dateIndex]);
      if (!title || !date || date < cutoff) continue;
      const contentType = contentTypeFor(
        platform,
        String(row[typeIndex] ?? ''),
      );
      const contentStatus = String(row[contentStatusIndex] ?? '').trim();
      const postingStatus = String(row[postingStatusIndex] ?? '').trim();
      const posted = /posted|published|live/i.test(postingStatus);
      const readyToPublish = /scheduled|ready/i.test(
        `${postingStatus} ${contentStatus}`,
      );
      const dateKey = date.toISOString().slice(0, 10);
      imported.push({
        importSource: file.name,
        sourceKey: [sheet.sheet, dateKey, normalized(title)].join('::'),
        sourceLabel: `${sheet.sheet} master calendar`,
        title,
        platform,
        contentType,
        pillar: pillarFor(title),
        dueAt: isoAtNoonIndia(date),
        workflowRoute: ['Reel', 'Short', 'Video'].includes(contentType)
          ? 'Full production'
          : 'Design route',
        initialStage: posted
          ? 'Post-Upload'
          : readyToPublish
            ? 'Upload'
            : 'Idea',
        initialStep: posted
          ? 'Publish confirmation'
          : readyToPublish
            ? 'Platform scheduling'
            : 'Topic research',
        contentStatus: contentStatus || undefined,
        postingStatus: postingStatus || undefined,
      });
    }
  }

  return imported.sort(
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title),
  );
}

const headerStyle = {
  fontWeight: 'bold' as const,
  color: '#FFFFFF',
  backgroundColor: '#20284D',
  align: 'center' as const,
  height: 28,
};

function sheetData(headers: string[], rows: ExcelValue[][]) {
  return [
    headers.map((value) => ({ value, ...headerStyle })),
    ...rows.map((row) => row.map((value) => ({ value, wrap: true }))),
  ];
}

function names(people: Person[]) {
  return people.map((person) => person.name).join(', ');
}

function stageAgeHours(item: ContentItem) {
  const enteredAt = item.history
    .filter((event) => event.toStage === item.stage && event.occurredAt)
    .map((event) => new Date(event.occurredAt as string).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const fallback = new Date(
    item.updatedAt ?? item.createdAt ?? Date.now(),
  ).getTime();
  return Math.max(
    0,
    Math.round((Date.now() - (enteredAt ?? fallback)) / 3_600_000),
  );
}

export async function exportTrackerWorkbook(input: {
  items: ContentItem[];
  people: Person[];
  cadences: OperatingCadence[];
  requests: DepartmentRequest[];
}) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const pipelineRows = input.items.map((item) => {
    const ageHours = stageAgeHours(item);
    const threshold = item.workflowRoute === 'Ad hoc fast track' ? 8 : 48;
    const overdue = Boolean(
      item.dueAt && new Date(item.dueAt).getTime() < Date.now(),
    );
    return [
      item.title,
      item.contentType,
      item.platform,
      item.pillar,
      item.workflowRoute,
      item.stage,
      item.workflowStep,
      item.status,
      item.lifecycle,
      item.dueAt ? new Date(item.dueAt) : null,
      ageHours,
      item.lifecycle === 'Active' && (overdue || ageHours > threshold)
        ? 'Needs attention'
        : 'On track',
      names(item.responsible),
      names(item.accountable),
      item.comments.filter(
        (comment) => comment.kind === 'Feedback' && !comment.resolved,
      ).length,
      item.sourceLabel ?? '',
    ];
  });
  const raciRows = input.items.flatMap((item) =>
    (Object.keys(item.raci) as Stage[]).map((stage) => [
      item.title,
      stage,
      names(item.raci[stage].responsible),
      names(item.raci[stage].accountable),
      names(item.raci[stage].consulted),
      names(item.raci[stage].informed),
    ]),
  );
  const feedbackRows = input.items.flatMap((item) =>
    item.comments.map((comment) => [
      item.title,
      comment.stage,
      comment.kind,
      comment.author,
      comment.body,
      comment.resolved ? 'Resolved' : 'Open',
      comment.resolvedBy ?? '',
      comment.at,
    ]),
  );
  const peopleRows = input.people.map((person) => [
    person.name,
    person.email || '',
    person.responsibility ?? '',
    person.roles.join(', '),
    person.hasLogin ? (person.isActive ? 'Active' : 'Paused') : 'Not invited',
  ]);
  const cadenceRows = input.cadences.map((cadence) => [
    cadence.name,
    cadence.frequency,
    cadence.stage ?? '',
    cadence.owner.name,
    names(cadence.participants),
    cadence.deliverable,
    cadence.time,
    cadence.timezone,
    cadence.active ? 'Active' : 'Paused',
  ]);
  const requestRows = input.requests.map((request) => [
    request.department,
    request.requester,
    request.request,
    request.priority,
    request.neededBy,
    request.status,
  ]);

  const sheets = [
    {
      sheet: 'Content Pipeline',
      data: sheetData(
        [
          'Title',
          'Content Type',
          'Platform',
          'Content Mix',
          'Route',
          'Stage',
          'Checkpoint',
          'Status',
          'Lifecycle',
          'Due At',
          'Hours in Stage',
          'Flow Health',
          'Responsible',
          'Accountable',
          'Open Feedback',
          'Source',
        ],
        pipelineRows,
      ),
      stickyRowsCount: 1,
      columns: [
        34, 16, 14, 20, 20, 16, 26, 18, 14, 20, 16, 18, 24, 24, 16, 24,
      ].map((width) => ({ width })),
    },
    {
      sheet: 'RACI',
      data: sheetData(
        [
          'Content Item',
          'Stage',
          'Responsible',
          'Accountable',
          'Consulted',
          'Informed',
        ],
        raciRows,
      ),
      stickyRowsCount: 1,
      columns: [34, 18, 28, 28, 28, 28].map((width) => ({ width })),
    },
    {
      sheet: 'Feedback',
      data: sheetData(
        [
          'Content Item',
          'Stage',
          'Type',
          'Author',
          'Comment',
          'Status',
          'Resolved By',
          'Recorded At',
        ],
        feedbackRows,
      ),
      stickyRowsCount: 1,
      columns: [34, 18, 14, 20, 48, 14, 20, 22].map((width) => ({ width })),
    },
    {
      sheet: 'People & Access',
      data: sheetData(
        ['Name', 'Email', 'Responsibility', 'Roles', 'Access'],
        peopleRows,
      ),
      stickyRowsCount: 1,
      columns: [24, 30, 52, 32, 16].map((width) => ({ width })),
    },
    {
      sheet: 'Operating Cadence',
      data: sheetData(
        [
          'Name',
          'Frequency',
          'Stage',
          'Owner',
          'Participants',
          'Deliverable',
          'Time',
          'Timezone',
          'Status',
        ],
        cadenceRows,
      ),
      stickyRowsCount: 1,
      columns: [30, 14, 16, 22, 34, 52, 12, 18, 14].map((width) => ({ width })),
    },
    {
      sheet: 'Content Requests',
      data: sheetData(
        [
          'Department',
          'Requested By',
          'Request',
          'Priority',
          'Needed By',
          'Status',
        ],
        requestRows,
      ),
      stickyRowsCount: 1,
      columns: [20, 22, 52, 14, 16, 14].map((width) => ({ width })),
    },
  ] as Sheet<File | Blob | ArrayBuffer>[];
  const workbook = writeExcelFile(sheets, {
    fontFamily: 'Aptos',
    fontSize: 11,
  });
  await workbook.toFile(
    `AAFM-Content-Ops-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
