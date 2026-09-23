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

export const EXCEL_IMPORT_LIMIT_BYTES = 10 * 1024 * 1024;
export const PDF_IMPORT_LIMIT_BYTES = 20 * 1024 * 1024;
export const CALENDAR_IMPORT_ROW_LIMIT = 1000;

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

function importWindowStart(today: Date) {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 30);
  return cutoff;
}

function ensureImportRowLimit(rows: CalendarImportRow[]) {
  if (rows.length > CALENDAR_IMPORT_ROW_LIMIT)
    throw new Error(
      `This file contains more than ${CALENDAR_IMPORT_ROW_LIMIT.toLocaleString('en-IN')} dated items. Split it into smaller monthly files and try again.`,
    );
  return rows.sort(
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title),
  );
}

function buildImportRow(input: {
  fileName: string;
  sourceKeyPrefix: string;
  sourceLabel: string;
  title: string;
  platform: string;
  rawType?: string;
  date: Date;
  contentStatus?: string;
  postingStatus?: string;
}): CalendarImportRow {
  const contentType = contentTypeFor(input.platform, input.rawType ?? '');
  const posted = /posted|published|live/i.test(input.postingStatus ?? '');
  const readyToPublish = /scheduled|ready/i.test(
    `${input.postingStatus ?? ''} ${input.contentStatus ?? ''}`,
  );
  const dateKey = input.date.toISOString().slice(0, 10);
  return {
    importSource: input.fileName,
    sourceKey: [
      input.sourceKeyPrefix,
      dateKey,
      normalized(input.title),
    ].join('::'),
    sourceLabel: input.sourceLabel,
    title: input.title,
    platform: input.platform,
    contentType,
    pillar: pillarFor(input.title),
    dueAt: isoAtNoonIndia(input.date),
    workflowRoute: ['Reel', 'Short', 'Video'].includes(contentType)
      ? 'Full production'
      : 'Design route',
    initialStage: posted ? 'Post-Upload' : readyToPublish ? 'Upload' : 'Idea',
    initialStep: posted
      ? 'Publish confirmation'
      : readyToPublish
        ? 'Platform scheduling'
        : 'Topic research',
    contentStatus: input.contentStatus || undefined,
    postingStatus: input.postingStatus || undefined,
  };
}

export async function parseMasterCalendar(
  file: File,
  today = new Date(),
): Promise<CalendarImportRow[]> {
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const sheets = await readExcelFile(file);
  const cutoff = importWindowStart(today);
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
      const contentStatus = String(row[contentStatusIndex] ?? '').trim();
      const postingStatus = String(row[postingStatusIndex] ?? '').trim();
      imported.push(
        buildImportRow({
          fileName: file.name,
          sourceKeyPrefix: sheet.sheet,
          sourceLabel: `${sheet.sheet} master calendar`,
          title,
          platform,
          rawType: String(row[typeIndex] ?? ''),
          date,
          contentStatus,
          postingStatus,
        }),
      );
    }
  }

  return ensureImportRowLimit(imported);
}

type PdfToken = { text: string; x: number; y: number };
type PdfLine = { tokens: PdfToken[]; text: string };

const PDF_DATE_PATTERNS = [
  /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4}\b/i,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{2,4}\b/i,
];

function parsedPdfDate(value: string) {
  const cleaned = value
    .replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
    .replace(/[/.]/g, '-')
    .trim();
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const indian = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 12),
    );
  }
  if (indian) {
    const [, day, month, shortYear] = indian;
    const year = Number(shortYear) + (shortYear.length === 2 ? 2000 : 0);
    return new Date(Date.UTC(year, Number(month) - 1, Number(day), 12));
  }
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function findPdfDate(text: string) {
  for (const pattern of PDF_DATE_PATTERNS) {
    const match = text.match(pattern)?.[0];
    const date = match ? parsedPdfDate(match) : undefined;
    if (match && date) return { match, date };
  }
  return undefined;
}

function pdfLines(tokens: PdfToken[]) {
  const lines: PdfToken[][] = [];
  for (const token of [...tokens].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find(
      (candidate) => Math.abs((candidate[0]?.y ?? token.y) - token.y) <= 3,
    );
    if (line) line.push(token);
    else lines.push([token]);
  }
  return lines
    .map((line) => {
      const sorted = line.sort((a, b) => a.x - b.x);
      return {
        tokens: sorted,
        text: sorted
          .map((token) => token.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      };
    })
    .filter((line) => line.text);
}

function platformFromText(value: string) {
  const text = value.toLowerCase();
  if (/\blinked\s*in\b/.test(text)) return 'LinkedIn';
  if (/\binsta(?:gram)?\b/.test(text)) return 'Instagram';
  if (/\bfacebook\b/.test(text)) return 'Facebook';
  if (/\byoutube\b/.test(text)) return 'YouTube';
  if (/\b(?:twitter|x)\b/.test(text)) return 'X';
  return undefined;
}

function valueBetweenColumns(
  line: PdfLine,
  start?: number,
  end?: number,
) {
  if (start === undefined) return '';
  return line.tokens
    .filter((token) => token.x >= start - 4 && (end === undefined || token.x < end))
    .map((token) => token.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPdfTitle(value: string, dateText: string) {
  return value
    .replace(dateText, ' ')
    .replace(
      /\b(?:reel|short|video|carousel|post|posted|published|live|scheduled|ready|draft|pending|instagram|linkedin|facebook|youtube|twitter|multi-platform)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .replace(/^[|:;,\-\s]+|[|:;,\-\s]+$/g, '')
    .trim();
}

export async function parseCalendarPdf(
  file: File,
  today = new Date(),
): Promise<CalendarImportRow[]> {
  const { getDocument, GlobalWorkerOptions } =
    typeof window === 'undefined'
      ? await import('pdfjs-dist/legacy/build/pdf.mjs')
      : await import('pdfjs-dist');
  if (typeof window !== 'undefined') {
    const workerModule = await import(
      'pdfjs-dist/build/pdf.worker.min.mjs?url'
    );
    GlobalWorkerOptions.workerSrc = workerModule.default;
  }
  const document = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const cutoff = importWindowStart(today);
  const imported: CalendarImportRow[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = pdfLines(
      content.items
        .filter(
          (
            item,
          ): item is (typeof content.items)[number] & {
            str: string;
            transform: number[];
          } =>
            'str' in item &&
            'transform' in item &&
            Boolean(item.str.trim()),
        )
        .map((item) => ({
          text: item.str.trim(),
          x: Number(item.transform[4] ?? 0),
          y: Number(item.transform[5] ?? 0),
        })),
    );
    const pageText = lines.map((line) => line.text).join(' ');
    let platform = platformFromText(pageText) ?? 'Multi-platform';
    let columns: Record<string, number> | undefined;

    for (const line of lines) {
      platform = platformFromText(line.text) ?? platform;
      const tokenNames = line.tokens.map((token) => normalized(token.text));
      if (tokenNames.includes('date') && tokenNames.includes('topic')) {
        columns = Object.fromEntries(
          line.tokens
            .map((token) => [normalized(token.text), token.x] as const)
            .filter(([name]) =>
              [
                'date',
                'topic',
                'type of post',
                'type',
                'content status',
                'posting status',
              ].includes(name),
            ),
        );
        continue;
      }
      const found = findPdfDate(line.text);
      if (!found || found.date < cutoff) continue;

      const orderedColumns = columns
        ? Object.entries(columns).sort(([, a], [, b]) => a - b)
        : [];
      const columnEnd = (name: string) => {
        const index = orderedColumns.findIndex(([entry]) => entry === name);
        return index >= 0 ? orderedColumns[index + 1]?.[1] : undefined;
      };
      const topic = columns?.topic
        ? valueBetweenColumns(line, columns.topic, columnEnd('topic'))
        : '';
      const rawType = columns?.['type of post']
        ? valueBetweenColumns(
            line,
            columns['type of post'],
            columnEnd('type of post'),
          )
        : columns?.type
          ? valueBetweenColumns(line, columns.type, columnEnd('type'))
          : line.text.match(/\b(reel|short|video|carousel|post)\b/i)?.[0] ?? '';
      const contentStatus = columns?.['content status']
        ? valueBetweenColumns(
            line,
            columns['content status'],
            columnEnd('content status'),
          )
        : '';
      const postingStatus = columns?.['posting status']
        ? valueBetweenColumns(
            line,
            columns['posting status'],
            columnEnd('posting status'),
          )
        : line.text.match(/\b(posted|published|live|scheduled|ready|draft|pending)\b/i)?.[0] ??
          '';
      const title = cleanPdfTitle(topic || line.text, found.match);
      if (!title || normalized(title) === 'date topic') continue;
      imported.push(
        buildImportRow({
          fileName: file.name,
          sourceKeyPrefix: `pdf-page-${pageNumber}`,
          sourceLabel: `${platform} PDF calendar`,
          title,
          platform,
          rawType,
          date: found.date,
          contentStatus,
          postingStatus,
        }),
      );
    }
  }

  if (!imported.length && document.numPages)
    throw new Error(
      'No dated calendar rows were found. Use a text-based PDF exported from the calendar; scanned image PDFs cannot be imported.',
    );
  return ensureImportRowLimit(imported);
}

export async function parseCalendarFile(file: File, today = new Date()) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx') {
    if (file.size > EXCEL_IMPORT_LIMIT_BYTES)
      throw new Error('Excel files can be up to 10 MB.');
    return parseMasterCalendar(file, today);
  }
  if (extension === 'pdf') {
    if (file.size > PDF_IMPORT_LIMIT_BYTES)
      throw new Error('PDF files can be up to 20 MB.');
    return parseCalendarPdf(file, today);
  }
  throw new Error('Choose an Excel (.xlsx) or text-based PDF (.pdf) file.');
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
