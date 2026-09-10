export const PIPELINE = [
  'Idea',
  'Script',
  'Shoot',
  'Production',
  'Upload',
  'Post-Upload Metrics',
] as const;
export type Stage = (typeof PIPELINE)[number];
export type AppRole =
  | 'Owner'
  | 'Admin'
  | 'Content Producer'
  | 'Content Approver'
  | 'Monitoring'
  | 'Read-only Stakeholder';
export type StageStatus =
  | 'In progress'
  | 'Pending approval'
  | 'Changes requested'
  | 'Approved';
export type ContentPillar = 'Knowledge' | 'Promotional' | 'AAFM India Insider';

export const STAGE_STEPS: Record<Stage, readonly string[]> = {
  Idea: ['Topic research', 'HOD input', 'Calendar slot'],
  Script: ['Drafting', 'Subject-matter validation', 'Financial compliance'],
  Shoot: ['Shoot brief', 'Recording'],
  Production: [
    'Edit or design',
    'Harshit quality check',
    'Priya final approval',
  ],
  Upload: ['Platform scheduling', 'Publishing'],
  'Post-Upload Metrics': [
    'Engagement monitoring',
    'Lead follow-up',
    'Weekly or monthly reporting',
  ],
};

export type Person = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: AppRole[];
  isActive?: boolean;
  responsibility?: string;
};
export type ItemLink = { label: string; kind: string; url: string };
export type HistoryEvent = {
  action: string;
  actor: string;
  at: string;
  note?: string;
  flagged?: boolean;
};
export type Comment = {
  id: string;
  author: string;
  initials: string;
  body: string;
  at: string;
  parentId?: string;
};
export type MetricEntry = {
  id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  recordedOn: string;
};
export type ContentItem = {
  id: string;
  title: string;
  contentType: string;
  platform: string;
  pillar: ContentPillar;
  workflowStep: string;
  stage: Stage;
  status: StageStatus;
  dueAt?: string;
  reminderHours: number;
  lifecycle: 'Active' | 'Closed' | 'Archived';
  responsible: Person[];
  accountable: Person[];
  secondLens:
    | 'Not needed'
    | 'Awaiting review'
    | 'Approved'
    | 'Changes requested'
    | 'Overridden';
  links: ItemLink[];
  history: HistoryEvent[];
  comments: Comment[];
  metrics: MetricEntry[];
  publishedAt?: string;
};

export type LeadStatus = 'New' | 'Qualified' | 'Follow-up due' | 'Converted';
export type Lead = {
  id: string;
  name: string;
  source: string;
  interest: string;
  owner: string;
  status: LeadStatus;
  capturedAt: string;
  nextFollowUp?: string;
};

export type InboxItem = {
  id: string;
  person: string;
  channel: string;
  message: string;
  detectedKeyword?: string;
  sensitive?: boolean;
  status: 'Needs reply' | 'Auto-response sent' | 'Resolved';
};

export type DepartmentRequest = {
  id: string;
  department: string;
  requester: string;
  request: string;
  priority: 'Normal' | 'Urgent';
  neededBy: string;
  status: 'New' | 'Accepted' | 'Scheduled';
};
