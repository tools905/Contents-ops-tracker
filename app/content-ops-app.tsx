'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
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
  Eye,
  FileCheck2,
  FileText,
  GripVertical,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageSquareText,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
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
  demoCadenceRuns,
  demoCadences,
  demoItems,
  demoPeople,
  demoRequests,
} from '@/lib/demo-data';
import {
  PIPELINE,
  PLATFORM_CONTENT_TYPES,
  STAGE_STEPS,
  type AppRole,
  type CadenceFrequency,
  type CadenceRun,
  type Comment,
  type ContentItem,
  type ContentPillar,
  type DepartmentRequest,
  type MetricEntry,
  type OperatingCadence,
  type Person,
  type RaciAssignment,
  type Stage,
} from '@/lib/content-types';
import { makeSupabaseClient, type SupabaseConfig } from '@/lib/supabase-client';
import { loadLiveSnapshot } from '@/lib/supabase-data';

type View =
  | 'today'
  | 'pipeline'
  | 'raci'
  | 'calendar'
  | 'cadence'
  | 'requests'
  | 'people'
  | 'settings';
type MoveIntent = { item: ContentItem; toStage: Stage };
type MetricDraft = Omit<MetricEntry, 'id' | 'source'>;
type RaciIntent = { item: ContentItem; stage: Stage };
type InviteDraft = {
  email: string;
  fullName: string;
  roles: Exclude<AppRole, 'Owner'>[];
};
type CadenceDraft = {
  id?: string;
  name: string;
  purpose: string;
  frequency: CadenceFrequency;
  weekday?: number;
  dayOfMonth?: number;
  time: string;
  ownerId: string;
  participantIds: string[];
  stage?: Stage;
  deliverable: string;
  reminderHours: number;
  active: boolean;
};
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
  'Post-Upload': 'post_upload_metrics',
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
    { view: 'raci', label: 'RACI matrix', icon: ShieldCheck },
    { view: 'calendar', label: 'Calendar', icon: CalendarDays },
    { view: 'cadence', label: 'Operating cadence', icon: RefreshCw },
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
  const [requests, setRequests] = useState<DepartmentRequest[]>(demoRequests);
  const [cadences, setCadences] = useState<OperatingCadence[]>(demoCadences);
  const [cadenceRuns, setCadenceRuns] = useState<CadenceRun[]>(demoCadenceRuns);
  const [currentUser, setCurrentUser] = useState<Person>(demoPeople[0]);
  const [currentRole, setCurrentRole] = useState<AppRole>('Owner');
  const [previewRole, setPreviewRole] = useState<
    Exclude<AppRole, 'Owner'> | null
  >(null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [view, setView] = useState<View>('today');
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [raciIntent, setRaciIntent] = useState<RaciIntent>();
  const [cadenceEditor, setCadenceEditor] = useState<
    OperatingCadence | 'new'
  >();
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [overrideItem, setOverrideItem] = useState<ContentItem>();
  const [moveIntent, setMoveIntent] = useState<MoveIntent>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const reloadLive = useCallback(
    async (supabase: SupabaseClient, user: User) => {
      const snapshot = await loadLiveSnapshot(supabase, user);
      setPeople(snapshot.people);
      setItems(snapshot.items);
      setRequests(snapshot.requests);
      setCadences(snapshot.cadences);
      setCadenceRuns(snapshot.cadenceRuns);
      setCurrentUser(snapshot.currentUser);
      setActiveProfile(snapshot.currentUserActive);
      if (snapshot.currentUser.roles.length)
        setCurrentRole(snapshot.currentUser.roles[0]);
    },
    [],
  );

  useEffect(() => {
    const action = authActionFromLocation();
    if (action === 'invite' || action === 'recovery')
      setNeedsPasswordSetup(true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('aafm-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      setTheme(stored);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    applyTheme();
    window.localStorage.setItem('aafm-theme', theme);
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view]);

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
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      const action = authActionFromLocation();
      if (
        event === 'PASSWORD_RECOVERY' ||
        action === 'invite' ||
        action === 'recovery'
      )
        setNeedsPasswordSetup(true);
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

  const isOwner = currentUser.roles.includes('Owner');
  const isRolePreview = !demoMode && isOwner && Boolean(previewRole);
  const rolePerson = demoMode
    ? (people.find((person) => person.id === ROLE_PERSON[currentRole]) ??
      currentUser)
    : previewRole
      ? (people.find((person) => person.roles.includes(previewRole)) ??
        currentUser)
      : currentUser;
  const effectiveRoles = useMemo(
    () =>
      demoMode
        ? [currentRole]
        : previewRole
          ? [previewRole]
          : currentUser.roles,
    [demoMode, currentRole, currentUser.roles, previewRole],
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
  const canInvitePeople = hasAnyRole(effectiveRoles, ['Owner', 'Admin']);
  const canCreate = hasAnyRole(effectiveRoles, [
    'Owner',
    'Admin',
    'Content Producer',
  ]);
  const canManageOperations = hasAnyRole(effectiveRoles, ['Owner', 'Admin']);
  const visibleCadences = useMemo(
    () =>
      canManageOperations || effectiveRoles.includes('Read-only Stakeholder')
        ? cadences
        : cadences.filter(
            (cadence) =>
              cadence.owner.id === rolePerson.id ||
              cadence.participants.some(
                (participant) => participant.id === rolePerson.id,
              ),
          ),
    [cadences, canManageOperations, effectiveRoles, rolePerson.id],
  );
  const visibleNav = nav
    .filter((entry) => entry.view !== 'people' || canInvitePeople)
    .filter(
      (entry) =>
        entry.view !== 'settings' ||
        hasAnyRole(effectiveRoles, ['Owner', 'Admin']),
    );
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const mutateLive = async (
    work: (supabase: SupabaseClient) => Promise<unknown>,
    success: string,
  ) => {
    if (isRolePreview) {
      showNotice('Role preview is read-only. Exit preview to make changes.');
      return false;
    }
    if (!client || !authUser) return false;
    setBusy(true);
    try {
      await work(client);
      await reloadLive(client, authUser);
      showNotice(success);
      return true;
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : 'Something went wrong',
      );
      return false;
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
              ...raciFor(row, last ? row.stage : PIPELINE[index + 1]),
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

  const inviteUser = async (draft: InviteDraft) => {
    if (demoMode) {
      const person: Person = {
        id: crypto.randomUUID(),
        name: draft.fullName,
        email: draft.email,
        initials: draft.fullName
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase())
          .join(''),
        roles: draft.roles,
        isActive: true,
      };
      setPeople((all) => [...all, person]);
      setInviteOpen(false);
      return showNotice(`Demo invitation prepared for ${draft.email}.`);
    }
    const saved = await mutateLive(async (supabase) => {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: draft.email,
          fullName: draft.fullName,
          roles: draft.roles.map((role) => roleToDb[role]),
        },
      });
      if (error) throw error;
    }, `Invitation sent to ${draft.email}.`);
    if (saved) setInviteOpen(false);
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
          const { error } = await supabase.from('stage_reviews').insert({
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
                      stage: row.stage,
                      kind: approved
                        ? ('Decision' as const)
                        : ('Feedback' as const),
                      resolved: approved,
                      resolvedAt: approved ? 'Just now' : undefined,
                      resolvedBy: approved ? rolePerson.name : undefined,
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
    kind: Comment['kind'],
    stage: Stage,
    parentId?: string,
  ) => {
    if (!body.trim()) return;
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.from('comments').insert({
          content_item_id: item.id,
          parent_id: parentId ? Number(parentId) : null,
          author_id: authUser!.id,
          body: body.trim(),
          stage: stageToDb[stage],
          kind: kind.toLowerCase(),
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
                  stage,
                  kind,
                  resolved: false,
                },
              ],
            }
          : row,
      ),
    );
    showNotice('Comment added.');
  };

  const setCommentResolution = async (
    item: ContentItem,
    commentId: string,
    resolved: boolean,
  ) => {
    if (!demoMode)
      return mutateLive(
        async (supabase) => {
          const { error } = await supabase.rpc('set_comment_resolution', {
            p_comment_id: Number(commentId),
            p_resolved: resolved,
          });
          if (error) throw error;
        },
        resolved ? 'Feedback resolved.' : 'Feedback reopened.',
      );
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              comments: row.comments.map((entry) =>
                entry.id === commentId
                  ? {
                      ...entry,
                      resolved,
                      resolvedAt: resolved ? 'Just now' : undefined,
                      resolvedBy: resolved ? rolePerson.name : undefined,
                    }
                  : entry,
              ),
            }
          : row,
      ),
    );
    showNotice(resolved ? 'Feedback resolved.' : 'Feedback reopened.');
  };

  const createItem = async (draft: {
    title: string;
    contentType: string;
    platform: string;
    pillar: ContentPillar;
    dueAt: string;
    responsibleId: string;
    accountableIds: string[];
    consultedIds: string[];
    informedIds: string[];
    copyOwners: boolean;
  }) => {
    const creator = rolePerson;
    if (!demoMode) {
      const saved = await mutateLive(async (supabase) => {
        const { error } = await supabase.rpc('create_content_with_raci', {
          p_title: draft.title,
          p_content_type: draft.contentType,
          p_platform: draft.platform,
          p_pillar: pillarToDb[draft.pillar],
          p_due_at: draft.dueAt
            ? new Date(`${draft.dueAt}:00+05:30`).toISOString()
            : null,
          p_responsible_id: draft.responsibleId,
          p_accountable_ids: draft.accountableIds,
          p_consulted_ids: draft.consultedIds,
          p_informed_ids: draft.informedIds,
          p_copy_all_stages: draft.copyOwners,
        });
        if (error) throw error;
      }, 'Content item created.');
      if (saved) setCreateOpen(false);
      return;
    }
    const responsible = people.filter(
      (person) => person.id === draft.responsibleId,
    );
    const accountable = people.filter((person) =>
      draft.accountableIds.includes(person.id),
    );
    const consulted = people.filter((person) =>
      draft.consultedIds.includes(person.id),
    );
    const informed = people.filter((person) =>
      draft.informedIds.includes(person.id),
    );
    const assignment: RaciAssignment = {
      responsible,
      accountable,
      consulted,
      informed,
    };
    const emptyAssignment: RaciAssignment = {
      responsible: [],
      accountable: [],
      consulted: [],
      informed: [],
    };
    const raci = Object.fromEntries(
      PIPELINE.map((stage) => [
        stage,
        draft.copyOwners || stage === 'Idea' ? assignment : emptyAssignment,
      ]),
    ) as Record<Stage, RaciAssignment>;
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
        dueAt: draft.dueAt
          ? new Date(`${draft.dueAt}:00+05:30`).toISOString()
          : undefined,
        reminderHours: 24,
        lifecycle: 'Active',
        responsible,
        accountable,
        consulted,
        informed,
        raci,
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

  const addRequest = async (
    request: Omit<DepartmentRequest, 'id' | 'status'>,
  ) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.from('department_requests').insert({
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

  const saveRaci = async (
    item: ContentItem,
    stage: Stage,
    assignment: RaciAssignment,
  ) => {
    if (!demoMode) {
      const saved = await mutateLive(async (supabase) => {
        const { error } = await supabase.rpc('replace_stage_raci', {
          p_item_id: item.id,
          p_stage: stageToDb[stage],
          p_responsible_ids: assignment.responsible.map((person) => person.id),
          p_accountable_ids: assignment.accountable.map((person) => person.id),
          p_consulted_ids: assignment.consulted.map((person) => person.id),
          p_informed_ids: assignment.informed.map((person) => person.id),
        });
        if (error) throw error;
      }, `${stage} RACI updated.`);
      if (saved) setRaciIntent(undefined);
      return;
    }
    setItems((all) =>
      all.map((row) =>
        row.id === item.id
          ? {
              ...row,
              raci: { ...row.raci, [stage]: assignment },
              ...(row.stage === stage
                ? {
                    responsible: assignment.responsible,
                    accountable: assignment.accountable,
                    consulted: assignment.consulted,
                    informed: assignment.informed,
                  }
                : {}),
              history: [
                ...row.history,
                {
                  action: `${stage} RACI updated`,
                  actor: rolePerson.name,
                  at: 'Just now',
                },
              ],
            }
          : row,
      ),
    );
    setRaciIntent(undefined);
    showNotice(`${stage} RACI updated.`);
  };

  const saveCadence = async (draft: CadenceDraft) => {
    const owner = people.find((person) => person.id === draft.ownerId);
    if (!owner) return showNotice('Choose a cadence owner.');
    const participants = people.filter((person) =>
      draft.participantIds.includes(person.id),
    );
    if (!demoMode) {
      const saved = await mutateLive(
        async (supabase) => {
          const { error } = await supabase.rpc('save_operating_cadence', {
            p_cadence_id: draft.id ?? null,
            p_name: draft.name,
            p_purpose: draft.purpose,
            p_frequency: draft.frequency.toLowerCase(),
            p_weekday: draft.frequency === 'Weekly' ? draft.weekday : null,
            p_day_of_month:
              draft.frequency === 'Monthly' ? draft.dayOfMonth : null,
            p_time: draft.time,
            p_owner_id: draft.ownerId,
            p_stage: draft.stage ? stageToDb[draft.stage] : null,
            p_deliverable: draft.deliverable,
            p_reminder_hours: draft.reminderHours,
            p_is_active: draft.active,
            p_participant_ids: draft.participantIds,
          });
          if (error) throw error;
        },
        draft.id ? 'Cadence updated.' : 'Recurring cadence created.',
      );
      if (saved) setCadenceEditor(undefined);
      return;
    }

    const next: OperatingCadence = {
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name,
      purpose: draft.purpose,
      frequency: draft.frequency,
      weekday: draft.frequency === 'Weekly' ? draft.weekday : undefined,
      dayOfMonth: draft.frequency === 'Monthly' ? draft.dayOfMonth : undefined,
      time: draft.time,
      timezone: 'Asia/Kolkata',
      owner,
      participants,
      stage: draft.stage,
      deliverable: draft.deliverable,
      reminderHours: draft.reminderHours,
      active: draft.active,
    };
    setCadences((all) =>
      draft.id
        ? all.map((cadence) => (cadence.id === draft.id ? next : cadence))
        : [...all, next],
    );
    setCadenceEditor(undefined);
    showNotice(draft.id ? 'Cadence updated.' : 'Recurring cadence created.');
  };

  const toggleCadence = async (cadence: OperatingCadence) => {
    if (!demoMode)
      return mutateLive(
        async (supabase) => {
          const { error } = await supabase
            .from('operating_cadences')
            .update({ is_active: !cadence.active })
            .eq('id', cadence.id);
          if (error) throw error;
        },
        cadence.active ? 'Cadence paused.' : 'Cadence activated.',
      );
    setCadences((all) =>
      all.map((entry) =>
        entry.id === cadence.id ? { ...entry, active: !entry.active } : entry,
      ),
    );
    showNotice(cadence.active ? 'Cadence paused.' : 'Cadence activated.');
  };

  const completeCadenceRun = async (
    cadence: OperatingCadence,
    scheduledFor: string,
  ) => {
    if (!demoMode)
      return mutateLive(async (supabase) => {
        const { error } = await supabase.from('cadence_runs').upsert(
          {
            cadence_id: cadence.id,
            scheduled_for: scheduledFor,
            status: 'complete',
            completed_by: authUser!.id,
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'cadence_id,scheduled_for' },
        );
        if (error) throw error;
      }, 'Cadence occurrence completed.');
    setCadenceRuns((all) => [
      ...all.filter(
        (run) =>
          !(run.cadenceId === cadence.id && run.scheduledFor === scheduledFor),
      ),
      {
        cadenceId: cadence.id,
        scheduledFor,
        status: 'Complete',
        completedAt: new Date().toISOString(),
        completedBy: rolePerson,
      },
    ]);
    showNotice('Cadence occurrence completed.');
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
          'List the current login’s approvals, reviews, feedback and assigned work.',
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
  if (!demoMode && authUser && needsPasswordSetup)
    return (
      <SetPasswordScreen
        client={client!}
        email={authUser.email ?? ''}
        onComplete={() => {
          setNeedsPasswordSetup(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('auth_action');
          url.hash = '';
          window.history.replaceState({}, '', `${url.pathname}${url.search}`);
        }}
        signOut={() => void client?.auth.signOut()}
      />
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
                      className="h-10 text-[14px] text-white/70 hover:bg-card/10 hover:text-white data-active:bg-card/12 data-active:text-white"
                    >
                      <Icon />
                      <span>{label}</span>
                      {target === 'today' && myActions.length > 0 && (
                        <Badge className="ml-auto bg-[#dfa126] text-card-foreground">
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
          <div className="rounded-xl border border-white/10 bg-card/6 p-3">
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
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/92 px-4 py-2 backdrop-blur-md sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="md:hidden" />
            <Image
              src="/aafm-india-logo.png"
              alt="AAFM India"
              width={1684}
              height={594}
              className="hidden h-8 w-auto sm:block"
            />
            <div className="hidden border-l border-border pl-3 lg:block">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--warning-foreground)]">
                Content operations
              </p>
              <p className="text-sm text-muted-foreground">Asia/Kolkata</p>
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
                className="max-w-[190px] bg-card"
              >
                <NativeSelectOption>Owner</NativeSelectOption>
                <NativeSelectOption>Admin</NativeSelectOption>
                <NativeSelectOption>Content Producer</NativeSelectOption>
                <NativeSelectOption>Content Approver</NativeSelectOption>
                <NativeSelectOption>Monitoring</NativeSelectOption>
                <NativeSelectOption>Read-only Stakeholder</NativeSelectOption>
              </NativeSelect>
            )}
            {!demoMode && isOwner && (
              <div className="relative hidden sm:block">
                <Eye className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                <NativeSelect
                  aria-label="Preview the tracker as another role"
                  value={previewRole ?? 'Owner'}
                  onChange={(event) => {
                    const role = event.target.value as AppRole;
                    setPreviewRole(
                      role === 'Owner'
                        ? null
                        : (role as Exclude<AppRole, 'Owner'>),
                    );
                    setView('today');
                  }}
                  className="max-w-[210px] bg-card pl-8"
                >
                  <NativeSelectOption value="Owner">Owner view</NativeSelectOption>
                  <NativeSelectOption value="Admin">Preview Admin</NativeSelectOption>
                  <NativeSelectOption value="Content Producer">
                    Preview Content Producer
                  </NativeSelectOption>
                  <NativeSelectOption value="Content Approver">
                    Preview Content Approver
                  </NativeSelectOption>
                  <NativeSelectOption value="Monitoring">
                    Preview Monitoring
                  </NativeSelectOption>
                  <NativeSelectOption value="Read-only Stakeholder">
                    Preview Read-only
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            )}
            <div className="relative hidden sm:block">
              {theme === 'dark' ? (
                <Moon className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              ) : theme === 'light' ? (
                <Sun className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              ) : (
                <Monitor className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <NativeSelect
                aria-label="Theme"
                value={theme}
                onChange={(event) =>
                  setTheme(event.target.value as 'light' | 'dark' | 'system')
                }
                className="w-[116px] bg-card pl-8"
              >
                <NativeSelectOption value="system">System</NativeSelectOption>
                <NativeSelectOption value="light">Light</NativeSelectOption>
                <NativeSelectOption value="dark">Dark</NativeSelectOption>
              </NativeSelect>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="sm:hidden"
              aria-label={`Theme: ${theme}. Change theme`}
              onClick={() =>
                setTheme(
                  theme === 'system'
                    ? 'light'
                    : theme === 'light'
                      ? 'dark'
                      : 'system',
                )
              }
            >
              {theme === 'dark' ? (
                <Moon />
              ) : theme === 'light' ? (
                <Sun />
              ) : (
                <Monitor />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Notifications"
              onClick={() =>
                showNotice(
                  myActions.length
                    ? `${myActions.length} action${myActions.length === 1 ? '' : 's'} need your attention.`
                    : 'You are all caught up.',
                )
              }
            >
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
        {isRolePreview && (
          <Alert className="mx-4 mt-4 border-[#dfa126]/45 bg-[var(--warning-subtle)] text-[var(--warning-foreground)] sm:mx-7 lg:mx-10">
            <Eye />
            <AlertTitle>Previewing the {previewRole} experience</AlertTitle>
            <AlertDescription>
              This is a read-only preview. Aditi remains signed in as the
              protected Owner.
            </AlertDescription>
          </Alert>
        )}
        <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          {view === 'today' && (
            <Today
              items={visibleItems}
              actions={myActions}
              roles={effectiveRoles}
              cadences={visibleCadences}
              cadenceRuns={cadenceRuns}
              onOpen={(id) => setSelectedId(id)}
              onReview={secondLensReview}
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
          {view === 'raci' && (
            <RaciMatrix
              items={visibleItems}
              canManage={canManageOperations}
              onEdit={(item, stage) => setRaciIntent({ item, stage })}
              onOpen={(id) => setSelectedId(id)}
            />
          )}
          {view === 'calendar' && (
            <ContentCalendar
              items={visibleItems}
              cadences={visibleCadences}
              cadenceRuns={cadenceRuns}
              onOpen={(id) => setSelectedId(id)}
            />
          )}
          {view === 'cadence' && (
            <OperatingCadenceView
              cadences={visibleCadences}
              cadenceRuns={cadenceRuns}
              canManage={canManageOperations}
              currentPerson={rolePerson}
              onCreate={() => setCadenceEditor('new')}
              onEdit={(cadence) => setCadenceEditor(cadence)}
              onToggle={toggleCadence}
              onComplete={completeCadenceRun}
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
              canManageAccess={canManageAccess}
              onInvite={() => setInviteOpen(true)}
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
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={inviteUser}
        canAssignAccess={canManageAccess}
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
        onResolveComment={setCommentResolution}
      />
      <RaciDialog
        intent={raciIntent}
        people={people}
        onOpenChange={(open) => !open && setRaciIntent(undefined)}
        onSave={saveRaci}
      />
      <CadenceDialog
        cadence={cadenceEditor}
        people={people}
        onOpenChange={(open) => !open && setCadenceEditor(undefined)}
        onSave={saveCadence}
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

function dashboardScope(roles: AppRole[]) {
  if (hasAnyRole(roles, ['Owner', 'Admin']))
    return 'You can see the full content portfolio, every approval, and every accountable handoff. Only the Owner can change email access and roles.';
  if (roles.includes('Monitoring'))
    return 'You see publishing completion, live links, and post-upload learning notes relevant to your role.';
  if (roles.includes('Content Approver'))
    return 'You see content awaiting your review and its complete handoff history.';
  if (roles.includes('Content Producer'))
    return 'You see the content assigned to you, its deadlines, approvals, and post-upload closeout.';
  return 'You have a read-only view of approved portfolio progress.';
}
function isAssigned(
  item: ContentItem,
  person: Person,
  kind:
    | 'responsible'
    | 'accountable'
    | 'consulted'
    | 'informed'
    | 'either' = 'either',
) {
  const assigned =
    kind === 'responsible'
      ? item.responsible
      : kind === 'accountable'
        ? item.accountable
        : kind === 'consulted'
          ? item.consulted
          : kind === 'informed'
            ? item.informed
            : [
                ...item.responsible,
                ...item.accountable,
                ...item.consulted,
                ...item.informed,
              ];
  return assigned.some((owner) => owner.id === person.id);
}
function canSubmitItem(item: ContentItem, roles: AppRole[], person: Person) {
  return (
    hasAnyRole(roles, ['Owner', 'Admin']) ||
    isAssigned(item, person, 'responsible')
  );
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
        (item.stage === 'Post-Upload' || Boolean(item.publishedAt))),
  );
}

type ActionItem = {
  item: ContentItem;
  kind:
    | 'approval'
    | 'second-lens'
    | 'work'
    | 'consultation'
    | 'feedback';
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
    const openFeedback = item.comments.filter(
      (comment) =>
        comment.kind === 'Feedback' &&
        !comment.resolved &&
        comment.stage === item.stage,
    ).length;
    if (
      openFeedback > 0 &&
      (elevated ||
        isAssigned(item, person, 'responsible') ||
        isAssigned(item, person, 'accountable'))
    )
      actions.push({
        item,
        kind: 'feedback',
        label: `${openFeedback} open feedback ${openFeedback === 1 ? 'item' : 'items'} to close`,
        priority: 1,
      });
    if (isAssigned(item, person, 'consulted'))
      actions.push({
        item,
        kind: 'consultation',
        label: 'Provide your input before approval',
        priority: 2,
      });
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
function raciFor(item: ContentItem, stage: Stage): RaciAssignment {
  return (
    item.raci?.[stage] ??
    (stage === item.stage
      ? {
          responsible: item.responsible,
          accountable: item.accountable,
          consulted: item.consulted,
          informed: item.informed,
        }
      : { responsible: [], accountable: [], consulted: [], informed: [] })
  );
}
function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function getCadenceOccurrences(cadences: OperatingCadence[], days: number) {
  const now = Date.now();
  const occurrences: Array<{
    cadence: OperatingCadence;
    scheduledFor: string;
  }> = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const date = new Date(now + offset * 24 * 3600_000);
    const key = localDateKey(date);
    const noon = new Date(`${key}T12:00:00+05:30`);
    const dayOfWeek = noon.getUTCDay();
    const dayOfMonth = Number(key.slice(-2));
    for (const cadence of cadences.filter((entry) => entry.active)) {
      const matches =
        (cadence.frequency === 'Weekly' && cadence.weekday === dayOfWeek) ||
        (cadence.frequency === 'Monthly' && cadence.dayOfMonth === dayOfMonth);
      if (!matches) continue;
      const scheduledFor = new Date(
        `${key}T${cadence.time}:00+05:30`,
      ).toISOString();
      if (new Date(scheduledFor).getTime() >= now - 60 * 60_000)
        occurrences.push({ cadence, scheduledFor });
    }
  }
  return occurrences.sort((a, b) =>
    a.scheduledFor.localeCompare(b.scheduledFor),
  );
}
function formatCadenceDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
function cadenceScheduleLabel(cadence: OperatingCadence) {
  const weekdays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return cadence.frequency === 'Weekly'
    ? `Every ${weekdays[cadence.weekday ?? 1]} at ${cadence.time}`
    : `Day ${cadence.dayOfMonth ?? 1} monthly at ${cadence.time}`;
}
function LogoMonogram() {
  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-card shadow-sm">
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
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dfa126] text-[11px] font-bold text-card-foreground">
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
          className="grid size-7 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-card-foreground"
        >
          {person.initials}
        </div>
      ))}
      {people.length > 3 && (
        <div className="grid size-7 place-items-center rounded-full border-2 border-card bg-[#30375f] text-[10px] text-white">
          +{people.length - 3}
        </div>
      )}
    </div>
  );
}
function StatusBadge({ item }: { item: ContentItem }) {
  const cls =
    item.status === 'Pending approval'
      ? 'bg-[var(--warning-subtle)] text-[var(--warning-foreground)]'
      : item.status === 'Changes requested'
        ? 'bg-[var(--danger-subtle)] text-[var(--danger-foreground)]'
        : 'bg-muted text-card-foreground';
  return <Badge className={cls}>{item.status}</Badge>;
}
function PillarBadge({ pillar }: { pillar: ContentPillar }) {
  const cls =
    pillar === 'Knowledge'
      ? 'bg-[var(--info-subtle)] text-[var(--info-foreground)]'
      : pillar === 'Promotional'
        ? 'bg-[var(--danger-subtle)] text-[var(--danger-foreground)]'
        : 'bg-[var(--insider-subtle)] text-[var(--insider-foreground)]';
  return <Badge className={cls}>{pillar}</Badge>;
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-sm font-semibold text-[#b27708]">{eyebrow}</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-card-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
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
      className={`border-0 shadow-[0_10px_30px_rgba(31,35,66,0.045)] ring-1 ring-border ${accent ? 'bg-[#1f2342] text-white' : 'bg-card'}`}
    >
      <CardHeader>
        <CardDescription
          className={accent ? 'text-white/55' : 'text-muted-foreground'}
        >
          {label}
        </CardDescription>
        <CardAction>
          <div
            className={`grid size-9 place-items-center rounded-lg ${warning ? 'bg-[var(--danger-subtle)] text-[var(--danger-foreground)]' : accent ? 'bg-card/10 text-[#f0c254]' : 'bg-[var(--warning-subtle)] text-[var(--warning-foreground)]'}`}
          >
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p
          className={`font-display text-3xl font-semibold ${accent ? 'text-white' : 'text-card-foreground'}`}
        >
          {value}
        </p>
        <p
          className={`mt-2 text-xs ${accent ? 'text-white/60' : warning ? 'text-[var(--danger-foreground)]' : 'text-muted-foreground'}`}
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
  roles,
  cadences,
  cadenceRuns,
  onOpen,
  onReview,
  setView,
}: {
  items: ContentItem[];
  actions: ActionItem[];
  roles: AppRole[];
  cadences: OperatingCadence[];
  cadenceRuns: CadenceRun[];
  onOpen: (id: string) => void;
  onReview: (item: ContentItem, approved: boolean, note: string) => void;
  setView: (view: View) => void;
}) {
  const active = items.filter((item) => item.lifecycle === 'Active');
  const approvals = actions.filter(
    (action) => action.kind === 'approval' || action.kind === 'second-lens',
  );
  const assigned = actions.filter(
    (action) =>
      action.kind === 'work' ||
      action.kind === 'consultation' ||
      action.kind === 'feedback',
  );
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
          label="Visible content"
          value={String(items.length)}
          detail="Filtered for your role and assignments"
          icon={CircleGauge}
        />
      </section>
      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <div className="space-y-5">
          <Card className="bg-card">
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
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Your work and input</CardTitle>
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
                <EmptyState text="No work or consultations are waiting on you." />
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Next operating checkpoint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {getCadenceOccurrences(cadences, 30)
                .filter(
                  ({ cadence, scheduledFor }) =>
                    !cadenceRuns.some(
                      (run) =>
                        run.cadenceId === cadence.id &&
                        run.scheduledFor === scheduledFor &&
                        run.status === 'Complete',
                    ),
                )
                .slice(0, 1)
                .map(({ cadence, scheduledFor }) => (
                  <div key={cadence.id}>
                    <p className="text-sm font-semibold">{cadence.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCadenceDate(scheduledFor)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {cadence.deliverable}
                    </p>
                  </div>
                ))}
              <Button variant="outline" onClick={() => setView('cadence')}>
                Open cadence <ChevronRight />
              </Button>
            </CardContent>
          </Card>
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
                  className="text-white hover:bg-card/10 hover:text-white"
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
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-card/10">
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
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Your dashboard scope</CardTitle>
              <CardDescription>
                Based on your current access: {roles.join(' · ')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border bg-muted/60 p-3">
                {dashboardScope(roles)}
              </div>
              <Button variant="outline" onClick={() => setView('pipeline')}>
                Open content pipeline <ChevronRight />
              </Button>
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
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-border p-3.5 text-left transition hover:border-[#dfa126]/60 hover:bg-muted"
    >
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap gap-2">
          <Badge className="bg-[var(--warning-subtle)] text-[var(--warning-foreground)]">
            {label}
          </Badge>
          {isOverdue(item) && <Badge variant="destructive">Overdue</Badge>}
        </div>
        <p className="truncate text-sm font-semibold text-card-foreground">
          {item.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.stage} · {item.workflowStep} · {dueLabel(item)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-8 text-center">
      <CheckCircle2 className="mb-2 size-6 text-[#3b9171]" />
      <p className="text-sm text-muted-foreground">{text}</p>
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
              <p className="font-medium text-card-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.contentType}
              </p>
            </TableCell>
            <TableCell>
              <div className="space-y-2">
                <StatusBadge item={item} />
                <p className="text-xs text-muted-foreground">{item.stage}</p>
              </div>
            </TableCell>
            <TableCell>
              <Owners people={item.accountable} />
            </TableCell>
            <TableCell
              className={
                isOverdue(item)
                  ? 'font-medium text-[var(--danger-foreground)]'
                  : 'text-muted-foreground'
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
    'border-t-[#77809b] bg-[var(--pipeline-neutral)]',
    'border-t-[#dfa126] bg-[var(--pipeline-script)]',
    'border-t-[#4e91ad] bg-[var(--pipeline-shoot)]',
    'border-t-[#8b70ab] bg-[var(--pipeline-production)]',
    'border-t-[#3b9171] bg-[var(--pipeline-upload)]',
    'border-t-[#77809b] bg-[var(--pipeline-neutral)]',
  ];
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle
          eyebrow="CONTENT PIPELINE"
          title="Six headings. Every departmental checkpoint."
          description="Research, compliance, creative approvals, publishing and reporting stay visible inside the six stages your team already knows."
        />
        <div className="mb-7 flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
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
                className={`w-[286px] rounded-2xl border border-t-4 border-border p-3 ${stageStyles[index]}`}
              >
                <div className="mb-3 flex items-center justify-between px-1 py-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--warning-foreground)]">
                      0{index + 1}
                    </p>
                    <h2 className="mt-0.5 text-base font-semibold text-card-foreground">
                      {stage}
                    </h2>
                    <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-muted-foreground">
                      {STAGE_STEPS[stage].join(' · ')}
                    </p>
                  </div>
                  <Badge className="bg-card text-card-foreground shadow-sm">
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
                    const openFeedback = item.comments.filter(
                      (comment) =>
                        comment.stage === item.stage &&
                        comment.kind === 'Feedback' &&
                        !comment.resolved,
                    ).length;
                    return (
                      <article
                        key={item.id}
                        className={`group rounded-xl border border-border bg-card p-3.5 shadow-[0_5px_18px_rgba(31,35,66,0.07)] transition hover:-translate-y-0.5 hover:shadow-md ${movable && next ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
                            className="mt-0.5 shrink-0 cursor-grab text-muted-foreground group-hover:text-muted-foreground disabled:cursor-default"
                          >
                            <GripVertical className="size-4" />
                          </button>
                          <button
                            onClick={() => onOpen(item.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="text-sm font-semibold leading-snug text-card-foreground">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.contentType} · {item.platform}
                            </p>
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <PillarBadge pillar={item.pillar} />
                          <StatusBadge item={item} />
                          {openFeedback > 0 && (
                            <Badge variant="destructive">
                              {openFeedback} open feedback
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 rounded-lg bg-muted px-2.5 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--warning-foreground)]">
                            Current checkpoint
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-[var(--checkpoint-foreground)]">
                            {item.workflowStep}
                          </p>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <Owners people={item.accountable} />
                          <span
                            className={`flex items-center gap-1 text-xs ${isOverdue(item) ? 'font-semibold text-[var(--danger-foreground)]' : 'text-muted-foreground'}`}
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
                            className="mt-3 w-full justify-between text-muted-foreground"
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
                    <div className="rounded-xl border border-dashed border-border bg-card/45 px-3 py-10 text-center text-sm text-muted-foreground">
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

function RaciMatrix({
  items,
  canManage,
  onEdit,
  onOpen,
}: {
  items: ContentItem[];
  canManage: boolean;
  onEdit: (item: ContentItem, stage: Stage) => void;
  onOpen: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const item = items.find((entry) => entry.id === selectedId) ?? items[0];
  const allAssignments = items.flatMap((entry) =>
    PIPELINE.flatMap((stage) => {
      const assignment = raciFor(entry, stage);
      return [
        assignment.responsible.length,
        assignment.accountable.length,
        assignment.consulted.length,
        assignment.informed.length,
      ];
    }),
  );
  const completeSlots = allAssignments.filter(Boolean).length;
  const totalSlots = Math.max(1, allAssignments.length);
  const coverage = Math.round((completeSlots / totalSlots) * 100);
  const incompleteStages = items.reduce(
    (sum, entry) =>
      sum +
      PIPELINE.filter((stage) => {
        const assignment = raciFor(entry, stage);
        return (
          !assignment.responsible.length ||
          !assignment.accountable.length ||
          !assignment.consulted.length ||
          !assignment.informed.length
        );
      }).length,
    0,
  );
  return (
    <>
      <PageTitle
        eyebrow="RACI OWNERSHIP"
        title="One accountable map for every handoff."
        description="Compare who does the work, owns the decision, gives input and stays informed across all six stages."
      />
      <section className="mb-5 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="RACI coverage"
          value={`${coverage}%`}
          detail={`${completeSlots} of ${totalSlots} role slots assigned`}
          icon={ShieldCheck}
          accent
        />
        <MetricCard
          label="Stage maps"
          value={String(items.length * PIPELINE.length)}
          detail="Six explicit maps per content item"
          icon={FileCheck2}
        />
        <MetricCard
          label="Gaps to resolve"
          value={String(incompleteStages)}
          detail="Stages missing at least one RACI role"
          icon={AlertTriangle}
        />
      </section>
      <Card className="bg-card">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Stage-by-stage comparison</CardTitle>
            <CardDescription>
              Responsible and Accountable are required; Consulted and Informed
              make collaboration explicit.
            </CardDescription>
          </div>
          {items.length > 0 && (
            <NativeSelect
              aria-label="Choose content item for RACI comparison"
              className="w-full bg-card lg:w-[360px]"
              value={item?.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {items.map((entry) => (
                <NativeSelectOption key={entry.id} value={entry.id}>
                  {entry.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 sm:px-4">
          {item ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>R · Responsible</TableHead>
                  <TableHead>A · Accountable</TableHead>
                  <TableHead>C · Consulted</TableHead>
                  <TableHead>I · Informed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PIPELINE.map((stage) => {
                  const assignment = raciFor(item, stage);
                  const complete = Object.values(assignment).every(
                    (people) => people.length > 0,
                  );
                  return (
                    <TableRow key={stage}>
                      <TableCell className="min-w-44">
                        <button
                          className="text-left"
                          onClick={() => onOpen(item.id)}
                        >
                          <p className="font-semibold">{stage}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {stage === item.stage
                              ? 'Current stage'
                              : STAGE_STEPS[stage][0]}
                          </p>
                        </button>
                      </TableCell>
                      <TableCell>
                        <RaciPeople people={assignment.responsible} />
                      </TableCell>
                      <TableCell>
                        <RaciPeople people={assignment.accountable} />
                      </TableCell>
                      <TableCell>
                        <RaciPeople people={assignment.consulted} />
                      </TableCell>
                      <TableCell>
                        <RaciPeople people={assignment.informed} />
                      </TableCell>
                      <TableCell className="min-w-28 text-right">
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(item, stage)}
                          >
                            Edit
                          </Button>
                        ) : (
                          <Badge
                            variant={complete ? 'secondary' : 'destructive'}
                          >
                            {complete ? 'Complete' : 'Gap'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text="Create a content item to build its RACI map." />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RaciPeople({ people }: { people: Person[] }) {
  return people.length ? (
    <div className="flex min-w-40 flex-wrap gap-1.5">
      {people.map((person) => (
        <Badge
          key={person.id}
          variant="outline"
          className="bg-card font-normal"
        >
          {person.name}
        </Badge>
      ))}
    </div>
  ) : (
    <Badge variant="destructive">Unassigned</Badge>
  );
}

function ContentCalendar({
  items,
  cadences,
  cadenceRuns,
  onOpen,
}: {
  items: ContentItem[];
  cadences: OperatingCadence[];
  cadenceRuns: CadenceRun[];
  onOpen: (id: string) => void;
}) {
  const scheduled = [...items]
    .filter((item) => item.lifecycle === 'Active' && item.dueAt)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const dayKeys = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return localDateKey(date);
  });
  const upcomingCadence = getCadenceOccurrences(cadences, 14).slice(0, 8);
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
              className={`rounded-xl border p-3 ${index === 0 ? 'border-[#dfa126] bg-[var(--warning-subtle)]' : 'border-border bg-card'}`}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {new Intl.DateTimeFormat('en-IN', {
                  weekday: 'short',
                  timeZone: 'Asia/Kolkata',
                }).format(date)}
              </p>
              <div className="mt-1 flex items-end justify-between">
                <p className="font-display text-2xl font-semibold text-card-foreground">
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    timeZone: 'Asia/Kolkata',
                  }).format(date)}
                </p>
                <Badge
                  className={
                    count
                      ? 'bg-[#1f2342] text-white'
                      : 'bg-muted text-muted-foreground'
                  }
                >
                  {count}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
      <Card className="bg-card">
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
                    className={`min-w-32 ${isOverdue(item) ? 'font-semibold text-[var(--danger-foreground)]' : ''}`}
                  >
                    {dueLabel(item)}
                  </TableCell>
                  <TableCell className="min-w-64">
                    <p className="font-medium text-card-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.platform} · {item.contentType}
                    </p>
                  </TableCell>
                  <TableCell>
                    <PillarBadge pillar={item.pillar} />
                  </TableCell>
                  <TableCell className="min-w-44">
                    <p className="text-sm font-medium">{item.workflowStep}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.stage}
                    </p>
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
      <Card className="mt-5 bg-card">
        <CardHeader>
          <CardTitle>Operating cadence</CardTitle>
          <CardDescription>
            Recurring planning, approvals and reporting alongside content
            deadlines
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {upcomingCadence.map(({ cadence, scheduledFor }) => {
            const run = cadenceRuns.find(
              (entry) =>
                entry.cadenceId === cadence.id &&
                entry.scheduledFor === scheduledFor,
            );
            return (
              <div
                key={`${cadence.id}-${scheduledFor}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-border p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold">{cadence.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCadenceDate(scheduledFor)} · {cadence.owner.name}
                  </p>
                </div>
                <Badge
                  variant={run?.status === 'Complete' ? 'secondary' : 'outline'}
                >
                  {run?.status ?? 'Upcoming'}
                </Badge>
              </div>
            );
          })}
          {!upcomingCadence.length && (
            <EmptyState text="No recurring cadence is active for the next two weeks." />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function OperatingCadenceView({
  cadences,
  cadenceRuns,
  canManage,
  currentPerson,
  onCreate,
  onEdit,
  onToggle,
  onComplete,
}: {
  cadences: OperatingCadence[];
  cadenceRuns: CadenceRun[];
  canManage: boolean;
  currentPerson: Person;
  onCreate: () => void;
  onEdit: (cadence: OperatingCadence) => void;
  onToggle: (cadence: OperatingCadence) => void;
  onComplete: (cadence: OperatingCadence, scheduledFor: string) => void;
}) {
  const occurrences = getCadenceOccurrences(cadences, 45);
  const upcoming = occurrences.slice(0, 10);
  const completed = cadenceRuns.filter(
    (run) => run.status === 'Complete',
  ).length;
  const thisWeek = occurrences.filter(
    ({ scheduledFor }) =>
      new Date(scheduledFor).getTime() <= Date.now() + 7 * 24 * 3600_000,
  ).length;
  const stageCoverage = new Set(
    cadences
      .filter((cadence) => cadence.active && cadence.stage)
      .map((cadence) => cadence.stage),
  ).size;
  return (
    <>
      <PageTitle
        eyebrow="OPERATING CADENCE"
        title="The team rhythm is visible and repeatable."
        description="Plan content, clear approvals, publish on time and close the reporting loop through recurring weekly and monthly checkpoints."
        action={
          canManage ? (
            <Button onClick={onCreate}>
              <Plus /> Add recurring cadence
            </Button>
          ) : undefined
        }
      />
      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active cadences"
          value={String(cadences.filter((cadence) => cadence.active).length)}
          detail={`${cadences.filter((cadence) => cadence.frequency === 'Weekly' && cadence.active).length} weekly · ${cadences.filter((cadence) => cadence.frequency === 'Monthly' && cadence.active).length} monthly`}
          icon={RefreshCw}
          accent
        />
        <MetricCard
          label="Next 7 days"
          value={String(thisWeek)}
          detail="Recurring checkpoints due"
          icon={CalendarDays}
        />
        <MetricCard
          label="Stage coverage"
          value={`${stageCoverage}/${PIPELINE.length}`}
          detail="Pipeline stages linked to a cadence"
          icon={FileCheck2}
        />
        <MetricCard
          label="Completed"
          value={String(completed)}
          detail="Recorded cadence occurrences"
          icon={CheckCircle2}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Next checkpoints</CardTitle>
            <CardDescription>
              Generated automatically from active recurrence rules in
              Asia/Kolkata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.map(({ cadence, scheduledFor }) => {
              const run = cadenceRuns.find(
                (entry) =>
                  entry.cadenceId === cadence.id &&
                  entry.scheduledFor === scheduledFor,
              );
              const canComplete =
                canManage ||
                cadence.owner.id === currentPerson.id ||
                cadence.participants.some(
                  (participant) => participant.id === currentPerson.id,
                );
              return (
                <div
                  key={`${cadence.id}-${scheduledFor}`}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{cadence.name}</p>
                        {cadence.stage && (
                          <Badge variant="outline">{cadence.stage}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCadenceDate(scheduledFor)} · Owner{' '}
                        {cadence.owner.name}
                      </p>
                    </div>
                    {run?.status === 'Complete' ? (
                      <Badge className="bg-[var(--success-subtle)] text-[var(--success-foreground)]">
                        Complete
                      </Badge>
                    ) : canComplete ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onComplete(cadence, scheduledFor)}
                      >
                        <Check /> Mark complete
                      </Button>
                    ) : (
                      <Badge variant="secondary">Upcoming</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    <strong className="text-card-foreground">
                      Deliverable:
                    </strong>{' '}
                    {cadence.deliverable}
                  </p>
                </div>
              );
            })}
            {!upcoming.length && (
              <EmptyState text="No active cadence is scheduled." />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Operating loop</CardTitle>
            <CardDescription>
              The minimum recurring rhythm drawn from the content team brief
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              [
                'Plan',
                'Research, HOD input and weekly/monthly calendar decisions',
                'Idea',
              ],
              [
                'Approve',
                'Compliance, quality control and final brand approval',
                'Production',
              ],
              [
                'Publish',
                'Platform readiness, live links and owner handoff',
                'Upload',
              ],
              [
                'Learn',
                'Weekly pulse, monthly analytics and learning notes',
                'Post-Upload',
              ],
            ].map(([label, detail, stage], index) => {
              const linked = cadences.filter(
                (cadence) => cadence.active && cadence.stage === stage,
              );
              return (
                <div key={label} className="flex gap-4 rounded-xl bg-muted p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#1f2342] text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{label}</p>
                      <Badge
                        variant={linked.length ? 'secondary' : 'destructive'}
                      >
                        {linked.length
                          ? `${linked.length} linked`
                          : 'Needs cadence'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Card className="mt-5 bg-card">
        <CardHeader>
          <CardTitle>Recurring cadence configuration</CardTitle>
          <CardDescription>
            Admins control recurrence, owners, participants, reminders and
            deliverables.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cadence</TableHead>
                <TableHead>Recurrence</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead>Reminder</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cadences.map((cadence) => (
                <TableRow key={cadence.id}>
                  <TableCell className="min-w-64">
                    <p className="font-semibold">{cadence.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {cadence.deliverable}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-44">
                    {cadenceScheduleLabel(cadence)}
                  </TableCell>
                  <TableCell>{cadence.owner.name}</TableCell>
                  <TableCell>
                    <Owners people={cadence.participants} />
                  </TableCell>
                  <TableCell>{cadence.reminderHours}h before</TableCell>
                  <TableCell>
                    <Badge variant={cadence.active ? 'secondary' : 'outline'}>
                      {cadence.active ? 'Active' : 'Paused'}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(cadence)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onToggle(cadence)}
                        >
                          {cadence.active ? 'Pause' : 'Activate'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Reports({
  items,
  canAdd,
  onAdd,
  onOpen,
}: {
  items: ContentItem[];
  canAdd: boolean;
  onAdd: () => void;
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
  const metrics = items
    .flatMap((item) => item.metrics.map((entry) => ({ item, entry })))
    .sort((a, b) => b.entry.recordedOn.localeCompare(a.entry.recordedOn));
  const views = metrics.reduce((sum, row) => sum + row.entry.views, 0);
  const reach = metrics.reduce((sum, row) => sum + row.entry.reach, 0);
  const engagements = metrics.reduce(
    (sum, row) =>
      sum +
      row.entry.likes +
      row.entry.comments +
      row.entry.shares +
      row.entry.saves,
    0,
  );
  const engagementRate = reach ? (engagements / reach) * 100 : 0;
  const followerChange = metrics.reduce(
    (sum, row) => sum + row.entry.followerChange,
    0,
  );
  return (
    <>
      <PageTitle
        eyebrow="REPORTS"
        title="One view of content performance."
        description="Enter Instagram, YouTube, LinkedIn and Facebook results manually now. Zoho Analytics can feed the same view after it is connected."
        action={
          canAdd ? (
            <Button onClick={onAdd} className="shrink-0">
              <Plus /> Add metrics
            </Button>
          ) : undefined
        }
      />
      <Alert className="mb-5 border-[#dfa126]/35 bg-[#f7efdd] dark:bg-[#dfa126]/10">
        <RefreshCw />
        <AlertTitle>Unified reporting</AlertTitle>
        <AlertDescription>
          Manual snapshots are available. Zoho Analytics import will use this
          same report once Zoho Social is connected.
        </AlertDescription>
      </Alert>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Published"
          value={String(items.filter((item) => item.publishedAt).length)}
          detail="Tracked live links"
          icon={UploadCloud}
        />
        <MetricCard
          label="Total views"
          value={new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(
            views,
          )}
          detail="Across visible snapshots"
          icon={BarChart3}
          accent
        />
        <MetricCard
          label="Engagement rate"
          value={`${engagementRate.toFixed(1)}%`}
          detail="Likes, comments, shares and saves ÷ reach"
          icon={MessageSquareText}
        />
        <MetricCard
          label="Follower change"
          value={`${followerChange >= 0 ? '+' : ''}${new Intl.NumberFormat('en-IN').format(followerChange)}`}
          detail={`${new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(reach)} recorded reach`}
          icon={Users2}
        />
      </section>
      <section className="mt-6 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <Card className="bg-card">
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
                      <span className="ml-2 text-muted-foreground">
                        target {target}%
                      </span>
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
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
        <Card className="bg-card">
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
                  className="flex w-full items-center justify-between gap-4 rounded-xl border p-3.5 text-left hover:bg-muted"
                >
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.platform} · {entry.recordedOn} · {entry.source}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold">
                      {new Intl.NumberFormat('en-IN', {
                        notation: 'compact',
                      }).format(entry.views)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">views</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="space-y-3">
                <EmptyState text="No performance snapshots are visible for this role yet." />
                {canAdd && (
                  <Button variant="outline" onClick={onAdd}>
                    <Plus /> Add the first snapshot
                  </Button>
                )}
              </div>
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
        <Card className="h-fit bg-card">
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
        <Card className="bg-card">
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
                className="rounded-xl border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{item.department}</Badge>
                      {item.priority === 'Urgent' && (
                        <Badge className="bg-[var(--danger-subtle)] text-[var(--danger-foreground)]">
                          Urgent
                        </Badge>
                      )}
                      <Badge className="bg-muted text-card-foreground">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="mt-3 font-medium text-card-foreground">
                      {item.request}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
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
}: {
  actions: ActionItem[];
  onOpen: (id: string) => void;
  onReview: (item: ContentItem, approved: boolean, note: string) => void;
}) {
  const direct = actions.filter(
    (action) =>
      action.kind === 'approval' ||
      action.kind === 'work' ||
      action.kind === 'consultation',
  );
  const reviews = actions.filter((action) => action.kind === 'second-lens');
  return (
    <>
      <PageTitle
        eyebrow="MY ACTIONS"
        title="Everything you need to act on."
        description="One personal queue, shaped automatically by your login, roles and assignments."
      />
      {!actions.length && (
        <Card className="border-dashed bg-card">
          <CardContent className="grid place-items-center py-14 text-center">
            <CheckCircle2 className="mb-3 size-8 text-[#3b9171]" />
            <p className="font-medium text-card-foreground">
              You are all caught up.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              New assignments and approvals will appear here.
            </p>
          </CardContent>
        </Card>
      )}
      {direct.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-card-foreground">
              Next up
            </h2>
            <Badge variant="secondary">{direct.length}</Badge>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {direct.map(({ item, label, kind }) => (
              <button
                key={`${kind}-${item.id}`}
                onClick={() => onOpen(item.id)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        kind === 'approval'
                          ? 'bg-[#1f2342] text-white'
                          : 'bg-[var(--warning-subtle)] text-[var(--warning-foreground)]'
                      }
                    >
                      {label}
                    </Badge>
                    {isOverdue(item) && (
                      <Badge variant="destructive">Overdue</Badge>
                    )}
                  </div>
                  <p className="font-semibold text-card-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.stage} · {dueLabel(item)}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}
      {reviews.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-card-foreground">
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
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
        <CardDescription>
          {item.contentType} · {item.workflowStep}
        </CardDescription>
        <CardAction>
          <Badge className="bg-[var(--warning-subtle)] text-[var(--warning-foreground)]">
            Human review
          </Badge>
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
  onSave: (item: ContentItem, values: MetricDraft) => void;
}) {
  const missing = items.filter(
    (item) => item.stage === 'Post-Upload' && item.metrics.length === 0,
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
          <h2 className="text-base font-semibold text-card-foreground">
            Missing a metrics entry{' '}
            <Badge className="ml-2 bg-[var(--danger-subtle)] text-[var(--danger-foreground)]">
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
        <Card className="h-fit bg-card">
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
                  className="w-full rounded-xl bg-background p-4 text-left"
                >
                  <p className="text-sm font-medium text-card-foreground">
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
  onSave: (item: ContentItem, values: MetricDraft) => void;
  onOpen: (id: string) => void;
}) {
  const [values, setValues] = useState({
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
  });
  return (
    <Card className="bg-card">
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
          <Button
            onClick={() =>
              onSave(item, {
                platform: item.platform,
                contentUrl: item.links.find(
                  (link) => link.kind === 'Published post',
                )?.url,
                recordedOn: new Date().toISOString().slice(0, 10),
                reach: 0,
                impressions: 0,
                saves: 0,
                watchTimeMinutes: 0,
                followerChange: 0,
                ...values,
              })
            }
          >
            Save quick snapshot
          </Button>
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
      <p className="font-display text-lg font-semibold text-card-foreground">
        {new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(value)}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
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
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Who is accountable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {active.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-card-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.stage}
                  </p>
                </div>
                <Owners people={item.accountable} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Recent overrides</CardTitle>
            <CardDescription>
              Advanced without second-lens sign-off
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overrides.map(({ item, event }) => (
              <Alert
                key={item.id}
                className="border-[#dfa126]/40 bg-[var(--warning-subtle)] text-[var(--warning-foreground)]"
              >
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
  canManageAccess,
  onInvite,
  onManage,
}: {
  people: Person[];
  demoMode: boolean;
  canManageAccess: boolean;
  onInvite: () => void;
  onManage: (person: Person, active: boolean, roles: AppRole[]) => void;
}) {
  const owners = people.filter((person) => person.roles.includes('Owner'));
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE & ACCESS"
        title="Give each person only what they need."
        description="Owners and Admins can invite teammates. Aditi is the protected Owner and the only person who can activate, pause or change access."
        action={
          <Button onClick={onInvite}>
            <Plus /> Invite teammate
          </Button>
        }
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Alert className="border-[#dfa126]/40 bg-[var(--warning-subtle)] text-[var(--warning-foreground)]">
          <ShieldCheck />
          <AlertTitle>{owners.length}/1 protected Owner account</AlertTitle>
          <AlertDescription>
            Aditi has unrestricted access and is the only person who can grant
            or change app access. Admins run content operations and may send an
            invitation, but the invited account remains pending until Aditi
            assigns its responsibilities.
          </AlertDescription>
        </Alert>
        {demoMode && (
          <Alert className="border-border bg-card">
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
          <AccessCard
            key={person.id}
            person={person}
            canManage={canManageAccess}
            onManage={onManage}
          />
        ))}
      </div>
    </>
  );
}

function AccessCard({
  person,
  canManage,
  onManage,
}: {
  person: Person;
  canManage: boolean;
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
    <Card className={`bg-card ${isOwner ? 'ring-1 ring-[#dfa126]/50' : ''}`}>
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
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {person.responsibility}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isOwner ? (
          <p className="rounded-xl bg-[var(--warning-subtle)] p-3 text-sm text-[var(--warning-foreground)]">
            Protected full-access ID. Owner access is configured securely during
            backend setup and cannot be changed here.
          </p>
        ) : canManage ? (
          <>
            <div className="mb-3 flex items-center justify-between rounded-xl border border-border p-3 text-sm font-medium">
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
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground"
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
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
              <span>App access</span>
              <Badge
                variant={person.isActive === false ? 'outline' : 'secondary'}
              >
                {person.isActive === false ? 'Paused' : 'Active'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {person.roles.map((role) => (
                <Badge key={role} variant="outline">
                  {role}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Owners manage existing access. Admins can invite new teammates.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function Settings({ demoMode }: { demoMode: boolean }) {
  const [hours, setHours] = useState(24);
  const [savedHours, setSavedHours] = useState(24);
  const integrations = [
    { name: 'Zoho Social', use: 'Social publishing and community management' },
    {
      name: 'Zoho Analytics',
      use: 'Performance reporting outside this tracker',
    },
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
          <Card className="bg-card">
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
              <p className="mt-3 text-xs text-muted-foreground">
                {savedHours} hours is saved for new items. Each content item can
                override it.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Time zone</span>
                <strong>Asia/Kolkata</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Owner IDs</span>
                <strong>2 protected slots</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Authentication</span>
                <strong>Email + password</strong>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="bg-card">
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
                className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold">{integration.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {integration.use}
                  </p>
                </div>
                <Badge className="shrink-0 bg-[var(--warning-subtle)] text-[var(--warning-foreground)]">
                  Ready to connect
                </Badge>
              </div>
            ))}
            <div className="mt-3 rounded-xl bg-muted p-4">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#dfa126]" />
                <p className="text-sm font-semibold">Resend email delivery</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Approval, feedback and due-date messages use
                notifications@updates.buildablelabs.com. Add the Resend API key
                in the backend before enabling delivery.
              </p>
              {demoMode && (
                <Badge className="mt-3 bg-muted text-card-foreground">
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
  onResolveComment,
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
  onComment: (
    item: ContentItem,
    body: string,
    kind: Comment['kind'],
    stage: Stage,
    parentId?: string,
  ) => void;
  onResolveComment: (
    item: ContentItem,
    commentId: string,
    resolved: boolean,
  ) => void;
}) {
  const [comment, setComment] = useState('');
  const [commentKind, setCommentKind] = useState<Comment['kind']>('Update');
  const [commentStage, setCommentStage] = useState<Stage | 'All'>('All');
  const [replyingTo, setReplyingTo] = useState<string>();
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
                Discussion ({item.comments.length})
                {item.comments.some(
                  (entry) => entry.kind === 'Feedback' && !entry.resolved,
                ) && (
                  <span className="ml-1 size-1.5 rounded-full bg-destructive" />
                )}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="work" className="space-y-5 py-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pipeline progress
                </p>
                <Progress value={stagePercent(item.stage)} />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{item.stage}</span>
                  <span>{Math.round(stagePercent(item.stage))}%</span>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-[#dfa126] bg-[var(--warning-subtle)]' : complete ? 'border-border bg-muted' : 'border-border bg-card'} disabled:cursor-default`}
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? 'bg-[#dfa126] text-card-foreground' : complete ? 'bg-[#3b9171] text-white' : 'bg-muted text-muted-foreground'}`}
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
                <InfoBlock label="Consulted" people={item.consulted} />
                <InfoBlock label="Informed" people={item.informed} />
              </div>
              {['Script', 'Production'].includes(item.stage) && (
                <Alert className="border-[#dfa126]/40 bg-[var(--warning-subtle)] text-[var(--warning-foreground)]">
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  External files
                </p>
                <div className="space-y-2">
                  {item.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-xl border p-3 text-sm hover:bg-background"
                    >
                      <span className="flex items-center gap-2">
                        <Link2 className="size-4 text-[#b27708]" />
                        {link.label}
                      </span>
                      <ExternalLink className="size-4" />
                    </a>
                  ))}
                  {!item.links.length && (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No links added yet.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comments" className="py-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 p-3">
                <div>
                  <p className="text-sm font-semibold">Stage discussion</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Updates, feedback and decisions stay attached to the stage
                    where they were recorded.
                  </p>
                </div>
                <NativeSelect
                  aria-label="Filter discussion by stage"
                  value={commentStage}
                  onChange={(event) =>
                    setCommentStage(event.target.value as Stage | 'All')
                  }
                  className="w-48 bg-card"
                >
                  <NativeSelectOption value="All">
                    All stages
                  </NativeSelectOption>
                  {PIPELINE.map((stage) => (
                    <NativeSelectOption key={stage}>{stage}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-4">
                {item.comments
                  .filter(
                    (entry) =>
                      commentStage === 'All' || entry.stage === commentStage,
                  )
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className={
                        entry.parentId
                          ? 'ml-8 border-l-2 border-[#dfa126]/30 pl-4'
                          : ''
                      }
                    >
                      <div className="flex gap-3">
                        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-card-foreground">
                          {entry.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-3">
                            <p className="text-sm font-medium">
                              {entry.author}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.at}
                            </p>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline">{entry.stage}</Badge>
                            <Badge
                              className={
                                entry.kind === 'Feedback'
                                  ? 'bg-[var(--warning-subtle)] text-[var(--warning-foreground)]'
                                  : entry.kind === 'Decision'
                                    ? 'bg-[var(--info-subtle)] text-[var(--info-foreground)]'
                                    : 'bg-muted text-muted-foreground'
                              }
                            >
                              {entry.kind}
                            </Badge>
                            {entry.kind === 'Feedback' && (
                              <Badge
                                variant={
                                  entry.resolved ? 'secondary' : 'destructive'
                                }
                              >
                                {entry.resolved ? 'Resolved' : 'Open feedback'}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                            {entry.body}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {!readOnly && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setReplyingTo(entry.id)}
                              >
                                Reply
                              </Button>
                            )}
                            {!readOnly && entry.kind === 'Feedback' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  onResolveComment(
                                    item,
                                    entry.id,
                                    !entry.resolved,
                                  )
                                }
                              >
                                {entry.resolved ? 'Reopen' : 'Mark resolved'}
                              </Button>
                            )}
                          </div>
                          {entry.resolved && entry.resolvedBy && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Resolved by {entry.resolvedBy} ·{' '}
                              {entry.resolvedAt}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                {!item.comments.filter(
                  (entry) =>
                    commentStage === 'All' || entry.stage === commentStage,
                ).length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No discussion recorded for this stage yet.
                  </p>
                )}
              </div>
              {!readOnly && (
                <form
                  className="mt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onComment(
                      item,
                      comment,
                      commentKind,
                      replyingTo
                        ? (item.comments.find(
                            (entry) => entry.id === replyingTo,
                          )?.stage ?? item.stage)
                        : item.stage,
                      replyingTo,
                    );
                    setComment('');
                    setReplyingTo(undefined);
                  }}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <NativeSelect
                      aria-label="Discussion type"
                      value={commentKind}
                      onChange={(event) =>
                        setCommentKind(event.target.value as Comment['kind'])
                      }
                      className="w-40 bg-card"
                    >
                      <NativeSelectOption>Update</NativeSelectOption>
                      <NativeSelectOption>Feedback</NativeSelectOption>
                      <NativeSelectOption>Decision</NativeSelectOption>
                    </NativeSelect>
                    <Badge variant="outline">{item.stage}</Badge>
                    {replyingTo && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setReplyingTo(undefined)}
                      >
                        Replying · cancel
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder={
                      commentKind === 'Feedback'
                        ? 'Describe the change needed and the expected outcome'
                        : commentKind === 'Decision'
                          ? 'Record the decision and why it was made'
                          : 'Share a progress update or context for the team'
                    }
                  />
                  <Button className="mt-2" type="submit">
                    Add comment
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="history" className="py-5">
              <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-border">
                {item.history.map((event, index) => (
                  <div key={event.at + index} className="relative pl-7">
                    <span
                      className={
                        'absolute left-0 top-1 size-[15px] rounded-full border-4 border-card ' +
                        (event.flagged ? 'bg-[#b34726]' : 'bg-[#dfa126]')
                      }
                    />
                    <p className="text-sm font-medium capitalize text-card-foreground">
                      {event.action}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actor} · {event.at}
                    </p>
                    {event.note && (
                      <p
                        className={
                          'mt-2 rounded-lg p-3 text-sm ' +
                          (event.flagged
                            ? 'bg-[var(--danger-subtle)] text-[var(--danger-foreground)]'
                            : 'bg-background text-muted-foreground')
                        }
                      >
                        {event.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

          </Tabs>
        </div>

        {!readOnly && (
          <SheetFooter className="sticky bottom-0 border-t bg-card px-5 py-4">
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
    <div className="rounded-xl bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-3 space-y-2">
        {people.map((person) => (
          <div key={person.id} className="flex items-center gap-2">
            <Avatar person={person} />
            <span className="text-sm font-medium">{person.name}</span>
          </div>
        ))}
        {!people.length && (
          <p className="text-sm text-muted-foreground">Unassigned</p>
        )}
      </div>
    </div>
  );
}

function MetricsDialog({
  open,
  onOpenChange,
  items,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ContentItem[];
  onSave: (item: ContentItem, values: MetricDraft) => void;
}) {
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const selected = items.find((item) => item.id === itemId) ?? items[0];
  const [platform, setPlatform] = useState(selected?.platform ?? 'Instagram');
  const [contentUrl, setContentUrl] = useState(
    selected?.links.find((link) => link.kind === 'Published post')?.url ?? '',
  );
  const [recordedOn, setRecordedOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [values, setValues] = useState({
    views: 0,
    reach: 0,
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    watchTimeMinutes: 0,
    followerChange: 0,
  });
  const [notes, setNotes] = useState('');

  const chooseItem = (id: string) => {
    setItemId(id);
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setPlatform(item.platform);
    setContentUrl(
      item.links.find((link) => link.kind === 'Published post')?.url ?? '',
    );
  };
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    onSave(selected, {
      platform,
      contentUrl: contentUrl.trim() || undefined,
      recordedOn,
      notes: notes.trim() || undefined,
      ...values,
    });
    onOpenChange(false);
  };
  const numberFields: Array<[keyof typeof values, string]> = [
    ['views', 'Views'],
    ['reach', 'Reach'],
    ['impressions', 'Impressions'],
    ['likes', 'Likes'],
    ['comments', 'Comments'],
    ['shares', 'Shares'],
    ['saves', 'Saves'],
    ['watchTimeMinutes', 'Watch time (minutes)'],
    ['followerChange', 'Follower change'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Add performance snapshot
          </DialogTitle>
          <DialogDescription>
            Enter the numbers shown in Instagram, YouTube, LinkedIn or Facebook.
            The snapshot is labelled Manual in the unified report.
          </DialogDescription>
        </DialogHeader>
        {selected ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">Published content</Label>
                <NativeSelect
                  className="w-full bg-card"
                  value={selected.id}
                  onChange={(event) => chooseItem(event.target.value)}
                >
                  {items.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {item.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label className="mb-1.5">Platform</Label>
                <NativeSelect
                  className="w-full bg-card"
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                >
                  {['Instagram', 'YouTube', 'LinkedIn', 'Facebook'].map(
                    (value) => (
                      <NativeSelectOption key={value}>
                        {value}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div>
                <Label className="mb-1.5">Content URL</Label>
                <Input
                  type="url"
                  value={contentUrl}
                  onChange={(event) => setContentUrl(event.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div>
                <Label className="mb-1.5">Reporting date</Label>
                <Input
                  type="date"
                  value={recordedOn}
                  onChange={(event) => setRecordedOn(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {numberFields.map(([key, label]) => (
                <div key={key}>
                  <Label className="mb-1.5">{label}</Label>
                  <Input
                    type="number"
                    min={key === 'followerChange' ? undefined : 0}
                    value={values[key]}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        [key]: Number(event.target.value),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div>
              <Label className="mb-1.5">Notes</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What worked, what changed, or what to test next"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save snapshot</Button>
            </DialogFooter>
          </form>
        ) : (
          <EmptyState text="Publish at least one content item before recording metrics." />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RaciDialog({
  intent,
  people,
  onOpenChange,
  onSave,
}: {
  intent?: RaciIntent;
  people: Person[];
  onOpenChange: (open: boolean) => void;
  onSave: (item: ContentItem, stage: Stage, assignment: RaciAssignment) => void;
}) {
  return (
    <Dialog open={Boolean(intent)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{intent?.stage} RACI assignments</DialogTitle>
          <DialogDescription>{intent?.item.title}</DialogDescription>
        </DialogHeader>
        {intent && (
          <RaciEditor
            key={`${intent.item.id}-${intent.stage}`}
            assignment={raciFor(intent.item, intent.stage)}
            people={people.filter((person) => person.isActive !== false)}
            onCancel={() => onOpenChange(false)}
            onSave={(assignment) =>
              onSave(intent.item, intent.stage, assignment)
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RaciEditor({
  assignment,
  people,
  onCancel,
  onSave,
}: {
  assignment: RaciAssignment;
  people: Person[];
  onCancel: () => void;
  onSave: (assignment: RaciAssignment) => void;
}) {
  const [values, setValues] = useState(assignment);
  const roles: Array<[keyof RaciAssignment, string, string]> = [
    [
      'responsible',
      'R · Responsible',
      'Does the work and submits the handoff.',
    ],
    [
      'accountable',
      'A · Accountable',
      'Owns the decision and approves the handoff.',
    ],
    [
      'consulted',
      'C · Consulted',
      'Gives subject-matter input before the decision.',
    ],
    [
      'informed',
      'I · Informed',
      'Receives updates without approval authority.',
    ],
  ];
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (values.responsible.length && values.accountable.length)
          onSave(values);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map(([role, label, description]) => (
          <div key={role} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">{label}</p>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              {description}
            </p>
            <div className="space-y-2">
              {people.map((person) => (
                <label
                  key={person.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={values[role].some(
                      (entry) => entry.id === person.id,
                    )}
                    onCheckedChange={(checked) =>
                      setValues((current) => ({
                        ...current,
                        [role]: checked
                          ? [
                              ...current[role].filter(
                                (entry) => entry.id !== person.id,
                              ),
                              person,
                            ]
                          : current[role].filter(
                              (entry) => entry.id !== person.id,
                            ),
                      }))
                    }
                  />
                  {person.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Every stage needs at least one Responsible and Accountable person.
        Leaving Consulted or Informed blank is shown as a gap in the comparison.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!values.responsible.length || !values.accountable.length}
        >
          Save RACI
        </Button>
      </DialogFooter>
    </form>
  );
}

function CadenceDialog({
  cadence,
  people,
  onOpenChange,
  onSave,
}: {
  cadence?: OperatingCadence | 'new';
  people: Person[];
  onOpenChange: (open: boolean) => void;
  onSave: (draft: CadenceDraft) => void;
}) {
  return (
    <Dialog open={Boolean(cadence)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {cadence === 'new'
              ? 'Add recurring cadence'
              : 'Edit recurring cadence'}
          </DialogTitle>
          <DialogDescription>
            Set the team rhythm, expected output and people involved. All times
            use Asia/Kolkata.
          </DialogDescription>
        </DialogHeader>
        {cadence && (
          <CadenceEditor
            key={cadence === 'new' ? 'new' : cadence.id}
            cadence={cadence === 'new' ? undefined : cadence}
            people={people.filter((person) => person.isActive !== false)}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CadenceEditor({
  cadence,
  people,
  onCancel,
  onSave,
}: {
  cadence?: OperatingCadence;
  people: Person[];
  onCancel: () => void;
  onSave: (draft: CadenceDraft) => void;
}) {
  const [draft, setDraft] = useState<CadenceDraft>({
    id: cadence?.id,
    name: cadence?.name ?? '',
    purpose: cadence?.purpose ?? '',
    frequency: cadence?.frequency ?? 'Weekly',
    weekday: cadence?.weekday ?? 1,
    dayOfMonth: cadence?.dayOfMonth ?? 1,
    time: cadence?.time ?? '10:30',
    ownerId: cadence?.owner.id ?? people[0]?.id ?? '',
    participantIds: cadence?.participants.map((person) => person.id) ?? [],
    stage: cadence?.stage,
    deliverable: cadence?.deliverable ?? '',
    reminderHours: cadence?.reminderHours ?? 24,
    active: cadence?.active ?? true,
  });
  const weekdays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...draft,
          name: draft.name.trim(),
          purpose: draft.purpose.trim(),
          deliverable: draft.deliverable.trim(),
        });
      }}
    >
      <div>
        <Label className="mb-1.5">Cadence name</Label>
        <Input
          required
          minLength={3}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="e.g. Weekly content planning"
        />
      </div>
      <div>
        <Label className="mb-1.5">Purpose</Label>
        <Textarea
          required
          minLength={3}
          value={draft.purpose}
          onChange={(event) =>
            setDraft({ ...draft, purpose: event.target.value })
          }
          placeholder="What decision or review should happen?"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="mb-1.5">Repeat</Label>
          <NativeSelect
            className="w-full"
            value={draft.frequency}
            onChange={(event) =>
              setDraft({
                ...draft,
                frequency: event.target.value as CadenceFrequency,
              })
            }
          >
            <NativeSelectOption>Weekly</NativeSelectOption>
            <NativeSelectOption>Monthly</NativeSelectOption>
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1.5">
            {draft.frequency === 'Weekly' ? 'Day of week' : 'Day of month'}
          </Label>
          {draft.frequency === 'Weekly' ? (
            <NativeSelect
              className="w-full"
              value={draft.weekday}
              onChange={(event) =>
                setDraft({ ...draft, weekday: Number(event.target.value) })
              }
            >
              {weekdays.map((day, index) => (
                <NativeSelectOption key={day} value={index}>
                  {day}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Input
              type="number"
              min={1}
              max={28}
              required
              value={draft.dayOfMonth}
              onChange={(event) =>
                setDraft({ ...draft, dayOfMonth: Number(event.target.value) })
              }
            />
          )}
        </div>
        <div>
          <Label className="mb-1.5">Time · IST</Label>
          <Input
            type="time"
            required
            value={draft.time}
            onChange={(event) =>
              setDraft({ ...draft, time: event.target.value })
            }
          />
        </div>
      </div>
      {draft.frequency === 'Monthly' && (
        <p className="text-sm text-muted-foreground">
          Choose days 1–28 so every month has the same recurring date.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="mb-1.5">Owner</Label>
          <NativeSelect
            className="w-full"
            value={draft.ownerId}
            onChange={(event) =>
              setDraft({ ...draft, ownerId: event.target.value })
            }
          >
            {people.map((person) => (
              <NativeSelectOption key={person.id} value={person.id}>
                {person.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1.5">Linked stage</Label>
          <NativeSelect
            className="w-full"
            value={draft.stage ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                stage: event.target.value
                  ? (event.target.value as Stage)
                  : undefined,
              })
            }
          >
            <NativeSelectOption value="">Cross-stage</NativeSelectOption>
            {PIPELINE.map((stage) => (
              <NativeSelectOption key={stage}>{stage}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1.5">Reminder · hours before</Label>
          <Input
            type="number"
            min={0}
            max={720}
            required
            value={draft.reminderHours}
            onChange={(event) =>
              setDraft({ ...draft, reminderHours: Number(event.target.value) })
            }
          />
        </div>
      </div>
      <div>
        <Label className="mb-1.5">Expected deliverable</Label>
        <Textarea
          required
          minLength={3}
          value={draft.deliverable}
          onChange={(event) =>
            setDraft({ ...draft, deliverable: event.target.value })
          }
          placeholder="What should be ready when this checkpoint is complete?"
        />
      </div>
      <div>
        <Label className="mb-2">Participants</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <label
              key={person.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm"
            >
              <Checkbox
                checked={draft.participantIds.includes(person.id)}
                onCheckedChange={(checked) =>
                  setDraft({
                    ...draft,
                    participantIds: checked
                      ? [
                          ...draft.participantIds.filter(
                            (id) => id !== person.id,
                          ),
                          person.id,
                        ]
                      : draft.participantIds.filter((id) => id !== person.id),
                  })
                }
              />
              {person.name}
            </label>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={draft.active}
          onCheckedChange={(checked) =>
            setDraft({ ...draft, active: Boolean(checked) })
          }
        />
        Active recurrence
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !draft.name.trim() ||
            !draft.ownerId ||
            !draft.deliverable.trim() ||
            !draft.purpose.trim()
          }
        >
          Save cadence
        </Button>
      </DialogFooter>
    </form>
  );
}

function InviteUserDialog({
  open,
  onOpenChange,
  onInvite,
  canAssignAccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (draft: InviteDraft) => void;
  canAssignAccess: boolean;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Exclude<AppRole, 'Owner'>[]>([
    'Content Producer',
  ]);
  const assignable: Exclude<AppRole, 'Owner'>[] = [
    'Admin',
    'Content Producer',
    'Content Approver',
    'Monitoring',
    'Read-only Stakeholder',
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They receive a secure email invitation and must sign in before
            accessing the tracker.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canAssignAccess && !roles.length) return;
            onInvite({
              email: email.trim().toLowerCase(),
              fullName: fullName.trim(),
              roles: canAssignAccess ? roles : [],
            });
          }}
        >
          <div>
            <Label className="mb-1.5">Name</Label>
            <Input
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full name"
            />
          </div>
          <div>
            <Label className="mb-1.5">Work email</Label>
            <Input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@aafmindia.com"
            />
          </div>
          {canAssignAccess ? (
            <div>
              <Label className="mb-2">Starting access</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {assignable.map((role) => (
                  <label
                    key={role}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-sm"
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
            </div>
          ) : (
            <Alert className="border-border bg-muted/45">
              <ShieldCheck />
              <AlertTitle>Aditi will approve access</AlertTitle>
              <AlertDescription>
                You can send the invitation. The account remains pending until
                Aditi assigns its responsibilities.
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Invitations will be sent from the verified updates.buildablelabs.com
            email domain after Resend is connected.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !fullName.trim() ||
                !email.trim() ||
                (canAssignAccess && !roles.length)
              }
            >
              <Send /> Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    consultedIds: string[];
    informedIds: string[];
    copyOwners: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [contentType, setContentType] = useState(
    PLATFORM_CONTENT_TYPES.Instagram[0],
  );
  const [pillar, setPillar] = useState<ContentPillar>('Knowledge');
  const [dueAt, setDueAt] = useState('');
  const [responsibleId, setResponsibleId] = useState(
    people[1]?.id ?? people[0]?.id ?? '',
  );
  const [accountableIds, setAccountableIds] = useState<string[]>([]);
  const [consultedIds, setConsultedIds] = useState<string[]>([]);
  const [informedIds, setInformedIds] = useState<string[]>([]);
  const [copyOwners, setCopyOwners] = useState(true);
  const availableTypes = PLATFORM_CONTENT_TYPES[platform];
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
      consultedIds,
      informedIds,
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
                {availableTypes.map((value) => (
                  <NativeSelectOption key={value}>{value}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="mb-1.5">Platform</Label>
              <NativeSelect
                className="w-full"
                value={platform}
                onChange={(event) => {
                  const nextPlatform = event.target.value;
                  setPlatform(nextPlatform);
                  setContentType(PLATFORM_CONTENT_TYPES[nextPlatform][0]);
                }}
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
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
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
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                label: 'Consulted',
                description: 'People who give input before approval',
                ids: consultedIds,
                setIds: setConsultedIds,
              },
              {
                label: 'Informed',
                description: 'People who receive progress updates',
                ids: informedIds,
                setIds: setInformedIds,
              },
            ].map(({ label, description, ids, setIds }) => (
              <div key={label}>
                <Label>{label}</Label>
                <p className="mb-2 mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
                <div className="space-y-2">
                  {people
                    .filter((person) => person.isActive !== false)
                    .map((person) => (
                      <label
                        key={person.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={ids.includes(person.id)}
                          onCheckedChange={(checked) =>
                            setIds(
                              checked
                                ? [
                                    ...ids.filter((id) => id !== person.id),
                                    person.id,
                                  ]
                                : ids.filter((id) => id !== person.id),
                            )
                          }
                        />
                        {person.name}
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm">
            <Checkbox
              aria-label="Copy full RACI assignments to all stages"
              checked={copyOwners}
              onCheckedChange={(checked) => setCopyOwners(Boolean(checked))}
            />
            <span>
              <strong className="block text-card-foreground">
                Plan the full RACI ahead
              </strong>
              <span className="text-muted-foreground">
                Copy all four assignments across all six stages. Admin can
                revise each stage later.
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
          <div className="rounded-xl bg-background p-4">
            <p className="font-medium text-card-foreground">
              {intent.item.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
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
    setNotice('');
    setBusy(true);
    try {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error)
        setNotice(
          error.message.toLowerCase().includes('invalid login credentials')
            ? 'That password is not active yet. Open your invitation email, or use “Set or reset password” below to create one.'
            : error.message,
        );
    } catch {
      setNotice('Sign-in could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async () => {
    if (!email.trim()) {
      setNotice('Enter your email address first.');
      return;
    }
    setBusy(true);
    try {
      const redirect = new URL(window.location.origin);
      redirect.searchParams.set('auth_action', 'recovery');
      const { error } = await client.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: redirect.toString() },
      );
      setNotice(
        error
          ? error.message
          : 'Password link sent. Open it to create your password, then return here to sign in.',
      );
    } catch {
      setNotice('The password email could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <Image
          src="/aafm-india-logo.png"
          alt="AAFM India — American Academy of Financial Management"
          width={1684}
          height={594}
          className="mx-auto mb-7 h-auto w-full max-w-[360px]"
        />
        <Card className="bg-card p-2 shadow-xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Sign in to Content Operations
            </CardTitle>
            <CardDescription>
              Sign in with the password you created from your invitation email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="login-email" className="mb-1.5">
                  Email
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="login-password" className="mb-1.5">
                  Password
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {notice && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-sm text-[var(--danger-foreground)]"
                >
                  {notice}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => void resetPassword()}
              >
                Set or reset password
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Invite-only access · Asia/Kolkata
        </p>
      </div>
    </div>
  );
}

function SetPasswordScreen({
  client,
  email,
  onComplete,
  signOut,
}: {
  client: SupabaseClient;
  email: string;
  onComplete: () => void;
  signOut: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 10) {
      setMessage('Use at least 10 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.');
      return;
    }
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onComplete();
  };

  return (
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <Card className="w-full max-w-md bg-card shadow-xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Create your password
          </CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="new-password" className="mb-1.5">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirm-password" className="mb-1.5">
                Confirm password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            {message && (
              <p className="text-sm text-[var(--danger-foreground)]">
                {message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Saving…' : 'Save password'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={signOut}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function authActionFromLocation() {
  if (typeof window === 'undefined') return null;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.get('auth_action') ?? search.get('type') ?? hash.get('type');
}

function LoadingScreen() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 size-9 animate-spin rounded-full border-2 border-[#dfa126] border-t-transparent" />
        <p className="text-sm text-muted-foreground">
          Opening content operations…
        </p>
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
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <Card className="max-w-md bg-card">
        <CardHeader>
          <CardTitle>Access is waiting for an Owner</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your account is valid. Aditi needs to activate it and assign at
            least one responsibility.
          </p>
          <Button variant="outline" className="mt-4" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
