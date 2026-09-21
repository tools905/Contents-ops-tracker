import type { SupabaseClient, User } from '@supabase/supabase-js';
import type {
  AppRole,
  CadenceRun,
  ContentItem,
  ContentPillar,
  DepartmentRequest,
  OperatingCadence,
  Person,
  RaciAssignment,
  Stage,
  StageStatus,
} from './content-types';

const stageFromDb: Record<string, Stage> = {
  idea: 'Idea',
  script: 'Script',
  shoot: 'Shoot',
  production: 'Production',
  upload: 'Upload',
  post_upload_metrics: 'Post-Upload',
};
const statusFromDb: Record<string, StageStatus> = {
  in_progress: 'In progress',
  pending_approval: 'Pending approval',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};
const roleFromDb: Record<string, AppRole> = {
  admin: 'Admin',
  content_producer: 'Content Producer',
  content_approver: 'Content Approver',
  monitoring: 'Monitoring',
  read_only_stakeholder: 'Read-only Stakeholder',
};
const pillarFromDb: Record<string, ContentPillar> = {
  knowledge: 'Knowledge',
  promotional: 'Promotional',
  aafm_india_insider: 'AAFM India Insider',
};
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export type LiveSnapshot = {
  currentUser: Person;
  currentUserActive: boolean;
  people: Person[];
  items: ContentItem[];
  requests: DepartmentRequest[];
  cadences: OperatingCadence[];
  cadenceRuns: CadenceRun[];
};

export async function loadLiveSnapshot(
  client: SupabaseClient,
  user: User,
): Promise<LiveSnapshot> {
  const [
    profilesRes,
    ownersRes,
    rolesRes,
    itemsRes,
    assignmentsRes,
    reviewsRes,
    linksRes,
    historyRes,
    commentsRes,
    metricsRes,
    requestsRes,
    cadencesRes,
    cadenceParticipantsRes,
    cadenceRunsRes,
  ] = await Promise.all([
    client.from('profiles').select('id,email,full_name,is_active'),
    client.from('workspace_owners').select('profile_id,slot'),
    client.from('user_roles').select('profile_id,role'),
    client
      .from('content_items')
      .select('*')
      .order('updated_at', { ascending: false }),
    client.from('item_stage_assignments').select('*'),
    client
      .from('stage_reviews')
      .select('*')
      .order('created_at', { ascending: false }),
    client.from('content_links').select('*'),
    client
      .from('stage_history')
      .select('*')
      .order('created_at', { ascending: true }),
    client
      .from('comments')
      .select('*')
      .order('created_at', { ascending: true }),
    client
      .from('metrics_entries')
      .select('*')
      .order('recorded_on', { ascending: false }),
    client
      .from('department_requests')
      .select('*')
      .order('created_at', { ascending: false }),
    client
      .from('operating_cadences')
      .select('*')
      .order('created_at', { ascending: true }),
    client.from('cadence_participants').select('*'),
    client
      .from('cadence_runs')
      .select('*')
      .order('scheduled_for', { ascending: true }),
  ]);
  const error = [
    profilesRes,
    ownersRes,
    rolesRes,
    itemsRes,
    assignmentsRes,
    reviewsRes,
    linksRes,
    historyRes,
    commentsRes,
    metricsRes,
    requestsRes,
    cadencesRes,
    cadenceParticipantsRes,
    cadenceRunsRes,
  ].find((result) => result.error)?.error;
  if (error) throw error;

  const roleRows = rolesRes.data ?? [];
  const people: Person[] = (profilesRes.data ?? []).map((profile) => {
    const name = profile.full_name || profile.email.split('@')[0];
    const roles = roleRows
      .filter((row) => row.profile_id === profile.id)
      .map((row) => roleFromDb[row.role])
      .filter(Boolean);
    if ((ownersRes.data ?? []).some((owner) => owner.profile_id === profile.id))
      roles.unshift('Owner');
    return {
      id: profile.id,
      email: profile.email,
      name,
      initials: initials(name),
      roles,
      isActive: profile.is_active,
    };
  });
  const personById = new Map(people.map((person) => [person.id, person]));
  const fallbackPerson = (id: string): Person =>
    personById.get(id) ?? {
      id,
      name: 'Former team member',
      email: '',
      initials: 'FT',
      roles: [],
    };

  const items: ContentItem[] = (itemsRes.data ?? []).map((row) => {
    const assignmentRows = (assignmentsRes.data ?? []).filter(
      (assignment) => assignment.content_item_id === row.id,
    );
    const itemAssignments = (assignmentsRes.data ?? []).filter(
      (assignment) =>
        assignment.content_item_id === row.id &&
        assignment.stage === row.current_stage,
    );
    const latestReview = (reviewsRes.data ?? []).find(
      (review) =>
        review.content_item_id === row.id && review.stage === row.current_stage,
    );
    const secondLens = !['script', 'production'].includes(row.current_stage)
      ? 'Not needed'
      : latestReview?.decision === 'approved'
        ? 'Approved'
        : latestReview?.decision === 'changes_requested'
          ? 'Changes requested'
          : 'Awaiting review';
    const raci = Object.fromEntries(
      Object.entries(stageFromDb).map(([dbStage, stage]) => {
        const stageAssignments = assignmentRows.filter(
          (assignment) => assignment.stage === dbStage,
        );
        const peopleFor = (assignmentType: string) =>
          stageAssignments
            .filter(
              (assignment) => assignment.assignment_type === assignmentType,
            )
            .map((assignment) => fallbackPerson(assignment.profile_id));
        return [
          stage,
          {
            responsible: peopleFor('responsible'),
            accountable: peopleFor('accountable'),
            consulted: peopleFor('consulted'),
            informed: peopleFor('informed'),
          },
        ];
      }),
    ) as Record<Stage, RaciAssignment>;
    return {
      id: row.id,
      title: row.title,
      contentType: row.content_type,
      platform: row.platform,
      pillar: pillarFromDb[row.content_pillar] ?? 'Knowledge',
      workflowStep: row.workflow_step ?? stageFromDb[row.current_stage],
      stage: stageFromDb[row.current_stage],
      status: statusFromDb[row.stage_status],
      dueAt: row.due_at ?? undefined,
      reminderHours: row.reminder_hours_before,
      lifecycle: row.lifecycle[0].toUpperCase() + row.lifecycle.slice(1),
      responsible: itemAssignments
        .filter((assignment) => assignment.assignment_type === 'responsible')
        .map((assignment) => fallbackPerson(assignment.profile_id)),
      accountable: itemAssignments
        .filter((assignment) => assignment.assignment_type === 'accountable')
        .map((assignment) => fallbackPerson(assignment.profile_id)),
      consulted: itemAssignments
        .filter((assignment) => assignment.assignment_type === 'consulted')
        .map((assignment) => fallbackPerson(assignment.profile_id)),
      informed: itemAssignments
        .filter((assignment) => assignment.assignment_type === 'informed')
        .map((assignment) => fallbackPerson(assignment.profile_id)),
      raci,
      secondLens: secondLens as ContentItem['secondLens'],
      publishedAt: row.published_at ?? undefined,
      links: (linksRes.data ?? [])
        .filter((link) => link.content_item_id === row.id)
        .map((link) => ({ label: link.label, kind: link.kind, url: link.url })),
      history: (historyRes.data ?? [])
        .filter((event) => event.content_item_id === row.id)
        .map((event) => ({
          action: event.action.replaceAll('_', ' '),
          actor: fallbackPerson(event.actor_id).name,
          at: new Date(event.created_at).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          note: event.note ?? undefined,
          flagged: event.action === 'override_advanced',
        })),
      comments: (commentsRes.data ?? [])
        .filter((comment) => comment.content_item_id === row.id)
        .map((comment) => ({
          id: String(comment.id),
          author: fallbackPerson(comment.author_id).name,
          initials: fallbackPerson(comment.author_id).initials,
          body: comment.body,
          stage: stageFromDb[comment.stage],
          kind:
            comment.kind === 'feedback'
              ? 'Feedback'
              : comment.kind === 'decision'
                ? 'Decision'
                : 'Update',
          resolved: Boolean(comment.resolved_at),
          resolvedAt: comment.resolved_at
            ? new Date(comment.resolved_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })
            : undefined,
          resolvedBy: comment.resolved_by
            ? fallbackPerson(comment.resolved_by).name
            : undefined,
          at: new Date(comment.created_at).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            minute: '2-digit',
          }),
          parentId: comment.parent_id ? String(comment.parent_id) : undefined,
        })),
      metrics: (metricsRes.data ?? [])
        .filter((metric) => metric.content_item_id === row.id)
        .map((metric) => ({
          id: String(metric.id),
          platform: metric.platform,
          contentUrl: metric.content_url ?? undefined,
          views: metric.views,
          reach: metric.reach,
          impressions: metric.impressions,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          saves: metric.saves,
          watchTimeMinutes: Math.round((metric.watch_time_seconds ?? 0) / 60),
          followerChange: metric.follower_change,
          notes: metric.notes ?? undefined,
          source:
            metric.source === 'zoho_analytics' ? 'Zoho Analytics' : 'Manual',
          recordedOn: metric.recorded_on,
        })),
    } as ContentItem;
  });

  const profile = (profilesRes.data ?? []).find((row) => row.id === user.id);
  const currentUser = people.find((person) => person.id === user.id) ?? {
    id: user.id,
    email: user.email ?? '',
    name: user.email?.split('@')[0] ?? 'User',
    initials: 'U',
    roles: [],
  };
  const requests: DepartmentRequest[] = (requestsRes.data ?? []).map((row) => ({
    id: row.id,
    department: row.department,
    requester: row.requester_name,
    request: row.request_text,
    priority: row.priority === 'urgent' ? 'Urgent' : 'Normal',
    neededBy: new Date(`${row.needed_by}T12:00:00+05:30`).toLocaleDateString(
      'en-IN',
      { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' },
    ),
    status:
      row.status === 'accepted'
        ? 'Accepted'
        : row.status === 'scheduled'
          ? 'Scheduled'
          : 'New',
  }));
  const cadences: OperatingCadence[] = (cadencesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    frequency: row.frequency === 'monthly' ? 'Monthly' : 'Weekly',
    weekday: row.weekday ?? undefined,
    dayOfMonth: row.day_of_month ?? undefined,
    time: String(row.time_of_day).slice(0, 5),
    timezone: 'Asia/Kolkata',
    owner: fallbackPerson(row.owner_id),
    participants: (cadenceParticipantsRes.data ?? [])
      .filter((entry) => entry.cadence_id === row.id)
      .map((entry) => fallbackPerson(entry.profile_id)),
    stage: row.stage ? stageFromDb[row.stage] : undefined,
    deliverable: row.deliverable,
    reminderHours: row.reminder_hours_before,
    active: row.is_active,
  }));
  const cadenceRuns: CadenceRun[] = (cadenceRunsRes.data ?? []).map((row) => ({
    cadenceId: row.cadence_id,
    scheduledFor: new Date(row.scheduled_for).toISOString(),
    status:
      row.status === 'complete'
        ? 'Complete'
        : row.status === 'skipped'
          ? 'Skipped'
          : 'Upcoming',
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by
      ? fallbackPerson(row.completed_by)
      : undefined,
    notes: row.notes ?? undefined,
  }));
  return {
    currentUser,
    currentUserActive: Boolean(profile?.is_active),
    people,
    items,
    requests,
    cadences,
    cadenceRuns,
  };
}
