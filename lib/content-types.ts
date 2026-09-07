export const PIPELINE = ['Idea', 'Script', 'Shoot', 'Production', 'Upload', 'Post-Upload Metrics'] as const;
export type Stage = (typeof PIPELINE)[number];
export type AppRole = 'Owner' | 'Admin' | 'Content Producer' | 'Content Approver' | 'Monitoring' | 'Read-only Stakeholder';
export type StageStatus = 'In progress' | 'Pending approval' | 'Changes requested' | 'Approved';

export type Person = { id: string; name: string; email: string; initials: string; roles: AppRole[]; isActive?: boolean };
export type ItemLink = { label: string; kind: string; url: string };
export type HistoryEvent = { action: string; actor: string; at: string; note?: string; flagged?: boolean };
export type Comment = { id: string; author: string; initials: string; body: string; at: string; parentId?: string };
export type MetricEntry = { id: string; platform: string; views: number; likes: number; comments: number; shares: number; recordedOn: string };
export type ContentItem = {
  id: string;
  title: string;
  contentType: string;
  platform: string;
  stage: Stage;
  status: StageStatus;
  dueAt?: string;
  reminderHours: number;
  lifecycle: 'Active' | 'Closed' | 'Archived';
  responsible: Person[];
  accountable: Person[];
  secondLens: 'Not needed' | 'Awaiting review' | 'Approved' | 'Changes requested' | 'Overridden';
  links: ItemLink[];
  history: HistoryEvent[];
  comments: Comment[];
  metrics: MetricEntry[];
  publishedAt?: string;
};
