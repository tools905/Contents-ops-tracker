'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  GripVertical,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  Users2,
  X,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  demoInbox,
  demoItems,
  demoLeads,
  demoPeople,
  demoRequests,
} from '@/lib/demo-data';
import {
  PIPELINE,
  STAGE_STEPS,
  type AppRole,
  type ContentItem,
  type ContentPillar,
  type DepartmentRequest,
  type InboxItem,
  type Lead,
  type LeadStatus,
  type Person,
  type Stage,
} from '@/lib/content-types';
import { makeSupabaseClient, type SupabaseConfig } from '@/lib/supabase-client';
import { loadLiveSnapshot } from '@/lib/supabase-data';

type View =
  | 'today'
  | 'pipeline'
  | 'calendar'
  | 'engagement'
  | 'reports'
  | 'requests'
  | 'people'
  | 'settings';
type MoveIntent = { item: ContentItem; toStage: Stage };
const ROLE_PERSON: Record<AppRole, string> = {
  Owner: 'p1',
  Admin: 'p2',
  'Content Producer': 'p4',
  'Content Approver': 'p8',
  Monitoring: 'p3',
  'Read-only Stakeholder': 'p9',
};
const stageToDb: Record<Stage, string> = {
  Idea: 'idea',
  Script: 'script',
  Shoot: 'shoot',
  Production: 'production',
  Upload: 'upload',
  'Post-Upload Metrics': 'post_upload_metrics',
};
const roleToDb: Record<Exclude<AppRole, 'Owner'>, string> = {
  Admin: 'admin',
  'Content Producer': 'content_producer',
  'Content Approver': 'content_approver',
  Monitoring: 'monitoring',
  'Read-only Stakeholder': 'read_only_stakeholder',
};
const pillarToDb: Record<ContentPillar, string> = {
  Knowledge: 'knowledge',
  Promotional: 'promotional',
  'AAFM India Insider': 'aafm_india_insider',
};

const nav: Array<{ view: View; label: string; icon: typeof LayoutDashboard }> =
  [
    { view: 'today', label: 'Today', icon: LayoutDashboard },
    { view: 'pipeline', label: 'Content pipeline', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: CalendarDays },
    { view: 'engagement', label: 'Engagement & leads', icon: Inbox },
    { view: 'reports', label: 'Reports', icon: BarChart3 },
    { view: 'requests', label: 'Content requests', icon: MessageSquareText },
    { view: 'people', label: 'People & access', icon: Users2 },
    { view: 'settings', label: 'Settings', icon: Settings2 },
  ];

export default function ContentOpsApp({
  supabaseConfig,
}: {
  supabaseConfig?: SupabaseConfig;
}) {
  const demoMode = !supabaseConfig;
  const client = useMemo(
    () => (supabaseConfig ? makeSupabaseClient(supabaseConfig) : null),
    [supabaseConfig],
  );
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [activeProfile, setActiveProfile] = useState(demoMode);
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [items, setItems] = useState<ContentItem[]>(demoItems);
  const [leads, setLeads] = useState<Lead[]>(demoLeads);
  const [inbox, setInbox] = useState<InboxItem[]>(demoInbox);
  const [requests, setRequests] = useState<DepartmentRequest[]>(demoRequests);
  const [currentUser, setCurrentUser] = useState<Person>(demoPeople[0]);
  const [currentRole, setCurrentRole] = useState<AppRole>('Owner');
  const [view, setView] = useState<View>('today');
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [overrideItem, setOverrideItem] = useState<ContentItem>();
  const [moveIntent, setMoveIntent] = useState<MoveIntent>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const reloadLive = useCallback(
    async (supabase: SupabaseClient, user: User) => {
      const snapshot = await loadLiveSnapshot(supabase, user);
      setPeople(snapshot.people);
      setItems(snapshot.items);
      setLeads(snapshot.leads);
      setInbox(snapshot.inbox);
      setRequests(snapshot.requests);
      setCurrentUser(snapshot.currentUser);
      setActiveProfile(snapshot.currentUserActive);
      if (snapshot.currentUser.roles.length)
        setCurrentRole(snapshot.currentUser.roles[0]);
    },
    [],
  );

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active) return;
        setAuthUser(data.user ?? null);
        if (data.user)
          await reloadLive(client, data.user).catch((error) =>
            setNotice(error.message),
          );
        setAuthReady(true);
      })
      .catch((error: Error) => {
        setNotice(error.message);
        setAuthReady(true);
      });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      if (user)
        void reloadLive(client, user).catch((error) =>
          setNotice(error.message),
        );
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client, reloadLive]);

  const rolePerson = demoMode
    ? (people.find((person) => person.id === ROLE_PERSON[currentRole]) ??
      currentUser)
    : currentUser;
  const effectiveRoles = useMemo(
    () => (demoMode ? [currentRole] : currentUser.roles),
    [demoMode, currentRole, currentUser.roles],
  );
  const selected = items.find((item) => item.id === selectedId);
  const visibleItems = useMemo(
    () => filterForRoles(items, effectiveRoles, rolePerson),
    [items, effectiveRoles, rolePerson],
  );
  const myActions = useMemo(
    () => getMyActions(visibleItems, effectiveRoles, rolePerson),
    [visibleItems, effectiveRoles, rolePerson],
  );
  const canManageAccess = effectiveRoles.includes('Owner');
  const canCreate = hasAnyRole(effectiveRoles, [
    'Owner',
    'Admin',
    'Content Producer',
  ]);
  const visibleNav = nav
    .filter((entry) => entry.view !== 'people' || canManageAccess)
    .filter(
      (entry) =>
        entry.view !== 'settings' ||
        hasAnyRole(effectiveRoles, ['Owner', 'Admin']),
    )
    .filter(
      (entry) =>
        entry.view !== 'engagement' ||
        hasAnyRole(effectiveRoles, ['Owner', 'Admin', 'Monitoring']),
    );
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const mutateLive = async (
    work: (supabase: SupabaseClient) => Promise<unknown>,
    success: string,
  ) => {
    if (!client || !authUser) return;
    setBusy(true);
    try {
      await work(client);
      await reloadLive(client, authUser);
      showNotice(success);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      setBusy(false);
    }
  };

  const submitStage = async (item: ContentItem) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.rpc('submit_current_stage', {
          p_item_id: item.id,
        });
        if (error) throw error;
      }, 'Sent for accountable approval.');
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              status: 'Pending approval',
              history: [
                ...row.history,
                {
                  action: `${row.stage} submitted for approval`,
                  actor: rolePerson.name,
                  at: 'Just now',
                },
              ],
            }
          : row,
      ),
    );
    showNotice('Sent for accountable approval.');
  };

  const advance = async (item: ContentItem, reason?: string) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.rpc('advance_content_item', {
          p_item_id: item.id,
          p_override_reason: reason || null,
          p_next_due_at: null,
        });
        if (error) throw error;
      }, 'Approval recorded and item advanced.');
    const index = PIPELINE.indexOf(item.stage);
    const last = index === PIPELINE.length - 1;
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              stage: last ? row.stage : PIPELINE[index + 1],
              workflowStep: last
                ? row.workflowStep
                : STAGE_STEPS[PIPELINE[index + 1]][0],
              status: last ? 'Approved' : 'In progress',
              lifecycle: last ? 'Closed' : 'Active',
              dueAt: last
                ? undefined
                : new Date(Date.now() + 48 * 3600_000).toISOString(),
              secondLens: reason
                ? 'Overridden'
                : last ||
                    !['Script', 'Production'].includes(
                      PIPELINE[index + 1] ?? '',
                    )
                  ? 'Not needed'
                  : 'Awaiting review',
              history: [
                ...row.history,
                {
                  action: last
                    ? 'Item closed'
                    : reason
                      ? `Advanced without second-lens review → ${PIPELINE[index + 1]}`
                      : `${row.stage} approved → ${PIPELINE[index + 1]}`,
                  actor: rolePerson.name,
                  at: 'Just now',
                  note: reason,
                  flagged: Boolean(reason),
                },
              ],
            }
          : row,
      ),
    );
    setOverrideItem(undefined);
    showNotice(last ? 'Item closed.' : 'Approval recorded and item advanced.');
  };

  const approve = (item: ContentItem) => {
    if (
      ['Script', 'Production'].includes(item.stage) &&
      item.secondLens !== 'Approved'
    )
      setOverrideItem(item);
    else void advance(item);
  };

  const requestMove = (item: ContentItem, toStage: Stage) => {
    const next = PIPELINE[PIPELINE.indexOf(item.stage) + 1];
    if (next !== toStage)
      return showNotice(
        'Cards move one stage at a time so every handoff stays accountable.',
      );
    if (
      item.status === 'Pending approval' &&
      !canApproveItem(item, effectiveRoles, rolePerson)
    )
      return showNotice('An accountable owner must approve this handoff.');
    if (
      item.status !== 'Pending approval' &&
      !canSubmitItem(item, effectiveRoles, rolePerson)
    )
      return showNotice('You are not assigned to submit this stage.');
    setMoveIntent({ item, toStage });
  };

  const confirmMove = () => {
    if (!moveIntent) return;
    const item = moveIntent.item;
    setMoveIntent(undefined);
    if (item.status === 'Pending approval') approve(item);
    else void submitStage(item);
  };

  const manageAccess = async (
    person: Person,
    isActive: boolean,
    roles: AppRole[],
  ) => {
    const assignable = roles.filter(
      (role): role is Exclude<AppRole, 'Owner'> => role !== 'Owner',
    );
    if (demoMode) {
      setPeople((all) =>
        all.map((entry) =>
          entry.id === person.id
            ? {
                ...entry,
                isActive,
                roles: entry.roles.includes('Owner') ? ['Owner'] : assignable,
              }
            : entry,
        ),
      );
      return showNotice(`${person.name}'s access was updated in the demo.`);
    }
    return mutateLive(async (supabase) => {
      const { error } = await supabase.rpc('manage_user_access', {
        p_profile_id: person.id,
        p_is_active: isActive,
        p_roles: assignable.map((role) => roleToDb[role]),
      });
      if (error) throw error;
    }, `${person.name}'s access was updated.`);
  };

  const requestChanges = async (item: ContentItem, note: string) => {
    if (!note.trim()) return showNotice('Add a short change note first.');
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.rpc('request_stage_changes', {
          p_item_id: item.id,
          p_note: note,
        });
        if (error) throw error;
      }, 'Changes requested.');
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              status: 'Changes requested',
              history: [
                ...row.history,
                {
                  action: `${row.stage} changes requested`,
                  actor: rolePerson.name,
                  at: 'Just now',
                  note,
                },
              ],
            }
          : row,
      ),
    );
    showNotice('Changes requested.');
  };

  const setWorkflowStep = async (item: ContentItem, step: string) => {
    if (!STAGE_STEPS[item.stage].includes(step)) return;
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.rpc('update_workflow_step', {
          p_item_id: item.id,
          p_workflow_step: step,
        });
        if (error) throw error;
      }, `Checkpoint moved to ${step}.`);
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              workflowStep: step,
              history: [
                ...row.history,
                {
                  action: `Checkpoint moved to ${step}`,
                  actor: rolePerson.name,
                  at: 'Just now',
                },
              ],
            }
          : row,
      ),
    );
    showNotice(`Checkpoint moved to ${step}.`);
  };

  const secondLensReview = async (
    item: ContentItem,
    approved: boolean,
    note: string,
  ) => {
    if (!demoMode)
      return mutateLive(
        async (supabase) => {
          const { error } = await supabase
            .from('stage_reviews')
            .insert({
              content_item_id: item.id,
              stage: stageToDb[item.stage],
              reviewer_id: authUser!.id,
              decision: approved ? 'approved' : 'changes_requested',
              note: note || null,
            });
          if (error) throw error;
        },
        approved
          ? 'Second-lens approval recorded.'
          : 'Second-lens changes requested.',
      );
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              secondLens: approved ? 'Approved' : 'Changes requested',
              comments: note
                ? [
                    ...row.comments,
                    {
                      id: crypto.randomUUID(),
                      author: rolePerson.name,
                      initials: rolePerson.initials,
                      body: note,
                      at: 'Just now',
                    },
                  ]
                : row.comments,
            }
          : row,
      ),
    );
    showNotice(
      approved
        ? 'Second-lens approval recorded.'
        : 'Second-lens changes requested.',
    );
  };

  const addComment = async (
    item: ContentItem,
    body: string,
    parentId?: string,
  ) => {
    if (!body.trim()) return;
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase
          .from('comments')
          .insert({
            content_item_id: item.id,
            parent_id: parentId ? Number(parentId) : null,
            author_id: authUser!.id,
            body: body.trim(),
            mentioned_profile_ids: [],
          });
        if (error) throw error;
      }, 'Comment added.');
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              comments: [
                ...row.comments,
                {
                  id: crypto.randomUUID(),
                  author: rolePerson.name,
                  initials: rolePerson.initials,
                  body: body.trim(),
                  at: 'Just now',
                  parentId,
                },
              ],
            }
          : row,
      ),
    );
    showNotice('Comment added.');
  };

  const addMetric = async (
    item: ContentItem,
    values: { views: number; likes: number; comments: number; shares: number },
  ) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase
          .from('metrics_entries')
          .upsert(
            {
              content_item_id: item.id,
              platform: item.platform,
              ...values,
              recorded_on: new Date().toISOString().slice(0, 10),
              recorded_by: authUser!.id,
              source: 'manual',
            },
            { onConflict: 'content_item_id,platform,recorded_on,source' },
          );
        if (error) throw error;
      }, 'Metrics snapshot saved.');
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              metrics: [
                {
                  id: crypto.randomUUID(),
                  platform: item.platform,
                  ...values,
                  recordedOn: new Date().toISOString().slice(0, 10),
                },
                ...row.metrics,
              ],
            }
          : row,
      ),
    );
    showNotice('Metrics snapshot saved.');
  };

  const createItem = async (draft: {
    title: string;
    contentType: string;
    platform: string;
    pillar: ContentPillar;
    dueAt: string;
    responsibleId: string;
    accountableIds: string[];
    copyOwners: boolean;
  }) => {
    const creator = rolePerson;
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { data, error } = await supabase
          .from('content_items')
          .insert({
            title: draft.title,
            content_type: draft.contentType,
            platform: draft.platform,
            content_pillar: pillarToDb[draft.pillar],
            workflow_step: STAGE_STEPS.Idea[0],
            due_at: draft.dueAt || null,
            created_by: authUser!.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        const assignmentStages = draft.copyOwners
          ? PIPELINE
          : (['Idea'] as const);
        const assignments = assignmentStages.flatMap((stage) => [
          {
            content_item_id: data.id,
            stage: stageToDb[stage],
            profile_id: draft.responsibleId,
            assignment_type: 'responsible',
          },
          ...draft.accountableIds.map((profileId) => ({
            content_item_id: data.id,
            stage: stageToDb[stage],
            profile_id: profileId,
            assignment_type: 'accountable',
          })),
        ]);
        const { error: assignmentError } = await supabase
          .from('item_stage_assignments')
          .insert(assignments);
        if (assignmentError) throw assignmentError;
      }, 'Content item created.');
    const responsible = people.filter(
      (person) => person.id === draft.responsibleId,
    );
    const accountable = people.filter((person) =>
      draft.accountableIds.includes(person.id),
    );
    setItems((all) => [
      {
        id: crypto.randomUUID(),
        title: draft.title,
        contentType: draft.contentType,
        platform: draft.platform,
        pillar: draft.pillar,
        workflowStep: STAGE_STEPS.Idea[0],
        stage: 'Idea',
        status: 'In progress',
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : undefined,
        reminderHours: 24,
        lifecycle: 'Active',
        responsible,
        accountable,
        secondLens: 'Not needed',
        links: [],
        comments: [],
        metrics: [],
        history: [
          { action: 'Item created', actor: creator.name, at: 'Just now' },
        ],
      },
      ...all,
    ]);
    setCreateOpen(false);
    showNotice('Content item created.');
  };

  const updateLead = async (id: string, status: LeadStatus) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase
          .from('leads')
          .update({
            status:
              status === 'Follow-up due'
                ? 'follow_up_due'
                : status.toLowerCase(),
          })
          .eq('id', id);
        if (error) throw error;
      }, 'Lead stage updated.');
    setLeads((all) =>
      all.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
    );
    showNotice('Lead stage updated.');
  };

  const updateInbox = async (id: string, status: InboxItem['status']) => {
    if (!demoMode)
      return mutateLive(
        async (supabase) => {
          const value =
            status === 'Needs reply'
              ? 'needs_reply'
              : status === 'Auto-response sent'
                ? 'auto_response_sent'
                : 'resolved';
          const { error } = await supabase
            .from('engagement_inbox')
            .update({ status: value })
            .eq('id', id);
          if (error) throw error;
        },
        status === 'Resolved' ? 'Conversation resolved.' : 'Inbox updated.',
      );
    setInbox((all) =>
      all.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
    );
    showNotice(
      status === 'Resolved' ? 'Conversation resolved.' : 'Inbox updated.',
    );
  };

  const addRequest = async (
    request: Omit<DepartmentRequest, 'id' | 'status'>,
  ) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase
          .from('department_requests')
          .insert({
            department: request.department,
            requester_name: request.requester,
            request_text: request.request,
            priority: request.priority.toLowerCase(),
            needed_by: request.neededBy,
            created_by: authUser!.id,
          });
        if (error) throw error;
      }, 'Content request submitted.');
    setRequests((all) => [
      { ...request, id: crypto.randomUUID(), status: 'New' },
      ...all,
    ]);
    showNotice('Content request submitted.');
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const requireEmptyObject = (input: unknown) => {
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length !== 0
      )
        throw new Error('Expected an empty object');
    };
    const tools = [
      {
        name: 'list_my_actions',
        title: 'List my actions',
        description:
          'List the current login’s approval, review, metrics and assigned-work actions.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input: unknown) => {
          requireEmptyObject(input);
          return myActions.map(({ item, kind, label }) => ({
            id: item.id,
            title: item.title,
            kind,
            label,
            stage: item.stage,
            dueAt: item.dueAt,
          }));
        },
      },
      {
        name: 'start_content_creation',
        title: 'Start content creation',
        description: 'Open the new content form without creating a record.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          requireEmptyObject(input);
          if (!canCreate) throw new Error('This login cannot create content');
          setCreateOpen(true);
          return { status: 'form_opened' };
        },
      },
      {
        name: 'submit_content_stage',
        title: 'Submit content stage',
        description:
          'Submit one assigned content item stage for accountable approval.',
        inputSchema: {
          type: 'object',
          properties: { contentItemId: { type: 'string' } },
          required: ['contentItemId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          if (
            !input ||
            typeof input !== 'object' ||
            Array.isArray(input) ||
            Object.keys(input).length !== 1 ||
            typeof (input as { contentItemId?: unknown }).contentItemId !==
              'string'
          )
            throw new Error('A contentItemId string is required');
          const id = (input as { contentItemId: string }).contentItemId;
          const item = visibleItems.find((row) => row.id === id);
          if (!item) throw new Error('Visible content item not found');
          if (!canSubmitItem(item, effectiveRoles, rolePerson))
            throw new Error('This login is not assigned to submit the item');
          await submitStage(item);
          return { id: item.id, status: 'pending_approval' };
        },
      },
    ];
    for (const tool of tools)
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    return () => lifecycle.abort();
    // Re-register only when the visible permission context changes; submitStage reads the same current context.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems, myActions, canCreate, effectiveRoles, rolePerson]);

  if (!authReady) return <LoadingScreen />;
  if (!demoMode && !authUser)
    return (
      <LoginScreen client={client!} notice={notice} setNotice={setNotice} />
    );
  if (!demoMode && !activeProfile)
    return (
      <PendingAccess
        email={authUser?.email ?? ''}
        signOut={() => void client?.auth.signOut()}
      />
    );

  return (
    <SidebarProvider>
      <Sidebar className="border-r-0" collapsible="offcanvas">
        <SidebarHeader className="px-5 pb-6 pt-6">
          <div className="flex items-center gap-3">
            <LogoMonogram />
            <div>
              <p className="brand-name">AAFM India</p>
              <p className="text-xs text-white/55">Content operations</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
              Workspace
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5 px-2">
                {visibleNav.map(({ view: target, label, icon: Icon }) => (
                  <SidebarMenuItem key={target}>
                    <SidebarMenuButton
                      isActive={view === target}
                      onClick={() => setView(target)}
                      className="h-10 text-[14px] text-white/70 hover:bg-white/10 hover:text-white data-active:bg-white/12 data-active:text-white"
                    >
                      <Icon />
                      <span>{label}</span>
                      {target === 'today' && myActions.length > 0 && (
                        <Badge className="ml-auto bg-[#dfa126] text-[#1f2342]">
                          {myActions.length}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <div className="rounded-xl border border-white/10 bg-white/6 p-3">
            <div className="flex items-center gap-2.5">
              <Avatar person={rolePerson} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {rolePerson.name}
                </p>
                <p className="truncate text-xs text-white/45">
                  {effectiveRoles.join(' · ')}
                  {demoMode ? ' · demo' : ''}
                </p>
              </div>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#f4f1ea]">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#1f2342]/8 bg-[#f4f1ea]/92 px-4 py-2 backdrop-blur-md sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="md:hidden" />
            <Image
              src="/aafm-india-logo.png"
              alt="AAFM India"
              width={1684}
              height={594}
              className="hidden h-8 w-auto sm:block"
            />
            <div className="hidden border-l border-[#1f2342]/12 pl-3 lg:block">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a5200]">
                Content operations
              </p>
              <p className="text-sm text-[#525570]">Asia/Kolkata</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {demoMode && (
              <NativeSelect
                aria-label="Preview login role"
                value={currentRole}
                onChange={(event) => {
                  const role = event.target.value as AppRole;
                  setCurrentRole(role);
                  setCurrentUser(
                    people.find((person) => person.id === ROLE_PERSON[role]) ??
                      currentUser,
                  );
                  setView('today');
                }}
                className="max-w-[190px] bg-white"
              >
                <NativeSelectOption>Owner</NativeSelectOption>
                <NativeSelectOption>Admin</NativeSelectOption>
                <NativeSelectOption>Content Producer</NativeSelectOption>
                <NativeSelectOption>Content Approver</NativeSelectOption>
                <NativeSelectOption>Monitoring</NativeSelectOption>
                <NativeSelectOption>Read-only Stakeholder</NativeSelectOption>
              </NativeSelect>
            )}
            <Button variant="outline" size="icon" aria-label="Notifications" onClick={() => showNotice(myActions.length ? `${myActions.length} action${myActions.length === 1 ? '' : 's'} need your attention.` : 'You are all caught up.')}>
              <Bell />
            </Button>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-[#1f2342] text-white hover:bg-[#2d3159]"
              >
                <Plus /> <span className="hidden sm:inline">New content</span>
              </Button>
            )}
            {!demoMode && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => void client?.auth.signOut()}
              >
                <LogOut />
              </Button>
            )}
          </div>
        </header>
        {notice && (
          <output className="fixed right-4 top-20 z-50 max-w-sm rounded-xl bg-[#1f2342] px-4 py-3 text-sm text-white shadow-xl">
            {notice}
          </output>
        )}
        <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          {view === 'today' && (
            <Today
              items={visibleItems}
              actions={myActions}
              inbox={inbox}
              leads={leads}
              onOpen={(id) => setSelectedId(id)}
              onReview={secondLensReview}
              onSaveMetric={addMetric}
              setView={setView}
            />
          )}
          {view === 'pipeline' && (
            <Pipeline
              items={visibleItems}
              roles={effectiveRoles}
              person={rolePerson}
              onOpen={(id) => setSelectedId(id)}
              onMove={requestMove}
            />
          )}
          {view === 'calendar' && (
            <ContentCalendar
              items={visibleItems}
              onOpen={(id) => setSelectedId(id)}
            />
          )}
          {view === 'engagement' && (
            <EngagementAndLeads
              inbox={inbox}
              leads={leads}
              onInboxUpdate={updateInbox}
              onLeadUpdate={updateLead}
            />
          )}
          {view === 'reports' && (
            <Reports
              items={visibleItems}
              leads={leads}
              onOpen={(id) => setSelectedId(id)}
            />
          )}
          {view === 'requests' && (
            <Requests
              requests={requests}
              canCreate={canCreate}
              onCreate={addRequest}
            />
          )}
          {view === 'people' && (
            <People
              people={people}
              demoMode={demoMode}
              onManage={manageAccess}
            />
          )}
          {view === 'settings' && <Settings demoMode={demoMode} />}
        </main>
      </SidebarInset>
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={people}
        onCreate={createItem}
      />
      <ItemDetail
        open={Boolean(selected)}
        item={selected}
        roles={effectiveRoles}
        person={rolePerson}
        busy={busy}
        onOpenChange={(open) => !open && setSelectedId(undefined)}
        onStepChange={setWorkflowStep}
        onSubmit={submitStage}
        onApprove={approve}
        onRequestChanges={requestChanges}
        onComment={addComment}
        onMetric={addMetric}
      />
      <OverrideDialog
        item={overrideItem}
        onOpenChange={(open) => !open && setOverrideItem(undefined)}
        onConfirm={advance}
      />
      <MoveDialog
        intent={moveIntent}
        onOpenChange={(open) => !open && setMoveIntent(undefined)}
        onConfirm={confirmMove}
      />
    </SidebarProvider>
  );
}

function hasAnyRole(roles: AppRole[], expected: AppRole[]) {
  return expected.some((role) => roles.includes(role));
}
function isAssigned(
  item: ContentItem,
  person: Person,
  kind: 'responsible' | 'accountable' | 'either' = 'either',
) {
  const assigned =
    kind === 'responsible'
      ? item.responsible
      : kind === 'accountable'
        ? item.accountable
        : [...item.responsible, ...item.accountable];
  return assigned.some((owner) => owner.id === person.id);
}
function canSubmitItem(item: ContentItem, roles: AppRole[], person: Person) {
  return hasAnyRole(roles, ['Owner', 'Admin']) || isAssigned(item, person);
}
function canApproveItem(item: ContentItem, roles: AppRole[], person: Person) {
  return (
    hasAnyRole(roles, ['Owner', 'Admin']) ||
    isAssigned(item, person, 'accountable')
  );
}
function filterForRoles(
  items: ContentItem[],
  roles: AppRole[],
  person: Person,
) {
  if (hasAnyRole(roles, ['Owner', 'Admin', 'Read-only Stakeholder']))
    return items;
  return items.filter(
    (item) =>
      isAssigned(item, person) ||
      (roles.includes('Content Approver') &&
        ['Script', 'Production'].includes(item.stage)) ||
      (roles.includes('Monitoring') &&
        (item.stage === 'Post-Upload Metrics' || Boolean(item.publishedAt))),
  );
}

type ActionItem = {
  item: ContentItem;
  kind: 'approval' | 'second-lens' | 'metrics' | 'work';
  label: string;
  priority: number;
};
function getMyActions(
  items: ContentItem[],
  roles: AppRole[],
  person: Person,
): ActionItem[] {
  const elevated = hasAnyRole(roles, ['Owner', 'Admin']);
  const actions: ActionItem[] = [];
  for (const item of items.filter((row) => row.lifecycle === 'Active')) {
    if (
      item.status === 'Pending approval' &&
      (elevated || isAssigned(item, person, 'accountable'))
    )
      actions.push({
        item,
        kind: 'approval',
        label: 'Approve this handoff',
        priority: isOverdue(item) ? 0 : 1,
      });
    if (
      ['Script', 'Production'].includes(item.stage) &&
      item.secondLens === 'Awaiting review' &&
      (elevated || roles.includes('Content Approver'))
    )
      actions.push({
        item,
        kind: 'second-lens',
        label: 'Complete second-lens review',
        priority: 1,
      });
    if (
      item.stage === 'Post-Upload Metrics' &&
      item.metrics.length === 0 &&
      (elevated || roles.includes('Monitoring'))
    )
      actions.push({
        item,
        kind: 'metrics',
        label: 'Add performance metrics',
        priority: isOverdue(item) ? 0 : 2,
      });
    if (
      item.status !== 'Pending approval' &&
      (elevated ? isOverdue(item) : isAssigned(item, person, 'responsible'))
    )
      actions.push({
        item,
        kind: 'work',
        label:
          item.status === 'Changes requested'
            ? 'Make requested changes'
            : 'Continue your stage work',
        priority: isOverdue(item) ? 0 : 3,
      });
  }
  return actions.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.item.dueAt ?? '').localeCompare(b.item.dueAt ?? ''),
  );
}

function isOverdue(item: ContentItem) {
  return Boolean(
    item.dueAt &&
    new Date(item.dueAt).getTime() < Date.now() &&
    item.lifecycle === 'Active',
  );
}
function dueLabel(item: ContentItem) {
  if (!item.dueAt) return 'No due date';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(item.dueAt));
}
function stagePercent(stage: Stage) {
  return ((PIPELINE.indexOf(stage) + 1) / PIPELINE.length) * 100;
}
function LogoMonogram() {
  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-white shadow-sm">
      <Image
        src="/aafm-india-logo.png"
        alt=""
        width={1684}
        height={594}
        className="absolute -left-[3px] -top-[3px] h-[58px] w-auto max-w-none"
      />
    </div>
  );
}
function Avatar({ person }: { person: Person }) {
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dfa126] text-[11px] font-bold text-[#1f2342]">
      {person.initials}
    </div>
  );
}
function Owners({ people }: { people: Person[] }) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, 3).map((person) => (
        <div
          key={person.id}
          title={person.name}
          className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#eceef7] text-[10px] font-bold text-[#1f2342]"
        >
          {person.initials}
        </div>
      ))}
      {people.length > 3 && (
        <div className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#1f2342] text-[10px] text-white">
          +{people.length - 3}
        </div>
      )}
    </div>
  );
}
function StatusBadge({ item }: { item: ContentItem }) {
  const cls =
    item.status === 'Pending approval'
      ? 'bg-[#f7efdd] text-[#7a5200]'
      : item.status === 'Changes requested'
        ? 'bg-[#fff0e8] text-[#b34726]'
        : 'bg-[#eceef7] text-[#1f2342]';
  return <Badge className={cls}>{item.status}</Badge>;
}
function PillarBadge({ pillar }: { pillar: ContentPillar }) {
  const cls =
    pillar === 'Knowledge'
      ? 'bg-[#eaf1f8] text-[#315d7a]'
      : pillar === 'Promotional'
        ? 'bg-[#fff0e8] text-[#a74325]'
        : 'bg-[#eeebf8] text-[#5f4c88]';
  return <Badge className={cls}>{pillar}</Badge>;
}
function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="mb-2 text-sm font-semibold text-[#b27708]">{eyebrow}</p>
      <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-[#1f2342] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-base text-[#6b7280]">{description}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CircleGauge;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <Card
      className={`border-0 shadow-[0_10px_30px_rgba(31,35,66,0.045)] ring-1 ring-[#1f2342]/8 ${accent ? 'bg-[#1f2342] text-white' : 'bg-white'}`}
    >
      <CardHeader>
        <CardDescription
          className={accent ? 'text-white/55' : 'text-[#6b7280]'}
        >
          {label}
        </CardDescription>
        <CardAction>
          <div
            className={`grid size-9 place-items-center rounded-lg ${warning ? 'bg-[#fff0e8] text-[#b34726]' : accent ? 'bg-white/10 text-[#f0c254]' : 'bg-[#f7efdd] text-[#9a6908]'}`}
          >
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p
          className={`font-display text-3xl font-semibold ${accent ? 'text-white' : 'text-[#1f2342]'}`}
        >
          {value}
        </p>
        <p
          className={`mt-2 text-xs ${accent ? 'text-white/45' : warning ? 'text-[#b34726]' : 'text-[#8b8e9e]'}`}
        >
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function Today({
  items,
  actions,
  inbox,
  leads,
  onOpen,
  onReview,
  onSaveMetric,
  setView,
}: {
  items: ContentItem[];
  actions: ActionItem[];
  inbox: InboxItem[];
  leads: Lead[];
  onOpen: (id: string) => void;
  onReview: (item: ContentItem, approved: boolean, note: string) => void;
  onSaveMetric: (
    item: ContentItem,
    values: { views: number; likes: number; comments: number; shares: number },
  ) => void;
  setView: (view: View) => void;
}) {
  const active = items.filter((item) => item.lifecycle === 'Active');
  const approvals = actions.filter(
    (action) => action.kind === 'approval' || action.kind === 'second-lens',
  );
  const assigned = actions.filter((action) => action.kind === 'work');
  const metrics = actions.filter((action) => action.kind === 'metrics');
  const overdue = active.filter(isOverdue);
  return (
    <>
      <PageTitle
        eyebrow="TODAY"
        title="One clear list. Then keep moving."
        description="This page changes with the login: assigned work, approvals and follow-ups appear only for the person who needs to act."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Your actions"
          value={String(actions.length)}
          detail="Personal to this login"
          icon={Sparkles}
          accent
        />
        <MetricCard
          label="Approval queue"
          value={String(approvals.length)}
          detail="Only sign-offs you can complete"
          icon={FileCheck2}
        />
        <MetricCard
          label="Overdue"
          value={String(overdue.length)}
          detail={
            overdue.length ? 'Needs attention today' : 'Everything on track'
          }
          icon={AlertTriangle}
          warning
        />
        <MetricCard
          label="Lead follow-ups"
          value={String(
            leads.filter((lead) => lead.status === 'Follow-up due').length,
          )}
          detail="Owned by the receiving team"
          icon={Users2}
        />
      </section>
      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <div className="space-y-5">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>
                Items shown here are waiting for your review or accountable
                sign-off.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvals.length ? (
                approvals.map(({ item, kind, label }) =>
                  kind === 'second-lens' ? (
                    <ReviewCard
                      key={`${kind}-${item.id}`}
                      item={item}
                      onOpen={onOpen}
                      onReview={onReview}
                    />
                  ) : (
                    <ActionRow
                      key={`${kind}-${item.id}`}
                      item={item}
                      label={label}
                      onOpen={onOpen}
                    />
                  ),
                )
              ) : (
                <EmptyState text="No approvals need you right now." />
              )}
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Your production work</CardTitle>
              <CardDescription>
                Work assigned to you, ordered by urgency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {assigned.length ? (
                assigned.map(({ item, label, kind }) => (
                  <ActionRow
                    key={`${kind}-${item.id}`}
                    item={item}
                    label={label}
                    onOpen={onOpen}
                  />
                ))
              ) : (
                <EmptyState text="No production tasks are waiting on you." />
              )}
            </CardContent>
          </Card>
          {metrics.length > 0 && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Metrics to record</CardTitle>
                <CardDescription>
                  Complete the post-upload feedback loop.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {metrics.map(({ item }) => (
                  <MetricsCard
                    key={item.id}
                    item={item}
                    onSave={onSaveMetric}
                    onOpen={onOpen}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card className="bg-[#202546] text-white ring-0">
            <CardHeader>
              <CardTitle>Pipeline pulse</CardTitle>
              <CardDescription className="text-white/55">
                {active.length} active content items
              </CardDescription>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setView('pipeline')}
                >
                  Open board <ChevronRight />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {PIPELINE.map((stage) => (
                <button
                  key={stage}
                  onClick={() => setView('pipeline')}
                  className="flex w-full items-center gap-3 rounded-lg text-left"
                >
                  <span className="w-32 truncate text-sm text-white/70">
                    {stage}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-[#eeaa2c]"
                      style={{
                        width: `${Math.max(8, (active.filter((item) => item.stage === stage).length / Math.max(1, active.length)) * 100)}%`,
                      }}
                    />
                  </span>
                  <strong className="w-4 text-sm">
                    {active.filter((item) => item.stage === stage).length}
                  </strong>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Community watch</CardTitle>
              <CardDescription>
                Comments and DMs that still need a human.
              </CardDescription>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView('engagement')}
                >
                  Open inbox <ChevronRight />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {inbox
                .filter((entry) => entry.status === 'Needs reply')
                .slice(0, 3)
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-[#1f2342]/8 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{entry.person}</p>
                      {entry.sensitive && (
                        <Badge className="bg-[#fff0e8] text-[#a23e22]">
                          Human reply
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-[#6b7280]">
                      {entry.message}
                    </p>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}

function ActionRow({
  item,
  label,
  onOpen,
}: {
  item: ContentItem;
  label: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(item.id)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-[#1f2342]/9 p-3.5 text-left transition hover:border-[#dfa126]/60 hover:bg-[#fbfaf6]"
    >
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap gap-2">
          <Badge className="bg-[#f7efdd] text-[#74500a]">{label}</Badge>
          {isOverdue(item) && <Badge variant="destructive">Overdue</Badge>}
        </div>
        <p className="truncate text-sm font-semibold text-[#1f2342]">
          {item.title}
        </p>
        <p className="mt-1 text-xs text-[#707487]">
          {item.stage} · {item.workflowStep} · {dueLabel(item)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-[#9296a5]" />
    </button>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-[#1f2342]/15 py-8 text-center">
      <CheckCircle2 className="mb-2 size-6 text-[#3b9171]" />
      <p className="text-sm text-[#6b7280]">{text}</p>
    </div>
  );
}

// oxlint-disable-next-line no-unused-vars -- kept as a compact reusable table for future embedded summaries
function ItemTable({
  items,
  onOpen,
}: {
  items: ContentItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Content</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Accountable</TableHead>
          <TableHead>Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className="cursor-pointer"
            onClick={() => onOpen(item.id)}
          >
            <TableCell className="min-w-[250px]">
              <p className="font-medium text-[#1f2342]">{item.title}</p>
              <p className="mt-1 text-xs text-[#7b7f90]">{item.contentType}</p>
            </TableCell>
            <TableCell>
              <div className="space-y-2">
                <StatusBadge item={item} />
                <p className="text-xs text-[#7b7f90]">{item.stage}</p>
              </div>
            </TableCell>
            <TableCell>
              <Owners people={item.accountable} />
            </TableCell>
            <TableCell
              className={
                isOverdue(item)
                  ? 'font-medium text-[#b34726]'
                  : 'text-[#525570]'
              }
            >
              {dueLabel(item)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Pipeline({
  items,
  roles,
  person,
  onOpen,
  onMove,
}: {
  items: ContentItem[];
  roles: AppRole[];
  person: Person;
  onOpen: (id: string) => void;
  onMove: (item: ContentItem, stage: Stage) => void;
}) {
  const stageStyles = [
    'border-t-[#77809b] bg-[#eef0f5]',
    'border-t-[#dfa126] bg-[#fbf2dc]',
    'border-t-[#4e91ad] bg-[#e9f3f6]',
    'border-t-[#8b70ab] bg-[#f1edf6]',
    'border-t-[#3b9171] bg-[#e9f4ef]',
    'border-t-[#1f2342] bg-[#e9eaf0]',
  ];
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle
          eyebrow="CONTENT PIPELINE"
          title="Six headings. Every departmental checkpoint."
          description="Research, compliance, creative approvals, publishing and reporting stay visible inside the six stages your team already knows."
        />
        <div className="mb-7 flex shrink-0 items-center gap-2 rounded-xl border border-[#1f2342]/10 bg-white px-3 py-2 text-sm text-[#525570]">
          <GripVertical className="size-4 text-[#9a6908]" /> Dragging always
          asks for confirmation
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
        <div className="grid min-w-max grid-cols-6 gap-4">
          {PIPELINE.map((stage, index) => {
            const rows = items.filter(
              (item) => item.stage === stage && item.lifecycle === 'Active',
            );
            return (
              <section
                key={stage}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const item = items.find(
                    (entry) =>
                      entry.id ===
                      event.dataTransfer.getData('text/content-item'),
                  );
                  if (item) onMove(item, stage);
                }}
                className={`w-[286px] rounded-2xl border border-t-4 border-[#1f2342]/10 p-3 ${stageStyles[index]}`}
              >
                <div className="mb-3 flex items-center justify-between px-1 py-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#9b6908]">
                      0{index + 1}
                    </p>
                    <h2 className="mt-0.5 text-base font-semibold text-[#1f2342]">
                      {stage}
                    </h2>
                    <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-[#707487]">
                      {STAGE_STEPS[stage].join(' · ')}
                    </p>
                  </div>
                  <Badge className="bg-white text-[#1f2342] shadow-sm">
                    {rows.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {rows.map((item) => {
                    const movable =
                      item.status === 'Pending approval'
                        ? canApproveItem(item, roles, person)
                        : canSubmitItem(item, roles, person);
                    const next = PIPELINE[index + 1];
                    return (
                      <article
                        key={item.id}
                        className={`group rounded-xl border border-[#1f2342]/9 bg-white p-3.5 shadow-[0_5px_18px_rgba(31,35,66,0.07)] transition hover:-translate-y-0.5 hover:shadow-md ${movable && next ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            aria-label={`Drag ${item.title}`}
                            draggable={Boolean(movable && next)}
                            disabled={!movable || !next}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                'text/content-item',
                                item.id,
                              );
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            className="mt-0.5 shrink-0 cursor-grab text-[#a7a9b5] group-hover:text-[#6f7285] disabled:cursor-default"
                          >
                            <GripVertical className="size-4" />
                          </button>
                          <button
                            onClick={() => onOpen(item.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="text-sm font-semibold leading-snug text-[#1f2342]">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs text-[#7b7f90]">
                              {item.contentType} · {item.platform}
                            </p>
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <PillarBadge pillar={item.pillar} />
                          <StatusBadge item={item} />
                        </div>
                        <div className="mt-3 rounded-lg bg-[#f7f6f1] px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a6a25]">
                            Current checkpoint
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-[#333852]">
                            {item.workflowStep}
                          </p>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <Owners people={item.accountable} />
                          <span
                            className={`flex items-center gap-1 text-xs ${isOverdue(item) ? 'font-semibold text-[#b34726]' : 'text-[#6f7285]'}`}
                          >
                            <Clock3 className="size-3.5" />
                            {dueLabel(item)}
                          </span>
                        </div>
                        {next && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!movable}
                            onClick={() => onMove(item, next)}
                            className="mt-3 w-full justify-between text-[#525570]"
                          >
                            {item.status === 'Pending approval'
                              ? 'Review handoff'
                              : 'Submit handoff'}{' '}
                            <ArrowRight />
                          </Button>
                        )}
                      </article>
                    );
                  })}
                  {!rows.length && (
                    <div className="rounded-xl border border-dashed border-[#1f2342]/20 bg-white/45 px-3 py-10 text-center text-sm text-[#7b7f90]">
                      Drop the next item here
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ContentCalendar({
  items,
  onOpen,
}: {
  items: ContentItem[];
  onOpen: (id: string) => void;
}) {
  const scheduled = [...items]
    .filter((item) => item.lifecycle === 'Active' && item.dueAt)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const dayKeys = [
    '2026-09-11',
    '2026-09-12',
    '2026-09-13',
    '2026-09-14',
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
  ];
  return (
    <>
      <PageTitle
        eyebrow="CONTENT CALENDAR"
        title="See the week before it becomes urgent."
        description="Due dates, platforms and content mix sit in one schedule. Every date uses Asia/Kolkata."
      />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {dayKeys.map((key, index) => {
          const count = scheduled.filter((item) =>
            item.dueAt?.startsWith(key),
          ).length;
          const date = new Date(`${key}T12:00:00+05:30`);
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 ${index === 0 ? 'border-[#dfa126] bg-[#fff8e8]' : 'border-[#1f2342]/9 bg-white'}`}
            >
              <p className="text-xs font-medium text-[#777b8d]">
                {new Intl.DateTimeFormat('en-IN', {
                  weekday: 'short',
                  timeZone: 'Asia/Kolkata',
                }).format(date)}
              </p>
              <div className="mt-1 flex items-end justify-between">
                <p className="font-display text-2xl font-semibold text-[#1f2342]">
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    timeZone: 'Asia/Kolkata',
                  }).format(date)}
                </p>
                <Badge
                  className={
                    count
                      ? 'bg-[#1f2342] text-white'
                      : 'bg-[#f0f1f5] text-[#777b8d]'
                  }
                >
                  {count}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Upcoming schedule</CardTitle>
          <CardDescription>
            {scheduled.length} active deadlines, ordered by time
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & time</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Mix</TableHead>
                <TableHead>Checkpoint</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduled.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(item.id)}
                >
                  <TableCell
                    className={`min-w-32 ${isOverdue(item) ? 'font-semibold text-[#b34726]' : ''}`}
                  >
                    {dueLabel(item)}
                  </TableCell>
                  <TableCell className="min-w-64">
                    <p className="font-medium text-[#1f2342]">{item.title}</p>
                    <p className="mt-1 text-xs text-[#777b8d]">
                      {item.platform} · {item.contentType}
                    </p>
                  </TableCell>
                  <TableCell>
                    <PillarBadge pillar={item.pillar} />
                  </TableCell>
                  <TableCell className="min-w-44">
                    <p className="text-sm font-medium">{item.workflowStep}</p>
                    <p className="mt-1 text-xs text-[#777b8d]">{item.stage}</p>
                  </TableCell>
                  <TableCell>
                    <Owners people={item.responsible} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function EngagementAndLeads({
  inbox,
  leads,
  onInboxUpdate,
  onLeadUpdate,
}: {
  inbox: InboxItem[];
  leads: Lead[];
  onInboxUpdate: (id: string, status: InboxItem['status']) => void;
  onLeadUpdate: (id: string, status: LeadStatus) => void;
}) {
  return (
    <>
      <PageTitle
        eyebrow="ENGAGEMENT & LEADS"
        title="Respond, route, follow up."
        description="Automation handles known keywords and capture. Sensitive replies, ownership and conversion decisions remain human-controlled."
      />
      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">
            Inbox ({inbox.filter((item) => item.status !== 'Resolved').length})
          </TabsTrigger>
          <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="pt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {inbox.map((item) => (
              <Card
                key={item.id}
                className={`bg-white ${item.sensitive ? 'ring-1 ring-[#d77654]/45' : ''}`}
              >
                <CardHeader>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{item.person}</CardTitle>
                      <Badge variant="secondary">{item.channel}</Badge>
                      {item.sensitive && (
                        <Badge className="bg-[#fff0e8] text-[#a23e22]">
                          Sensitive · human only
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      {item.detectedKeyword
                        ? `Keyword detected: ${item.detectedKeyword}`
                        : 'No automatic keyword match'}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="rounded-xl bg-[#f6f4ee] p-4 text-sm leading-relaxed text-[#454a61]">
                    {item.message}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <StatusPill value={item.status} />
                    <div className="flex gap-2">
                      {item.status === 'Needs reply' && (
                        <Button
                          size="sm"
                          onClick={() => onInboxUpdate(item.id, 'Resolved')}
                        >
                          Mark replied
                        </Button>
                      )}
                      {item.status === 'Auto-response sent' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onInboxUpdate(item.id, 'Resolved')}
                        >
                          Confirm resolved
                        </Button>
                      )}
                      {item.status === 'Resolved' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onInboxUpdate(item.id, 'Needs reply')}
                        >
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="leads" className="pt-5">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Lead routing</CardTitle>
              <CardDescription>
                Captured from comments and DMs, then owned by the relevant
                department.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Routed to</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="min-w-44">
                        <p className="font-medium">{lead.name}</p>
                        <p className="mt-1 text-xs text-[#777b8d]">
                          {lead.source} · {lead.capturedAt}
                        </p>
                      </TableCell>
                      <TableCell>{lead.interest}</TableCell>
                      <TableCell>{lead.owner}</TableCell>
                      <TableCell
                        className={
                          lead.status === 'Follow-up due'
                            ? 'font-semibold text-[#b34726]'
                            : ''
                        }
                      >
                        {lead.nextFollowUp ?? 'Complete'}
                      </TableCell>
                      <TableCell>
                        <NativeSelect
                          aria-label={`Status for ${lead.name}`}
                          value={lead.status}
                          onChange={(event) =>
                            onLeadUpdate(
                              lead.id,
                              event.target.value as LeadStatus,
                            )
                          }
                          className="min-w-36 bg-white"
                        >
                          {(
                            [
                              'New',
                              'Qualified',
                              'Follow-up due',
                              'Converted',
                            ] as LeadStatus[]
                          ).map((status) => (
                            <NativeSelectOption key={status}>
                              {status}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function StatusPill({ value }: { value: InboxItem['status'] }) {
  const cls =
    value === 'Needs reply'
      ? 'bg-[#fff0e8] text-[#a23e22]'
      : value === 'Resolved'
        ? 'bg-[#e8f5ef] text-[#287354]'
        : 'bg-[#f7efdd] text-[#74500a]';
  return <Badge className={cls}>{value}</Badge>;
}

function Reports({
  items,
  leads,
  onOpen,
}: {
  items: ContentItem[];
  leads: Lead[];
  onOpen: (id: string) => void;
}) {
  const targets: Array<{
    pillar: ContentPillar;
    target: number;
    color: string;
  }> = [
    { pillar: 'Knowledge', target: 60, color: '#384d78' },
    { pillar: 'Promotional', target: 20, color: '#eea42f' },
    { pillar: 'AAFM India Insider', target: 20, color: '#73709a' },
  ];
  const total = Math.max(1, items.length);
  const metrics = items.flatMap((item) =>
    item.metrics.map((entry) => ({ item, entry })),
  );
  const views = metrics.reduce((sum, row) => sum + row.entry.views, 0);
  const engagements = metrics.reduce(
    (sum, row) => sum + row.entry.likes + row.entry.comments + row.entry.shares,
    0,
  );
  return (
    <>
      <PageTitle
        eyebrow="REPORTS"
        title="Know what moved—and what worked."
        description="Content balance, publishing output, engagement and lead conversion in one weekly-ready view."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Published"
          value={String(items.filter((item) => item.publishedAt).length)}
          detail="Tracked live links"
          icon={UploadCloud}
        />
        <MetricCard
          label="Recorded views"
          value={new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(
            views,
          )}
          detail="Latest manual snapshots"
          icon={BarChart3}
          accent
        />
        <MetricCard
          label="Engagements"
          value={new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(
            engagements,
          )}
          detail="Likes, comments and shares"
          icon={MessageSquareText}
        />
        <MetricCard
          label="Lead conversion"
          value={`${Math.round((leads.filter((lead) => lead.status === 'Converted').length / Math.max(1, leads.length)) * 100)}%`}
          detail={`${leads.filter((lead) => lead.status === 'Converted').length} of ${leads.length} captured leads`}
          icon={Users2}
        />
      </section>
      <section className="mt-6 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Content mix</CardTitle>
            <CardDescription>
              Target: 60% knowledge · 20% promotional · 20% insider
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {targets.map(({ pillar, target, color }) => {
              const count = items.filter(
                (item) => item.pillar === pillar,
              ).length;
              const actual = Math.round((count / total) * 100);
              return (
                <div key={pillar}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      <p className="text-sm font-medium">{pillar}</p>
                    </div>
                    <p className="text-sm">
                      <strong>{actual}%</strong>
                      <span className="ml-2 text-[#858898]">
                        target {target}%
                      </span>
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#ececf0]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${actual}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Latest content performance</CardTitle>
            <CardDescription>
              Open any item for the full history and snapshots.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.length ? (
              metrics.map(({ item, entry }) => (
                <button
                  key={entry.id}
                  aria-label={`Open performance for ${item.title}`}
                  onClick={() => onOpen(item.id)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-[#1f2342]/8 p-3.5 text-left hover:bg-[#fbfaf6]"
                >
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-[#777b8d]">
                      {entry.platform} · {entry.recordedOn}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold">
                      {new Intl.NumberFormat('en-IN', {
                        notation: 'compact',
                      }).format(entry.views)}
                    </p>
                    <p className="text-[11px] text-[#777b8d]">views</p>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState text="Metrics will appear after the first snapshots are recorded." />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Requests({
  requests,
  canCreate,
  onCreate,
}: {
  requests: DepartmentRequest[];
  canCreate: boolean;
  onCreate: (request: Omit<DepartmentRequest, 'id' | 'status'>) => void;
}) {
  const [department, setDepartment] = useState('Admissions');
  const [requester, setRequester] = useState('');
  const [request, setRequest] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [priority, setPriority] = useState<'Normal' | 'Urgent'>('Normal');
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requester.trim() || !request.trim() || !neededBy) return;
    onCreate({
      department,
      requester: requester.trim(),
      request: request.trim(),
      neededBy,
      priority,
    });
    setRequester('');
    setRequest('');
    setNeededBy('');
  };
  return (
    <>
      <PageTitle
        eyebrow="CONTENT REQUESTS"
        title="A clean front door for every department."
        description="Requests arrive with an owner, deadline and priority before the content team plans them into Idea."
      />
      <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
        <Card className="h-fit bg-white">
          <CardHeader>
            <CardTitle>New request</CardTitle>
            <CardDescription>
              For admissions, academics, events and other AAFM India teams.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canCreate ? (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1.5">Department</Label>
                    <NativeSelect
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="w-full"
                    >
                      <NativeSelectOption>Admissions</NativeSelectOption>
                      <NativeSelectOption>Academic Team</NativeSelectOption>
                      <NativeSelectOption>Events</NativeSelectOption>
                      <NativeSelectOption>
                        Corporate Relations
                      </NativeSelectOption>
                      <NativeSelectOption>Other</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div>
                    <Label className="mb-1.5">Requested by</Label>
                    <Input
                      value={requester}
                      onChange={(event) => setRequester(event.target.value)}
                      placeholder="Name"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5">What is needed?</Label>
                  <Textarea
                    value={request}
                    onChange={(event) => setRequest(event.target.value)}
                    placeholder="Describe the content and intended outcome"
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1.5">Needed by</Label>
                    <Input
                      type="date"
                      value={neededBy}
                      onChange={(event) => setNeededBy(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5">Priority</Label>
                    <NativeSelect
                      value={priority}
                      onChange={(event) =>
                        setPriority(event.target.value as 'Normal' | 'Urgent')
                      }
                      className="w-full"
                    >
                      <NativeSelectOption>Normal</NativeSelectOption>
                      <NativeSelectOption>Urgent</NativeSelectOption>
                    </NativeSelect>
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  <Send /> Submit request
                </Button>
              </form>
            ) : (
              <Alert>
                <ShieldCheck />
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  An Owner, Admin or Content Producer can submit a request.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Request queue</CardTitle>
            <CardDescription>
              {requests.length} requests received across departments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#1f2342]/9 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{item.department}</Badge>
                      {item.priority === 'Urgent' && (
                        <Badge className="bg-[#fff0e8] text-[#a23e22]">
                          Urgent
                        </Badge>
                      )}
                      <Badge className="bg-[#eceef7] text-[#313653]">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="mt-3 font-medium text-[#1f2342]">
                      {item.request}
                    </p>
                    <p className="mt-1 text-sm text-[#777b8d]">
                      {item.requester} · Needed {item.neededBy}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// oxlint-disable-next-line no-unused-vars -- kept as an alternate focused queue component
function MyActions({
  actions,
  onOpen,
  onReview,
  onSaveMetric,
}: {
  actions: ActionItem[];
  onOpen: (id: string) => void;
  onReview: (item: ContentItem, approved: boolean, note: string) => void;
  onSaveMetric: (
    item: ContentItem,
    values: { views: number; likes: number; comments: number; shares: number },
  ) => void;
}) {
  const direct = actions.filter(
    (action) => action.kind === 'approval' || action.kind === 'work',
  );
  const reviews = actions.filter((action) => action.kind === 'second-lens');
  const metrics = actions.filter((action) => action.kind === 'metrics');
  return (
    <>
      <PageTitle
        eyebrow="MY ACTIONS"
        title="Everything you need to act on."
        description="One personal queue, shaped automatically by your login, roles and assignments."
      />
      {!actions.length && (
        <Card className="border-dashed bg-white">
          <CardContent className="grid place-items-center py-14 text-center">
            <CheckCircle2 className="mb-3 size-8 text-[#3b9171]" />
            <p className="font-medium text-[#1f2342]">You are all caught up.</p>
            <p className="mt-1 text-sm text-[#7b7f90]">
              New assignments and approvals will appear here.
            </p>
          </CardContent>
        </Card>
      )}
      {direct.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1f2342]">Next up</h2>
            <Badge variant="secondary">{direct.length}</Badge>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {direct.map(({ item, label, kind }) => (
              <button
                key={`${kind}-${item.id}`}
                onClick={() => onOpen(item.id)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#1f2342]/10 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        kind === 'approval'
                          ? 'bg-[#1f2342] text-white'
                          : 'bg-[#f7efdd] text-[#7a5200]'
                      }
                    >
                      {label}
                    </Badge>
                    {isOverdue(item) && (
                      <Badge variant="destructive">Overdue</Badge>
                    )}
                  </div>
                  <p className="font-semibold text-[#1f2342]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#6f7285]">
                    {item.stage} · {dueLabel(item)}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-[#a1a4b1]" />
              </button>
            ))}
          </div>
        </section>
      )}
      {reviews.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1f2342]">
              Second-lens review
            </h2>
            <Badge variant="secondary">{reviews.length}</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {reviews.map(({ item }) => (
              <ReviewCard
                key={item.id}
                item={item}
                onOpen={onOpen}
                onReview={onReview}
              />
            ))}
          </div>
        </section>
      )}
      {metrics.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1f2342]">
              Metrics to record
            </h2>
            <Badge variant="secondary">{metrics.length}</Badge>
          </div>
          <div className="grid gap-4">
            {metrics.map(({ item }) => (
              <MetricsCard
                key={item.id}
                item={item}
                onSave={onSaveMetric}
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ReviewCard({
  item,
  onOpen,
  onReview,
}: {
  item: ContentItem;
  onOpen: (id: string) => void;
  onReview: (item: ContentItem, approved: boolean, note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
        <CardDescription>
          {item.contentType} · {item.workflowStep}
        </CardDescription>
        <CardAction>
          <Badge className="bg-[#f7efdd] text-[#7a5200]">Human review</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add review notes (optional for approval)"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onReview(item, true, note)}>
            <Check /> Approve review
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              onReview(
                item,
                false,
                note || 'Please revise based on the review feedback.',
              )
            }
          >
            <RefreshCw /> Request changes
          </Button>
          <Button variant="ghost" onClick={() => onOpen(item.id)}>
            Open item
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// oxlint-disable-next-line no-unused-vars -- retained for a future standalone monitoring route
function Monitoring({
  items,
  onOpen,
  onSave,
}: {
  items: ContentItem[];
  onOpen: (id: string) => void;
  onSave: (
    item: ContentItem,
    values: { views: number; likes: number; comments: number; shares: number },
  ) => void;
}) {
  const missing = items.filter(
    (item) => item.stage === 'Post-Upload Metrics' && item.metrics.length === 0,
  );
  const recorded = items.filter((item) => item.metrics.length > 0);
  return (
    <>
      <PageTitle
        eyebrow="POST-UPLOAD METRICS"
        title="Close the feedback loop."
        description="Add dated performance snapshots now; the model is ready for automated platform pulls later."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_.75fr]">
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-[#1f2342]">
            Missing a metrics entry{' '}
            <Badge className="ml-2 bg-[#fff0e8] text-[#b34726]">
              {missing.length}
            </Badge>
          </h2>
          {missing.map((item) => (
            <MetricsCard
              key={item.id}
              item={item}
              onSave={onSave}
              onOpen={onOpen}
            />
          ))}
        </div>
        <Card className="h-fit bg-white">
          <CardHeader>
            <CardTitle>Latest snapshots</CardTitle>
            <CardDescription>Manually recorded performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recorded.flatMap((item) =>
              item.metrics.slice(0, 1).map((metric) => (
                <button
                  onClick={() => onOpen(item.id)}
                  key={metric.id}
                  className="w-full rounded-xl bg-[#f4f1ea] p-4 text-left"
                >
                  <p className="text-sm font-medium text-[#1f2342]">
                    {item.title}
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <MiniStat label="Views" value={metric.views} />
                    <MiniStat label="Likes" value={metric.likes} />
                    <MiniStat label="Comments" value={metric.comments} />
                    <MiniStat label="Shares" value={metric.shares} />
                  </div>
                </button>
              )),
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
function MetricsCard({
  item,
  onSave,
  onOpen,
}: {
  item: ContentItem;
  onSave: (
    item: ContentItem,
    values: { views: number; likes: number; comments: number; shares: number },
  ) => void;
  onOpen: (id: string) => void;
}) {
  const [values, setValues] = useState({
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
  });
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
        <CardDescription>
          {item.platform} · Posted{' '}
          {item.publishedAt
            ? dueLabel({ ...item, dueAt: item.publishedAt })
            : 'recently'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.keys(values).map((key) => (
            <div key={key}>
              <Label className="mb-1.5 capitalize">{key}</Label>
              <Input
                type="number"
                min="0"
                value={values[key as keyof typeof values]}
                onChange={(event) =>
                  setValues({ ...values, [key]: Number(event.target.value) })
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => onSave(item, values)}>Save snapshot</Button>
          <Button variant="ghost" onClick={() => onOpen(item.id)}>
            Open item
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-lg font-semibold text-[#1f2342]">
        {new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(value)}
      </p>
      <p className="text-[10px] text-[#7b7f90]">{label}</p>
    </div>
  );
}

// oxlint-disable-next-line no-unused-vars -- retained for a future stakeholder-only route
function Stakeholder({ items }: { items: ContentItem[] }) {
  const active = items.filter((item) => item.lifecycle === 'Active');
  const overrides = items.flatMap((item) =>
    item.history
      .filter((event) => event.flagged)
      .map((event) => ({ item, event })),
  );
  return (
    <>
      <PageTitle
        eyebrow="READ-ONLY OVERVIEW"
        title="The signal, without the noise."
        description="A clean view of delivery health, current accountability and exceptional overrides."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active items"
          value={String(active.length)}
          detail="All stages"
          icon={CircleGauge}
        />
        <MetricCard
          label="Posted today"
          value={String(
            items.filter((item) => item.publishedAt?.startsWith('2026-09-07'))
              .length,
          )}
          detail="Asia/Kolkata"
          icon={UploadCloud}
        />
        <MetricCard
          label="Overdue"
          value={String(active.filter(isOverdue).length)}
          detail="Needs intervention"
          icon={AlertTriangle}
          warning
        />
        <MetricCard
          label="Recent overrides"
          value={String(overrides.length)}
          detail="Second-lens exceptions"
          icon={ShieldCheck}
          accent
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Who is accountable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {active.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-[#1f2342]/8 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#1f2342]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-[#7b7f90]">{item.stage}</p>
                </div>
                <Owners people={item.accountable} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Recent overrides</CardTitle>
            <CardDescription>
              Advanced without second-lens sign-off
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overrides.map(({ item, event }) => (
              <Alert key={item.id} className="border-[#dfa126]/40 bg-[#f7efdd]">
                <AlertTriangle />
                <AlertTitle>{item.title}</AlertTitle>
                <AlertDescription>
                  {event.note} · {event.actor}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
function People({
  people,
  demoMode,
  onManage,
}: {
  people: Person[];
  demoMode: boolean;
  onManage: (person: Person, active: boolean, roles: AppRole[]) => void;
}) {
  const owners = people.filter((person) => person.roles.includes('Owner'));
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE & ACCESS"
        title="Give each person only what they need."
        description="The two Owner accounts stay protected. Owners can activate anyone else and assign one or more working roles."
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Alert className="border-[#dfa126]/40 bg-[#f7efdd]">
          <ShieldCheck />
          <AlertTitle>{owners.length}/2 protected Owner accounts</AlertTitle>
          <AlertDescription>
            Owners have unrestricted access and are the only people who can
            grant or change app access. Admins run all content operations but
            cannot appoint Owners.
          </AlertDescription>
        </Alert>
        {demoMode && (
          <Alert className="border-[#1f2342]/15 bg-white">
            <UserRound />
            <AlertTitle>Demonstration team</AlertTitle>
            <AlertDescription>
              Changes work in this preview only. After Supabase is connected,
              signed-in users appear here and Owner changes persist.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => (
          <AccessCard key={person.id} person={person} onManage={onManage} />
        ))}
      </div>
    </>
  );
}

function AccessCard({
  person,
  onManage,
}: {
  person: Person;
  onManage: (person: Person, active: boolean, roles: AppRole[]) => void;
}) {
  const isOwner = person.roles.includes('Owner');
  const [active, setActive] = useState(person.isActive !== false);
  const [roles, setRoles] = useState<AppRole[]>(
    person.roles.filter((role) => role !== 'Owner'),
  );
  const assignable: Exclude<AppRole, 'Owner'>[] = [
    'Admin',
    'Content Producer',
    'Content Approver',
    'Monitoring',
    'Read-only Stakeholder',
  ];
  return (
    <Card className={`bg-white ${isOwner ? 'ring-1 ring-[#dfa126]/50' : ''}`}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Avatar person={person} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{person.name}</CardTitle>
            <CardDescription className="truncate">
              {person.email}
            </CardDescription>
          </div>
          {isOwner && <Badge className="bg-[#1f2342] text-white">Owner</Badge>}
        </div>
        {person.responsibility && (
          <p className="mt-3 text-sm leading-relaxed text-[#62667a]">
            {person.responsibility}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isOwner ? (
          <p className="rounded-xl bg-[#f7efdd] p-3 text-sm text-[#6b5b35]">
            Protected full-access ID. Owner access is configured securely during
            backend setup and cannot be changed here.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between rounded-xl border border-[#1f2342]/10 p-3 text-sm font-medium">
              <span>App access</span>
              <Checkbox
                aria-label="Toggle app access"
                checked={active}
                onCheckedChange={(checked) => setActive(Boolean(checked))}
              />
            </div>
            <div className="space-y-2">
              {assignable.map((role) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-[#525570]"
                >
                  <Checkbox
                    checked={roles.includes(role)}
                    onCheckedChange={(checked) =>
                      setRoles(
                        checked
                          ? [...roles, role]
                          : roles.filter((entry) => entry !== role),
                      )
                    }
                  />
                  {role}
                </label>
              ))}
            </div>
            <Button
              className="mt-4 w-full"
              disabled={active && roles.length === 0}
              onClick={() => onManage(person, active, roles)}
            >
              Save access
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
function Settings({ demoMode }: { demoMode: boolean }) {
  const [hours, setHours] = useState(24);
  const [savedHours, setSavedHours] = useState(24);
  const integrations = [
    { name: 'Zoho Social', use: 'Scheduling and publishing' },
    { name: 'ManyChat / SuperProfile', use: 'Comment and DM automation' },
    { name: 'CRM', use: 'Lead routing and conversion' },
    { name: 'Looker Studio', use: 'Analytics dashboards' },
    { name: 'ChatCut', use: 'Long-video clipping assistance' },
  ];
  return (
    <>
      <PageTitle
        eyebrow="SETTINGS & CONNECTIONS"
        title="Simple defaults. Connect tools when ready."
        description="The operating workflow works natively now; external services can be connected later without changing the team’s process."
      />
      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-5">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Due-date reminders</CardTitle>
              <CardDescription>Default lead time for new items</CardDescription>
            </CardHeader>
            <CardContent>
              <Label className="mb-2">Hours before due date</Label>
              <div className="flex max-w-xs gap-2">
                <Input
                  type="number"
                  min="0"
                  max="720"
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                />
                <Button onClick={() => setSavedHours(hours)}>Save</Button>
              </div>
              <p className="mt-3 text-xs text-[#7b7f90]">
                {savedHours} hours is saved for new items. Each content item can
                override it.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#777b8d]">Time zone</span>
                <strong>Asia/Kolkata</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#777b8d]">Owner IDs</span>
                <strong>2 protected slots</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#777b8d]">Authentication</span>
                <strong>Email + password</strong>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Integration centre</CardTitle>
            <CardDescription>
              Prepared connection points; credentials are not stored in the
              browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center justify-between gap-4 rounded-xl border border-[#1f2342]/9 p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold">{integration.name}</p>
                  <p className="mt-1 text-xs text-[#777b8d]">
                    {integration.use}
                  </p>
                </div>
                <Badge className="shrink-0 bg-[#f7efdd] text-[#74500a]">
                  Ready to connect
                </Badge>
              </div>
            ))}
            <div className="mt-3 rounded-xl bg-[#f6f4ee] p-4">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#dfa126]" />
                <p className="text-sm font-semibold">Resend email delivery</p>
              </div>
              <p className="mt-2 text-sm text-[#676b7c]">
                Approval and due-date messages queue safely. Add the API key and
                verified sender when available.
              </p>
              {demoMode && (
                <Badge className="mt-3 bg-[#eceef7] text-[#1f2342]">
                  Demonstration data active
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ItemDetail({
  open,
  item,
  roles,
  person,
  busy,
  onOpenChange,
  onStepChange,
  onSubmit,
  onApprove,
  onRequestChanges,
  onComment,
  onMetric,
}: {
  open: boolean;
  item?: ContentItem;
  roles: AppRole[];
  person: Person;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onStepChange: (item: ContentItem, step: string) => void;
  onSubmit: (item: ContentItem) => void;
  onApprove: (item: ContentItem) => void;
  onRequestChanges: (item: ContentItem, note: string) => void;
  onComment: (item: ContentItem, body: string, parentId?: string) => void;
  onMetric: (
    item: ContentItem,
    values: { views: number; likes: number; comments: number; shares: number },
  ) => void;
}) {
  const [comment, setComment] = useState('');
  const [changeNote, setChangeNote] = useState('');
  if (!item) return null;
  const readOnly = roles.length === 1 && roles[0] === 'Read-only Stakeholder';
  const canSubmit = canSubmitItem(item, roles, person);
  const canApprove = canApproveItem(item, roles, person);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-5">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="secondary">{item.stage}</Badge>
            <PillarBadge pillar={item.pillar} />
            <StatusBadge item={item} />
            {isOverdue(item) && <Badge variant="destructive">Overdue</Badge>}
          </div>
          <SheetTitle className="mt-3 font-display text-2xl font-semibold">
            {item.title}
          </SheetTitle>
          <SheetDescription>
            {item.contentType} · {item.platform} · Due {dueLabel(item)}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5">
          <Tabs
            defaultValue={
              ['Script', 'Production'].includes(item.stage)
                ? 'comments'
                : 'work'
            }
          >
            <TabsList className="mt-2">
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="comments">
                Comments ({item.comments.length})
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>

            <TabsContent value="work" className="space-y-5 py-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">
                  Pipeline progress
                </p>
                <Progress value={stagePercent(item.stage)} />
                <div className="mt-2 flex justify-between text-xs text-[#7b7f90]">
                  <span>{item.stage}</span>
                  <span>{Math.round(stagePercent(item.stage))}%</span>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">
                  Checkpoint inside {item.stage}
                </p>
                <div className="grid gap-2">
                  {STAGE_STEPS[item.stage].map((step, index) => {
                    const currentIndex = STAGE_STEPS[item.stage].indexOf(
                      item.workflowStep,
                    );
                    const complete = index < currentIndex;
                    const active = step === item.workflowStep;
                    return (
                      <button
                        key={step}
                        disabled={readOnly || !canSubmit}
                        onClick={() => onStepChange(item, step)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-[#dfa126] bg-[#fff8e8]' : complete ? 'border-[#1f2342]/8 bg-[#f2f3f6]' : 'border-[#1f2342]/8 bg-white'} disabled:cursor-default`}
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? 'bg-[#dfa126] text-[#1f2342]' : complete ? 'bg-[#3b9171] text-white' : 'bg-[#eceef2] text-[#777b8d]'}`}
                        >
                          {complete ? (
                            <Check className="size-3.5" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="text-sm font-medium">{step}</span>
                        {active && (
                          <Badge className="ml-auto bg-[#1f2342] text-white">
                            Current
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoBlock label="Responsible" people={item.responsible} />
                <InfoBlock label="Accountable" people={item.accountable} />
              </div>
              {['Script', 'Production'].includes(item.stage) && (
                <Alert className="border-[#dfa126]/40 bg-[#f7efdd]">
                  <ShieldCheck />
                  <AlertTitle>
                    Independent human review: {item.secondLens}
                  </AlertTitle>
                  <AlertDescription>
                    Financial compliance and final creative judgement remain
                    human-controlled. Owners can override only with a recorded
                    reason.
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">
                  External files
                </p>
                <div className="space-y-2">
                  {item.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-xl border p-3 text-sm hover:bg-[#f4f1ea]"
                    >
                      <span className="flex items-center gap-2">
                        <Link2 className="size-4 text-[#b27708]" />
                        {link.label}
                      </span>
                      <ExternalLink className="size-4" />
                    </a>
                  ))}
                  {!item.links.length && (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-[#7b7f90]">
                      No links added yet.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comments" className="py-5">
              <div className="space-y-4">
                {item.comments.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.parentId
                        ? 'ml-8 border-l-2 border-[#dfa126]/30 pl-4'
                        : ''
                    }
                  >
                    <div className="flex gap-3">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eceef7] text-[10px] font-bold">
                        {entry.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-3">
                          <p className="text-sm font-medium">{entry.author}</p>
                          <p className="text-xs text-[#8b8e9e]">{entry.at}</p>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-[#525570]">
                          {entry.body}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {!item.comments.length && (
                  <p className="py-6 text-center text-sm text-[#7b7f90]">
                    No comments yet.
                  </p>
                )}
              </div>
              {!readOnly && (
                <form
                  className="mt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onComment(item, comment);
                    setComment('');
                  }}
                >
                  <Textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Leave a note or use @name to mention someone"
                  />
                  <Button className="mt-2" type="submit">
                    Add comment
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="history" className="py-5">
              <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[#dfe1e8]">
                {item.history.map((event, index) => (
                  <div key={event.at + index} className="relative pl-7">
                    <span
                      className={
                        'absolute left-0 top-1 size-[15px] rounded-full border-4 border-white ' +
                        (event.flagged ? 'bg-[#b34726]' : 'bg-[#dfa126]')
                      }
                    />
                    <p className="text-sm font-medium capitalize text-[#1f2342]">
                      {event.action}
                    </p>
                    <p className="mt-1 text-xs text-[#7b7f90]">
                      {event.actor} · {event.at}
                    </p>
                    {event.note && (
                      <p
                        className={
                          'mt-2 rounded-lg p-3 text-sm ' +
                          (event.flagged
                            ? 'bg-[#fff0e8] text-[#8a341b]'
                            : 'bg-[#f4f1ea] text-[#525570]')
                        }
                      >
                        {event.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="py-5">
              <div className="space-y-3">
                {item.metrics.map((metric) => (
                  <div key={metric.id} className="rounded-xl bg-[#f4f1ea] p-4">
                    <p className="mb-3 text-sm font-medium">
                      {metric.platform} · {metric.recordedOn}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <MiniStat label="Views" value={metric.views} />
                      <MiniStat label="Likes" value={metric.likes} />
                      <MiniStat label="Comments" value={metric.comments} />
                      <MiniStat label="Shares" value={metric.shares} />
                    </div>
                  </div>
                ))}
                {!item.metrics.length && (
                  <p className="py-6 text-center text-sm text-[#7b7f90]">
                    No metrics recorded yet.
                  </p>
                )}
              </div>
              {hasAnyRole(roles, ['Owner', 'Admin', 'Monitoring']) &&
                item.stage === 'Post-Upload Metrics' && (
                  <MetricsCard
                    item={item}
                    onSave={onMetric}
                    onOpen={() => undefined}
                  />
                )}
            </TabsContent>
          </Tabs>
        </div>

        {!readOnly && (
          <SheetFooter className="sticky bottom-0 border-t bg-white px-5 py-4">
            <div className="w-full space-y-2">
              {item.status === 'Pending approval' && canApprove ? (
                <>
                  <Textarea
                    value={changeNote}
                    onChange={(event) => setChangeNote(event.target.value)}
                    placeholder="Required only when requesting changes"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy} onClick={() => onApprove(item)}>
                      <Check /> Approve & move forward
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() => onRequestChanges(item, changeNote)}
                    >
                      <X /> Request changes
                    </Button>
                  </div>
                </>
              ) : item.lifecycle === 'Active' &&
                item.status !== 'Pending approval' &&
                canSubmit ? (
                <Button disabled={busy} onClick={() => onSubmit(item)}>
                  <FileCheck2 /> Submit {item.stage} for approval
                </Button>
              ) : null}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
function InfoBlock({ label, people }: { label: string; people: Person[] }) {
  return (
    <div className="rounded-xl bg-[#f4f1ea] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">
        {label}
      </p>
      <div className="mt-3 space-y-2">
        {people.map((person) => (
          <div key={person.id} className="flex items-center gap-2">
            <Avatar person={person} />
            <span className="text-sm font-medium">{person.name}</span>
          </div>
        ))}
        {!people.length && <p className="text-sm text-[#7b7f90]">Unassigned</p>}
      </div>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  people,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  onCreate: (draft: {
    title: string;
    contentType: string;
    platform: string;
    pillar: ContentPillar;
    dueAt: string;
    responsibleId: string;
    accountableIds: string[];
    copyOwners: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState('Instagram Reel');
  const [platform, setPlatform] = useState('Instagram');
  const [pillar, setPillar] = useState<ContentPillar>('Knowledge');
  const [dueAt, setDueAt] = useState('');
  const [responsibleId, setResponsibleId] = useState(
    people[1]?.id ?? people[0]?.id ?? '',
  );
  const [accountableIds, setAccountableIds] = useState<string[]>([]);
  const [copyOwners, setCopyOwners] = useState(true);
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !responsibleId || !accountableIds.length) return;
    onCreate({
      title: title.trim(),
      contentType,
      platform,
      pillar,
      dueAt,
      responsibleId,
      accountableIds,
      copyOwners,
    });
    setTitle('');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Create content item
          </DialogTitle>
          <DialogDescription>
            Start at Topic research inside Idea, then assign the people who will
            move it forward.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="mb-1.5">Title</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Five habits of confident wealth advisors"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5">Content type</Label>
              <NativeSelect
                className="w-full"
                value={contentType}
                onChange={(event) => setContentType(event.target.value)}
              >
                {[
                  'Instagram Reel',
                  'Instagram Post',
                  'YouTube Video',
                  'YouTube Short',
                  'LinkedIn Post',
                  'Carousel',
                ].map((value) => (
                  <NativeSelectOption key={value}>{value}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="mb-1.5">Platform</Label>
              <NativeSelect
                className="w-full"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                {[
                  'Instagram',
                  'YouTube',
                  'LinkedIn',
                  'Facebook',
                  'Multi-platform',
                ].map((value) => (
                  <NativeSelectOption key={value}>{value}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="mb-1.5">Content mix</Label>
              <NativeSelect
                className="w-full"
                value={pillar}
                onChange={(event) =>
                  setPillar(event.target.value as ContentPillar)
                }
              >
                <NativeSelectOption>Knowledge</NativeSelectOption>
                <NativeSelectOption>Promotional</NativeSelectOption>
                <NativeSelectOption>AAFM India Insider</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Idea due date</Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5">Responsible producer</Label>
              <NativeSelect
                className="w-full"
                value={responsibleId}
                onChange={(event) => setResponsibleId(event.target.value)}
              >
                {people.map((person) => (
                  <NativeSelectOption key={person.id} value={person.id}>
                    {person.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label>Accountable owners</Label>
            <p className="mb-2 mt-1 text-xs text-[#7b7f90]">
              Choose one or more people. Any accountable owner can approve the
              transition.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {people.map((person) => (
                <label
                  key={person.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm"
                >
                  <Checkbox
                    checked={accountableIds.includes(person.id)}
                    onCheckedChange={(checked) =>
                      setAccountableIds(
                        checked
                          ? [...accountableIds, person.id]
                          : accountableIds.filter((id) => id !== person.id),
                      )
                    }
                  />
                  {person.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-[#f7efdd] p-3 text-sm">
            <Checkbox
              aria-label="Copy accountable owners to all stages"
              checked={copyOwners}
              onCheckedChange={(checked) => setCopyOwners(Boolean(checked))}
            />
            <span>
              <strong className="block text-[#1f2342]">
                Plan accountability ahead
              </strong>
              <span className="text-[#6b5b35]">
                Copy these owners across all six stages. Admin can revise each
                stage later.
              </span>
            </span>
          </div>
          <DialogFooter className="mx-0 mb-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !accountableIds.length}
            >
              Create item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({
  item,
  onOpenChange,
  onConfirm,
}: {
  item?: ContentItem;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: ContentItem, reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Advance without the required human review?</DialogTitle>
          <DialogDescription>
            This exception is recorded permanently and Owners, admins and
            reviewers are notified. Financial compliance and final brand
            approval should only be overridden in a documented emergency.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why must this item advance now?"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!item || reason.trim().length < 6}
            onClick={() => item && onConfirm(item, reason.trim())}
          >
            Record override & advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  intent,
  onOpenChange,
  onConfirm,
}: {
  intent?: MoveIntent;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const approving = intent?.item.status === 'Pending approval';
  return (
    <Dialog open={Boolean(intent)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {approving
              ? `Approve the move to ${intent?.toStage}?`
              : `Submit ${intent?.item.stage} for approval?`}
          </DialogTitle>
          <DialogDescription>
            {approving
              ? 'This records your approval and moves the card forward. Script and Production still require second-lens approval or a documented override.'
              : `The card will stay in ${intent?.item.stage} until an accountable owner approves it. Nothing moves silently.`}
          </DialogDescription>
        </DialogHeader>
        {intent && (
          <div className="rounded-xl bg-[#f4f1ea] p-4">
            <p className="font-medium text-[#1f2342]">{intent.item.title}</p>
            <p className="mt-1 text-sm text-[#6f7285]">
              {intent.item.stage} <ArrowRight className="mx-1 inline size-4" />{' '}
              {intent.toStage}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            {approving ? 'Approve & move' : 'Submit for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoginScreen({
  client,
  notice,
  setNotice,
}: {
  client: SupabaseClient;
  notice: string;
  setNotice: (value: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) setNotice(error.message);
    setBusy(false);
  };
  return (
    <div className="grid min-h-svh place-items-center bg-[#f4f1ea] p-4">
      <div className="w-full max-w-md">
        <Image
          src="/aafm-india-logo.png"
          alt="AAFM India — American Academy of Financial Management"
          width={1684}
          height={594}
          className="mx-auto mb-7 h-auto w-full max-w-[360px]"
        />
        <Card className="bg-white p-2 shadow-xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Sign in to Content Operations
            </CardTitle>
            <CardDescription>
              Use the email and password assigned by an Owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label className="mb-1.5">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label className="mb-1.5">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {notice && <p className="text-sm text-[#b34726]">{notice}</p>}
              <Button className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-[#7b7f90]">
          Invite-only access · Asia/Kolkata
        </p>
      </div>
    </div>
  );
}
function LoadingScreen() {
  return (
    <div className="grid min-h-svh place-items-center bg-[#f4f1ea]">
      <div className="text-center">
        <div className="mx-auto mb-4 size-9 animate-spin rounded-full border-2 border-[#dfa126] border-t-transparent" />
        <p className="text-sm text-[#525570]">Opening content operations…</p>
      </div>
    </div>
  );
}
function PendingAccess({
  email,
  signOut,
}: {
  email: string;
  signOut: () => void;
}) {
  return (
    <div className="grid min-h-svh place-items-center bg-[#f4f1ea] p-4">
      <Card className="max-w-md bg-white">
        <CardHeader>
          <CardTitle>Access is waiting for an Owner</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#525570]">
            Your account is valid. One of the two workspace Owners needs to
            activate it and assign at least one role.
          </p>
          <Button variant="outline" className="mt-4" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
