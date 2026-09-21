export const PIPELINE = [
  'Idea',
  'Script',
  'Shoot',
  'Production',
  'Upload',
  'Post-Upload',
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
  'Post-Upload': ['Publish confirmation', 'Live link captured', 'Learning note'],
};

export const PLATFORM_CONTENT_TYPES: Record<string, readonly string[]> = {
  Instagram: ['Reel', 'Post', 'Carousel'],
  YouTube: ['Short', 'Video'],
  LinkedIn: ['Post', 'Carousel'],
  Facebook: ['Post', 'Carousel'],
  'Multi-platform': ['Post', 'Carousel'],
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
export type RaciAssignment = {
  responsible: Person[];
  accountable: Person[];
  consulted: Person[];
  informed: Person[];
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
  stage: Stage;
  kind: 'Update' | 'Feedback' | 'Decision';
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
};
export type MetricEntry = {
  id: string;
  platform: string;
  contentUrl?: string;
  views: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watchTimeMinutes: number;
  followerChange: number;
  notes?: string;
  source: 'Manual' | 'Zoho Analytics';
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
  consulted: Person[];
  informed: Person[];
  raci: Record<Stage, RaciAssignment>;
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

export type CadenceFrequency = 'Weekly' | 'Monthly';
export type OperatingCadence = {
  id: string;
  name: string;
  purpose: string;
  frequency: CadenceFrequency;
  weekday?: number;
  dayOfMonth?: number;
  time: string;
  timezone: 'Asia/Kolkata';
  owner: Person;
  participants: Person[];
  stage?: Stage;
  deliverable: string;
  reminderHours: number;
  active: boolean;
};

export type CadenceRun = {
  cadenceId: string;
  scheduledFor: string;
  status: 'Upcoming' | 'Complete' | 'Skipped';
  completedAt?: string;
  completedBy?: Person;
  notes?: string;
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
