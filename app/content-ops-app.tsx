'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { AlertTriangle, BarChart3, Bell, Check, CheckCircle2, ChevronRight, CircleGauge, ExternalLink, FileCheck2, FileText, LayoutDashboard, Link2, LogOut, MessageSquareText, Plus, RefreshCw, Settings2, ShieldCheck, UploadCloud, UserRound, Users2, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { demoItems, demoPeople } from '@/lib/demo-data';
import { PIPELINE, type AppRole, type ContentItem, type Person, type Stage } from '@/lib/content-types';
import { makeSupabaseClient, type SupabaseConfig } from '@/lib/supabase-client';
import { loadLiveSnapshot } from '@/lib/supabase-data';

type View = 'overview' | 'pipeline' | 'approvals' | 'monitoring' | 'stakeholder' | 'people' | 'settings';
const ROLE_PERSON: Record<AppRole, string> = { Admin: 'p1', 'Content Producer': 'p2', 'Content Approver': 'p6', Monitoring: 'p7', 'Read-only Stakeholder': 'p8' };
const stageToDb: Record<Stage, string> = { Idea: 'idea', Script: 'script', Shoot: 'shoot', Production: 'production', Upload: 'upload', 'Post-Upload Metrics': 'post_upload_metrics' };

const nav: Array<{ view: View; label: string; icon: typeof LayoutDashboard }> = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'pipeline', label: 'Content pipeline', icon: FileText },
  { view: 'approvals', label: 'Approval queue', icon: FileCheck2 },
  { view: 'monitoring', label: 'Monitoring', icon: BarChart3 },
  { view: 'stakeholder', label: 'Stakeholder view', icon: CircleGauge },
  { view: 'people', label: 'People & roles', icon: Users2 },
  { view: 'settings', label: 'Settings', icon: Settings2 },
];

export default function ContentOpsApp({ supabaseConfig }: { supabaseConfig?: SupabaseConfig }) {
  const demoMode = !supabaseConfig;
  const client = useMemo(() => supabaseConfig ? makeSupabaseClient(supabaseConfig) : null, [supabaseConfig]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [activeProfile, setActiveProfile] = useState(demoMode);
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [items, setItems] = useState<ContentItem[]>(demoItems);
  const [currentUser, setCurrentUser] = useState<Person>(demoPeople[0]);
  const [currentRole, setCurrentRole] = useState<AppRole>('Admin');
  const [view, setView] = useState<View>('overview');
  const [selectedId, setSelectedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [overrideItem, setOverrideItem] = useState<ContentItem>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const reloadLive = useCallback(async (supabase: SupabaseClient, user: User) => {
    const snapshot = await loadLiveSnapshot(supabase, user);
    setPeople(snapshot.people); setItems(snapshot.items); setCurrentUser(snapshot.currentUser); setActiveProfile(snapshot.currentUserActive);
    if (snapshot.currentUser.roles.length) setCurrentRole(snapshot.currentUser.roles[0]);
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      setAuthUser(data.user ?? null);
      if (data.user) await reloadLive(client, data.user).catch((error) => setNotice(error.message));
      setAuthReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null; setAuthUser(user);
      if (user) void reloadLive(client, user).catch((error) => setNotice(error.message));
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client, reloadLive]);

  const rolePerson = demoMode ? people.find((person) => person.id === ROLE_PERSON[currentRole]) ?? currentUser : currentUser;
  const selected = items.find((item) => item.id === selectedId);
  const visibleItems = useMemo(() => filterForRole(items, currentRole, rolePerson), [items, currentRole, rolePerson]);
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 4000); };

  const mutateLive = async (work: (supabase: SupabaseClient) => Promise<unknown>, success: string) => {
    if (!client || !authUser) return;
    setBusy(true);
    try { await work(client); await reloadLive(client, authUser); showNotice(success); }
    catch (error) { showNotice(error instanceof Error ? error.message : 'Something went wrong'); }
    finally { setBusy(false); }
  };

  const submitStage = async (item: ContentItem) => {
    if (!demoMode) return mutateLive(async (supabase) => { const { error } = await supabase.rpc('submit_current_stage', { p_item_id: item.id }); if (error) throw error; }, 'Sent for accountable approval.');
    setItems((all) => all.map((row) => row.id === item.id ? { ...row, status: 'Pending approval', history: [...row.history, { action: `${row.stage} submitted for approval`, actor: rolePerson.name, at: 'Just now' }] } : row));
    showNotice('Sent for accountable approval.');
  };

  const advance = async (item: ContentItem, reason?: string) => {
    if (!demoMode) return mutateLive(async (supabase) => { const { error } = await supabase.rpc('advance_content_item', { p_item_id: item.id, p_override_reason: reason || null, p_next_due_at: null }); if (error) throw error; }, 'Approval recorded and item advanced.');
    const index = PIPELINE.indexOf(item.stage);
    const last = index === PIPELINE.length - 1;
    setItems((all) => all.map((row) => row.id === item.id ? {
      ...row, stage: last ? row.stage : PIPELINE[index + 1], status: last ? 'Approved' : 'In progress', lifecycle: last ? 'Closed' : 'Active',
      dueAt: last ? undefined : new Date(Date.now() + 48 * 3600_000).toISOString(), secondLens: reason ? 'Overridden' : last || !['Script', 'Production'].includes(PIPELINE[index + 1] ?? '') ? 'Not needed' : 'Awaiting review',
      history: [...row.history, { action: last ? 'Item closed' : reason ? `Advanced without second-lens review → ${PIPELINE[index + 1]}` : `${row.stage} approved → ${PIPELINE[index + 1]}`, actor: rolePerson.name, at: 'Just now', note: reason, flagged: Boolean(reason) }],
    } : row));
    setOverrideItem(undefined); showNotice(last ? 'Item closed.' : 'Approval recorded and item advanced.');
  };

  const approve = (item: ContentItem) => {
    if (['Script', 'Production'].includes(item.stage) && item.secondLens !== 'Approved') setOverrideItem(item); else void advance(item);
  };

  const requestChanges = async (item: ContentItem, note: string) => {
    if (!note.trim()) return showNotice('Add a short change note first.');
    if (!demoMode) return mutateLive(async (supabase) => { const { error } = await supabase.rpc('request_stage_changes', { p_item_id: item.id, p_note: note }); if (error) throw error; }, 'Changes requested.');
    setItems((all) => all.map((row) => row.id === item.id ? { ...row, status: 'Changes requested', history: [...row.history, { action: `${row.stage} changes requested`, actor: rolePerson.name, at: 'Just now', note }] } : row));
    showNotice('Changes requested.');
  };

  const secondLensReview = async (item: ContentItem, approved: boolean, note: string) => {
    if (!demoMode) return mutateLive(async (supabase) => { const { error } = await supabase.from('stage_reviews').insert({ content_item_id: item.id, stage: stageToDb[item.stage], reviewer_id: authUser!.id, decision: approved ? 'approved' : 'changes_requested', note: note || null }); if (error) throw error; }, approved ? 'Second-lens approval recorded.' : 'Second-lens changes requested.');
    setItems((all) => all.map((row) => row.id === item.id ? { ...row, secondLens: approved ? 'Approved' : 'Changes requested', comments: note ? [...row.comments, { id: crypto.randomUUID(), author: rolePerson.name, initials: rolePerson.initials, body: note, at: 'Just now' }] : row.comments } : row));
    showNotice(approved ? 'Second-lens approval recorded.' : 'Second-lens changes requested.');
  };

  const addComment = async (item: ContentItem, body: string, parentId?: string) => {
    if (!body.trim()) return;
    if (!demoMode) return mutateLive(async (supabase) => { const { error } = await supabase.from('comments').insert({ content_item_id: item.id, parent_id: parentId ? Number(parentId) : null, author_id: authUser!.id, body: body.trim(), mentioned_profile_ids: [] }); if (error) throw error; }, 'Comment added.');
    setItems((all) => all.map((row) => row.id === item.id ? { ...row, comments: [...row.comments, { id: crypto.randomUUID(), author: rolePerson.name, initials: rolePerson.initials, body: body.trim(), at: 'Just now', parentId }] } : row));
    showNotice('Comment added.');
  };

  const addMetric = async (item: ContentItem, values: { views: number; likes: number; comments: number; shares: number }) => {
    if (!demoMode) return mutateLive(async (supabase) => { const { error } = await supabase.from('metrics_entries').upsert({ content_item_id: item.id, platform: item.platform, ...values, recorded_on: new Date().toISOString().slice(0, 10), recorded_by: authUser!.id, source: 'manual' }, { onConflict: 'content_item_id,platform,recorded_on,source' }); if (error) throw error; }, 'Metrics snapshot saved.');
    setItems((all) => all.map((row) => row.id === item.id ? { ...row, metrics: [{ id: crypto.randomUUID(), platform: item.platform, ...values, recordedOn: new Date().toISOString().slice(0, 10) }, ...row.metrics] } : row));
    showNotice('Metrics snapshot saved.');
  };

  const createItem = async (draft: { title: string; contentType: string; platform: string; dueAt: string; responsibleId: string; accountableIds: string[]; copyOwners: boolean }) => {
    const creator = rolePerson;
    if (!demoMode) return mutateLive(async (supabase) => {
      const { data, error } = await supabase.from('content_items').insert({ title: draft.title, content_type: draft.contentType, platform: draft.platform, due_at: draft.dueAt || null, created_by: authUser!.id }).select('id').single(); if (error) throw error;
      const assignmentStages = draft.copyOwners ? PIPELINE : ['Idea'] as const;
      const assignments = assignmentStages.flatMap((stage) => [{ content_item_id: data.id, stage: stageToDb[stage], profile_id: draft.responsibleId, assignment_type: 'responsible' }, ...draft.accountableIds.map((profileId) => ({ content_item_id: data.id, stage: stageToDb[stage], profile_id: profileId, assignment_type: 'accountable' }))]);
      const { error: assignmentError } = await supabase.from('item_stage_assignments').insert(assignments); if (assignmentError) throw assignmentError;
    }, 'Content item created.');
    const responsible = people.filter((person) => person.id === draft.responsibleId); const accountable = people.filter((person) => draft.accountableIds.includes(person.id));
    setItems((all) => [{ id: crypto.randomUUID(), title: draft.title, contentType: draft.contentType, platform: draft.platform, stage: 'Idea', status: 'In progress', dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : undefined, reminderHours: 24, lifecycle: 'Active', responsible, accountable, secondLens: 'Not needed', links: [], comments: [], metrics: [], history: [{ action: 'Item created', actor: creator.name, at: 'Just now' }] }, ...all]);
    setCreateOpen(false); showNotice('Content item created.');
  };

  useEffect(() => {
    const context = document.modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const requireEmptyObject = (input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 0) throw new Error('Expected an empty object');
    };
    const tools = [
      { name: 'list_actionable_content', title: 'List actionable content', description: 'List active content items that are overdue or awaiting approval in the visible workspace.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { requireEmptyObject(input); return visibleItems.filter((item) => item.status === 'Pending approval' || isOverdue(item)).map((item) => ({ id: item.id, title: item.title, stage: item.stage, status: item.status, dueAt: item.dueAt })); } },
      { name: 'start_content_creation', title: 'Start content creation', description: 'Open the new content form without creating a record.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { requireEmptyObject(input); setCreateOpen(true); return { status: 'form_opened' }; } },
      { name: 'submit_content_stage', title: 'Submit content stage', description: 'Submit one visible content item current stage for accountable approval.', inputSchema: { type: 'object', properties: { contentItemId: { type: 'string' } }, required: ['contentItemId'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof (input as { contentItemId?: unknown }).contentItemId !== 'string') throw new Error('A contentItemId string is required'); const id = (input as { contentItemId: string }).contentItemId; const item = visibleItems.find((row) => row.id === id); if (!item) throw new Error('Visible content item not found'); await submitStage(item); return { id: item.id, status: 'pending_approval' }; } },
    ];
    for (const tool of tools) void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [visibleItems]);

  if (!authReady) return <LoadingScreen />;
  if (!demoMode && !authUser) return <LoginScreen client={client!} notice={notice} setNotice={setNotice} />;
  if (!demoMode && !activeProfile) return <PendingAccess email={authUser?.email ?? ''} signOut={() => void client?.auth.signOut()} />;

  return (
    <SidebarProvider>
      <Sidebar className="border-r-0" collapsible="offcanvas">
        <SidebarHeader className="px-5 pb-6 pt-6"><div className="flex items-center gap-3"><div className="brand-mark">A</div><div><p className="brand-name">AAFM India</p><p className="text-xs text-white/55">Content operations</p></div></div></SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1.5 px-2">
          {nav.map(({ view: target, label, icon: Icon }) => <SidebarMenuItem key={target}><SidebarMenuButton isActive={view === target} onClick={() => setView(target)} className="h-10 text-[14px] text-white/70 hover:bg-white/10 hover:text-white data-active:bg-white/12 data-active:text-white"><Icon /><span>{label}</span>{target === 'approvals' && <Badge className="ml-auto bg-[#dfa126] text-[#1f2342]">{items.filter((item) => item.status === 'Pending approval').length}</Badge>}</SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
        <SidebarFooter className="p-4"><div className="rounded-xl border border-white/10 bg-white/6 p-3"><div className="flex items-center gap-2.5"><Avatar person={rolePerson} /><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{rolePerson.name}</p><p className="truncate text-xs text-white/45">{currentRole}{demoMode ? ' · demo' : ''}</p></div></div></div></SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#f4f1ea]">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#1f2342]/8 bg-[#f4f1ea]/92 px-4 py-2 backdrop-blur-md sm:px-7 lg:px-10">
          <div className="flex items-center gap-3"><SidebarTrigger className="md:hidden" /><div className="hidden sm:block"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a5200]">Sunday, 7 September</p><p className="text-sm text-[#525570]">Asia/Kolkata</p></div></div>
          <div className="flex items-center gap-2">{demoMode && <NativeSelect aria-label="Preview role" value={currentRole} onChange={(event) => { const role = event.target.value as AppRole; setCurrentRole(role); setCurrentUser(people.find((person) => person.id === ROLE_PERSON[role]) ?? currentUser); }} className="max-w-[180px] bg-white"><NativeSelectOption>Admin</NativeSelectOption><NativeSelectOption>Content Producer</NativeSelectOption><NativeSelectOption>Content Approver</NativeSelectOption><NativeSelectOption>Monitoring</NativeSelectOption><NativeSelectOption>Read-only Stakeholder</NativeSelectOption></NativeSelect>}
            <Button variant="outline" size="icon" aria-label="Notifications"><Bell /></Button>{currentRole !== 'Read-only Stakeholder' && <Button onClick={() => setCreateOpen(true)} className="bg-[#1f2342] text-white hover:bg-[#2d3159]"><Plus /> <span className="hidden sm:inline">New content</span></Button>}{!demoMode && <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void client?.auth.signOut()}><LogOut /></Button>}</div>
        </header>
        {notice && <output className="fixed right-4 top-20 z-50 max-w-sm rounded-xl bg-[#1f2342] px-4 py-3 text-sm text-white shadow-xl">{notice}</output>}
        <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          {view === 'overview' && <Overview items={visibleItems} onOpen={(id) => setSelectedId(id)} setView={setView} />}
          {view === 'pipeline' && <Pipeline items={visibleItems} onOpen={(id) => setSelectedId(id)} />}
          {view === 'approvals' && <Approvals items={visibleItems} role={currentRole} onOpen={(id) => setSelectedId(id)} onReview={secondLensReview} />}
          {view === 'monitoring' && <Monitoring items={visibleItems} onOpen={(id) => setSelectedId(id)} onSave={addMetric} />}
          {view === 'stakeholder' && <Stakeholder items={items} />}
          {view === 'people' && <People people={people} demoMode={demoMode} />}
          {view === 'settings' && <Settings demoMode={demoMode} />}
        </main>
      </SidebarInset>
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} people={people} onCreate={createItem} />
      <ItemDetail open={Boolean(selected)} item={selected} role={currentRole} busy={busy} onOpenChange={(open) => !open && setSelectedId(undefined)} onSubmit={submitStage} onApprove={approve} onRequestChanges={requestChanges} onComment={addComment} onMetric={addMetric} />
      <OverrideDialog item={overrideItem} onOpenChange={(open) => !open && setOverrideItem(undefined)} onConfirm={advance} />
    </SidebarProvider>
  );
}

function filterForRole(items: ContentItem[], role: AppRole, person: Person) {
  if (role === 'Admin' || role === 'Read-only Stakeholder') return items;
  if (role === 'Content Approver') return items.filter((item) => ['Script', 'Production'].includes(item.stage));
  if (role === 'Monitoring') return items.filter((item) => item.stage === 'Post-Upload Metrics' || item.publishedAt);
  return items.filter((item) => [...item.responsible, ...item.accountable].some((owner) => owner.id === person.id));
}

function isOverdue(item: ContentItem) { return Boolean(item.dueAt && new Date(item.dueAt).getTime() < Date.now() && item.lifecycle === 'Active'); }
function dueLabel(item: ContentItem) { if (!item.dueAt) return 'No due date'; return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(item.dueAt)); }
function stagePercent(stage: Stage) { return ((PIPELINE.indexOf(stage) + 1) / PIPELINE.length) * 100; }
function Avatar({ person }: { person: Person }) { return <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dfa126] text-[11px] font-bold text-[#1f2342]">{person.initials}</div>; }
function Owners({ people }: { people: Person[] }) { return <div className="flex -space-x-2">{people.slice(0, 3).map((person) => <div key={person.id} title={person.name} className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#eceef7] text-[10px] font-bold text-[#1f2342]">{person.initials}</div>)}{people.length > 3 && <div className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#1f2342] text-[10px] text-white">+{people.length - 3}</div>}</div>; }
function StatusBadge({ item }: { item: ContentItem }) { const cls = item.status === 'Pending approval' ? 'bg-[#f7efdd] text-[#7a5200]' : item.status === 'Changes requested' ? 'bg-[#fff0e8] text-[#b34726]' : 'bg-[#eceef7] text-[#1f2342]'; return <Badge className={cls}>{item.status}</Badge>; }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="mb-7"><p className="mb-2 text-sm font-semibold text-[#b27708]">{eyebrow}</p><h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-[#1f2342] sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-base text-[#6b7280]">{description}</p></div>; }

function MetricCard({ label, value, detail, icon: Icon, accent = false, warning = false }: { label: string; value: string; detail: string; icon: typeof CircleGauge; accent?: boolean; warning?: boolean }) {
  return <Card className={`border-0 shadow-[0_10px_30px_rgba(31,35,66,0.045)] ring-1 ring-[#1f2342]/8 ${accent ? 'bg-[#1f2342] text-white' : 'bg-white'}`}><CardHeader><CardDescription className={accent ? 'text-white/55' : 'text-[#6b7280]'}>{label}</CardDescription><CardAction><div className={`grid size-9 place-items-center rounded-lg ${warning ? 'bg-[#fff0e8] text-[#b34726]' : accent ? 'bg-white/10 text-[#f0c254]' : 'bg-[#f7efdd] text-[#9a6908]'}`}><Icon className="size-4" /></div></CardAction></CardHeader><CardContent><p className={`font-display text-3xl font-semibold ${accent ? 'text-white' : 'text-[#1f2342]'}`}>{value}</p><p className={`mt-2 text-xs ${accent ? 'text-white/45' : warning ? 'text-[#b34726]' : 'text-[#8b8e9e]'}`}>{detail}</p></CardContent></Card>;
}

function Overview({ items, onOpen, setView }: { items: ContentItem[]; onOpen: (id: string) => void; setView: (view: View) => void }) {
  const active = items.filter((item) => item.lifecycle === 'Active'); const approvals = active.filter((item) => item.status === 'Pending approval'); const overdue = active.filter(isOverdue); const posted = items.filter((item) => item.publishedAt?.startsWith('2026-09-07'));
  return <><PageTitle eyebrow="OPERATIONS OVERVIEW" title="Keep every story moving." description="Approvals, ownership and deadlines across the AAFM India content pipeline." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active items" value={String(active.length)} detail="Across six stages" icon={CircleGauge} /><MetricCard label="Needs approval" value={String(approvals.length)} detail="Explicit sign-off required" icon={FileCheck2} accent /><MetricCard label="Posted today" value={String(posted.length)} detail="Across active platforms" icon={CheckCircle2} /><MetricCard label="Overdue" value={String(overdue.length)} detail={overdue.length ? 'Needs attention today' : 'Everything on track'} icon={AlertTriangle} warning /></section>
    <section className="mt-7 rounded-2xl border border-[#1f2342]/10 bg-white p-5 shadow-[0_12px_35px_rgba(31,35,66,0.05)] sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#1f2342]">Pipeline pulse</h2><p className="mt-1 text-sm text-[#6b7280]">{active.length} active items by stage</p></div><Button variant="ghost" size="sm" onClick={() => setView('pipeline')}>View pipeline <ChevronRight /></Button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{PIPELINE.map((stage, index) => <div key={stage} className="relative overflow-hidden rounded-xl border border-[#1f2342]/8 bg-[#fbfaf6] p-4"><div className={`absolute inset-x-0 top-0 h-1 ${['bg-slate-400','bg-[#dfa126]','bg-sky-500','bg-violet-500','bg-emerald-500','bg-[#1f2342]'][index]}`} /><p className="mt-1 text-sm font-medium text-[#525570]">{stage === 'Post-Upload Metrics' ? 'Metrics' : stage}</p><div className="mt-5 flex items-end justify-between"><span className="font-display text-3xl font-semibold text-[#1f2342]">{active.filter((item) => item.stage === stage).length}</span><span className="text-xs text-[#9b9da9]">0{index + 1}</span></div></div>)}</div></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,.7fr)]"><Card className="bg-white"><CardHeader><CardTitle>Action queue</CardTitle><CardDescription>Items requiring attention next</CardDescription></CardHeader><CardContent className="overflow-x-auto px-0 sm:px-4"><ItemTable items={[...overdue, ...approvals.filter((item) => !overdue.includes(item))].slice(0, 5)} onOpen={onOpen} /></CardContent></Card><Card className="bg-[#1f2342] text-white ring-0"><CardHeader><CardTitle>Second-lens review</CardTitle><CardDescription className="text-white/55">BuildableLabs queue</CardDescription><CardAction><MessageSquareText className="size-5 text-[#f0c254]" /></CardAction></CardHeader><CardContent className="space-y-3">{items.filter((item) => ['Script','Production'].includes(item.stage) && item.secondLens === 'Awaiting review').slice(0, 3).map((item) => <button key={item.id} onClick={() => onOpen(item.id)} className="w-full rounded-xl border border-white/10 bg-white/6 p-3 text-left transition hover:bg-white/10"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{item.title}</p><ChevronRight className="size-4 text-white/40" /></div><p className="mt-2 text-xs text-white/50">{item.stage} · Awaiting review</p></button>)}</CardContent></Card></section></>;
}

function ItemTable({ items, onOpen }: { items: ContentItem[]; onOpen: (id: string) => void }) { return <Table><TableHeader><TableRow><TableHead>Content</TableHead><TableHead>Stage</TableHead><TableHead>Accountable</TableHead><TableHead>Due</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id} className="cursor-pointer" onClick={() => onOpen(item.id)}><TableCell className="min-w-[250px]"><p className="font-medium text-[#1f2342]">{item.title}</p><p className="mt-1 text-xs text-[#7b7f90]">{item.contentType}</p></TableCell><TableCell><div className="space-y-2"><StatusBadge item={item} /><p className="text-xs text-[#7b7f90]">{item.stage}</p></div></TableCell><TableCell><Owners people={item.accountable} /></TableCell><TableCell className={isOverdue(item) ? 'font-medium text-[#b34726]' : 'text-[#525570]'}>{dueLabel(item)}</TableCell></TableRow>)}</TableBody></Table>;
}

function Pipeline({ items, onOpen }: { items: ContentItem[]; onOpen: (id: string) => void }) { return <><PageTitle eyebrow="CONTENT PIPELINE" title="Six stages. One clear handoff." description="Every move is deliberate, assigned and recorded." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{PIPELINE.map((stage, index) => { const rows = items.filter((item) => item.stage === stage && item.lifecycle === 'Active'); return <section key={stage} className="min-w-0 rounded-2xl border border-[#1f2342]/10 bg-white/70 p-3"><div className="mb-3 flex items-center justify-between px-1"><div><p className="text-xs font-semibold text-[#9b6908]">0{index + 1}</p><h2 className="text-sm font-semibold text-[#1f2342]">{stage}</h2></div><Badge variant="secondary">{rows.length}</Badge></div><div className="space-y-3">{rows.map((item) => <button key={item.id} onClick={() => onOpen(item.id)} className="w-full rounded-xl border border-[#1f2342]/8 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-sm font-medium leading-snug text-[#1f2342]">{item.title}</p><p className="mt-1 text-xs text-[#7b7f90]">{item.contentType}</p><div className="mt-4 flex items-center justify-between"><Owners people={item.accountable} /><span className={`text-[11px] ${isOverdue(item) ? 'font-semibold text-[#b34726]' : 'text-[#7b7f90]'}`}>{dueLabel(item)}</span></div><Progress value={stagePercent(item.stage)} className="mt-3" /></button>)}{!rows.length && <div className="rounded-xl border border-dashed border-[#1f2342]/15 px-3 py-8 text-center text-xs text-[#8b8e9e]">No items here</div>}</div></section>; })}</div></>;
}

function Approvals({ items, role, onOpen, onReview }: { items: ContentItem[]; role: AppRole; onOpen: (id: string) => void; onReview: (item: ContentItem, approved: boolean, note: string) => void }) { const waiting = items.filter((item) => item.status === 'Pending approval'); const secondLens = items.filter((item) => ['Script','Production'].includes(item.stage) && item.secondLens === 'Awaiting review'); return <><PageTitle eyebrow="APPROVAL QUEUE" title={role === 'Content Approver' ? 'Your second-lens queue.' : 'Work waiting for sign-off.'} description="Review the evidence, leave a note and make the next move explicit." /><Tabs defaultValue={role === 'Content Approver' ? 'second' : 'accountable'}><TabsList><TabsTrigger value="accountable">Accountable approval ({waiting.length})</TabsTrigger><TabsTrigger value="second">Second-lens review ({secondLens.length})</TabsTrigger></TabsList><TabsContent value="accountable"><Card className="mt-4 bg-white"><CardContent className="overflow-x-auto px-0 sm:px-4"><ItemTable items={waiting} onOpen={onOpen} /></CardContent></Card></TabsContent><TabsContent value="second"><div className="mt-4 grid gap-4 lg:grid-cols-2">{secondLens.map((item) => <ReviewCard key={item.id} item={item} onOpen={onOpen} onReview={onReview} />)}</div></TabsContent></Tabs></>;
}

function ReviewCard({ item, onOpen, onReview }: { item: ContentItem; onOpen: (id: string) => void; onReview: (item: ContentItem, approved: boolean, note: string) => void }) { const [note, setNote] = useState(''); return <Card className="bg-white"><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.contentType} · {item.stage}</CardDescription><CardAction><Badge className="bg-[#f7efdd] text-[#7a5200]">BuildableLabs</Badge></CardAction></CardHeader><CardContent className="space-y-3"><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add review notes (optional for approval)" /><div className="flex flex-wrap gap-2"><Button onClick={() => onReview(item, true, note)}><Check /> Approve review</Button><Button variant="outline" onClick={() => onReview(item, false, note || 'Please revise based on the review feedback.')}><RefreshCw /> Request changes</Button><Button variant="ghost" onClick={() => onOpen(item.id)}>Open item</Button></div></CardContent></Card>; }

function Monitoring({ items, onOpen, onSave }: { items: ContentItem[]; onOpen: (id: string) => void; onSave: (item: ContentItem, values: { views: number; likes: number; comments: number; shares: number }) => void }) { const missing = items.filter((item) => item.stage === 'Post-Upload Metrics' && item.metrics.length === 0); const recorded = items.filter((item) => item.metrics.length > 0); return <><PageTitle eyebrow="POST-UPLOAD METRICS" title="Close the feedback loop." description="Add dated performance snapshots now; the model is ready for automated platform pulls later." /><div className="grid gap-5 xl:grid-cols-[1fr_.75fr]"><div className="space-y-4"><h2 className="text-base font-semibold text-[#1f2342]">Missing a metrics entry <Badge className="ml-2 bg-[#fff0e8] text-[#b34726]">{missing.length}</Badge></h2>{missing.map((item) => <MetricsCard key={item.id} item={item} onSave={onSave} onOpen={onOpen} />)}</div><Card className="h-fit bg-white"><CardHeader><CardTitle>Latest snapshots</CardTitle><CardDescription>Manually recorded performance</CardDescription></CardHeader><CardContent className="space-y-4">{recorded.flatMap((item) => item.metrics.slice(0,1).map((metric) => <button onClick={() => onOpen(item.id)} key={metric.id} className="w-full rounded-xl bg-[#f4f1ea] p-4 text-left"><p className="text-sm font-medium text-[#1f2342]">{item.title}</p><div className="mt-3 grid grid-cols-4 gap-2 text-center"><MiniStat label="Views" value={metric.views} /><MiniStat label="Likes" value={metric.likes} /><MiniStat label="Comments" value={metric.comments} /><MiniStat label="Shares" value={metric.shares} /></div></button>))}</CardContent></Card></div></>;
}
function MetricsCard({ item, onSave, onOpen }: { item: ContentItem; onSave: (item: ContentItem, values: { views: number; likes: number; comments: number; shares: number }) => void; onOpen: (id: string) => void }) { const [values, setValues] = useState({ views: 0, likes: 0, comments: 0, shares: 0 }); return <Card className="bg-white"><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.platform} · Posted {item.publishedAt ? dueLabel({ ...item, dueAt: item.publishedAt }) : 'recently'}</CardDescription></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.keys(values).map((key) => <div key={key}><Label className="mb-1.5 capitalize">{key}</Label><Input type="number" min="0" value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: Number(event.target.value) })} /></div>)}</div><div className="mt-4 flex gap-2"><Button onClick={() => onSave(item, values)}>Save snapshot</Button><Button variant="ghost" onClick={() => onOpen(item.id)}>Open item</Button></div></CardContent></Card>; }
function MiniStat({ label, value }: { label: string; value: number }) { return <div><p className="font-display text-lg font-semibold text-[#1f2342]">{new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(value)}</p><p className="text-[10px] text-[#7b7f90]">{label}</p></div>; }

function Stakeholder({ items }: { items: ContentItem[] }) { const active = items.filter((item) => item.lifecycle === 'Active'); const overrides = items.flatMap((item) => item.history.filter((event) => event.flagged).map((event) => ({ item, event }))); return <><PageTitle eyebrow="READ-ONLY OVERVIEW" title="The signal, without the noise." description="A clean view of delivery health, current accountability and exceptional overrides." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active items" value={String(active.length)} detail="All stages" icon={CircleGauge} /><MetricCard label="Posted today" value={String(items.filter((item) => item.publishedAt?.startsWith('2026-09-07')).length)} detail="Asia/Kolkata" icon={UploadCloud} /><MetricCard label="Overdue" value={String(active.filter(isOverdue).length)} detail="Needs intervention" icon={AlertTriangle} warning /><MetricCard label="Recent overrides" value={String(overrides.length)} detail="Second-lens exceptions" icon={ShieldCheck} accent /></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><Card className="bg-white"><CardHeader><CardTitle>Who is accountable</CardTitle></CardHeader><CardContent className="space-y-3">{active.slice(0,6).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#1f2342]/8 p-3"><div><p className="text-sm font-medium text-[#1f2342]">{item.title}</p><p className="mt-1 text-xs text-[#7b7f90]">{item.stage}</p></div><Owners people={item.accountable} /></div>)}</CardContent></Card><Card className="bg-white"><CardHeader><CardTitle>Recent overrides</CardTitle><CardDescription>Advanced without second-lens sign-off</CardDescription></CardHeader><CardContent className="space-y-3">{overrides.map(({ item, event }) => <Alert key={item.id} className="border-[#dfa126]/40 bg-[#f7efdd]"><AlertTriangle /><AlertTitle>{item.title}</AlertTitle><AlertDescription>{event.note} · {event.actor}</AlertDescription></Alert>)}</CardContent></Card></div></>;
}
function People({ people, demoMode }: { people: Person[]; demoMode: boolean }) { return <><PageTitle eyebrow="PEOPLE & ROLES" title="Accountability is assigned, not assumed." description="Users can hold more than one role. Admins can assign multiple accountable owners at every stage." />{demoMode && <Alert className="mb-5 border-[#dfa126]/40 bg-[#f7efdd]"><UserRound /><AlertTitle>Demonstration team</AlertTitle><AlertDescription>These are fictional users. Real users will appear here after Supabase is connected and invitations are sent.</AlertDescription></Alert>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{people.map((person) => <Card key={person.id} className="bg-white"><CardHeader><div className="flex items-center gap-3"><Avatar person={person} /><div><CardTitle>{person.name}</CardTitle><CardDescription>{person.email}</CardDescription></div></div></CardHeader><CardContent className="flex flex-wrap gap-2">{person.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</CardContent></Card>)}</div></>;
}
function Settings({ demoMode }: { demoMode: boolean }) { const [hours, setHours] = useState(24); return <><PageTitle eyebrow="PIPELINE SETTINGS" title="Defaults that keep the team moving." description="Admins can tune reminders and the controlled lists used when new content is created." /><div className="grid gap-5 lg:grid-cols-2"><Card className="bg-white"><CardHeader><CardTitle>Due-date reminders</CardTitle><CardDescription>Default lead time for new items</CardDescription></CardHeader><CardContent><Label className="mb-2">Hours before due date</Label><div className="flex max-w-xs gap-2"><Input type="number" min="0" max="720" value={hours} onChange={(event) => setHours(Number(event.target.value))} /><Button onClick={() => undefined}>Save</Button></div><p className="mt-3 text-xs text-[#7b7f90]">Each content item can override this value manually. Overdue alerts repeat daily.</p></CardContent></Card><Card className="bg-white"><CardHeader><CardTitle>Email delivery</CardTitle><CardDescription>Resend notification adapter</CardDescription></CardHeader><CardContent><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#dfa126]" /><p className="text-sm font-medium">Waiting for API key</p></div><p className="mt-3 text-sm text-[#6b7280]">Notifications are queued safely. Add the Resend API key and verified sender later to begin delivery.</p>{demoMode && <Badge className="mt-4 bg-[#eceef7] text-[#1f2342]">Demo mode</Badge>}</CardContent></Card></div></>;
}

function ItemDetail({ open, item, role, busy, onOpenChange, onSubmit, onApprove, onRequestChanges, onComment, onMetric }: { open: boolean; item?: ContentItem; role: AppRole; busy: boolean; onOpenChange: (open: boolean) => void; onSubmit: (item: ContentItem) => void; onApprove: (item: ContentItem) => void; onRequestChanges: (item: ContentItem, note: string) => void; onComment: (item: ContentItem, body: string, parentId?: string) => void; onMetric: (item: ContentItem, values: { views: number; likes: number; comments: number; shares: number }) => void }) {
  const [comment, setComment] = useState(''); const [changeNote, setChangeNote] = useState(''); if (!item) return null; const readOnly = role === 'Read-only Stakeholder';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-5">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <Badge variant="secondary">{item.stage}</Badge>
            <StatusBadge item={item} />
            {isOverdue(item) && <Badge variant="destructive">Overdue</Badge>}
          </div>
          <SheetTitle className="mt-3 font-display text-2xl font-semibold">{item.title}</SheetTitle>
          <SheetDescription>{item.contentType} · {item.platform} · Due {dueLabel(item)}</SheetDescription>
        </SheetHeader>

        <div className="px-5">
          <Tabs defaultValue={['Script', 'Production'].includes(item.stage) ? 'comments' : 'work'}>
            <TabsList className="mt-2">
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="comments">Comments ({item.comments.length})</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>

            <TabsContent value="work" className="space-y-5 py-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">Progress</p>
                <Progress value={stagePercent(item.stage)} />
                <div className="mt-2 flex justify-between text-xs text-[#7b7f90]">
                  <span>{item.stage}</span>
                  <span>{Math.round(stagePercent(item.stage))}%</span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoBlock label="Responsible" people={item.responsible} />
                <InfoBlock label="Accountable" people={item.accountable} />
              </div>
              {['Script', 'Production'].includes(item.stage) && (
                <Alert className="border-[#dfa126]/40 bg-[#f7efdd]">
                  <ShieldCheck />
                  <AlertTitle>Second-lens review: {item.secondLens}</AlertTitle>
                  <AlertDescription>BuildableLabs review is recommended. Accountable owners can override with a recorded reason.</AlertDescription>
                </Alert>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">External files</p>
                <div className="space-y-2">
                  {item.links.map((link) => (
                    <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border p-3 text-sm hover:bg-[#f4f1ea]">
                      <span className="flex items-center gap-2"><Link2 className="size-4 text-[#b27708]" />{link.label}</span>
                      <ExternalLink className="size-4" />
                    </a>
                  ))}
                  {!item.links.length && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-[#7b7f90]">No links added yet.</p>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comments" className="py-5">
              <div className="space-y-4">
                {item.comments.map((entry) => (
                  <div key={entry.id} className={entry.parentId ? 'ml-8 border-l-2 border-[#dfa126]/30 pl-4' : ''}>
                    <div className="flex gap-3">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eceef7] text-[10px] font-bold">{entry.initials}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-3">
                          <p className="text-sm font-medium">{entry.author}</p>
                          <p className="text-xs text-[#8b8e9e]">{entry.at}</p>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-[#525570]">{entry.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {!item.comments.length && <p className="py-6 text-center text-sm text-[#7b7f90]">No comments yet.</p>}
              </div>
              {!readOnly && (
                <form className="mt-5" onSubmit={(event) => { event.preventDefault(); onComment(item, comment); setComment(''); }}>
                  <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave a note or use @name to mention someone" />
                  <Button className="mt-2" type="submit">Add comment</Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="history" className="py-5">
              <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[#dfe1e8]">
                {item.history.map((event, index) => (
                  <div key={event.at + index} className="relative pl-7">
                    <span className={'absolute left-0 top-1 size-[15px] rounded-full border-4 border-white ' + (event.flagged ? 'bg-[#b34726]' : 'bg-[#dfa126]')} />
                    <p className="text-sm font-medium capitalize text-[#1f2342]">{event.action}</p>
                    <p className="mt-1 text-xs text-[#7b7f90]">{event.actor} · {event.at}</p>
                    {event.note && <p className={'mt-2 rounded-lg p-3 text-sm ' + (event.flagged ? 'bg-[#fff0e8] text-[#8a341b]' : 'bg-[#f4f1ea] text-[#525570]')}>{event.note}</p>}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="py-5">
              <div className="space-y-3">
                {item.metrics.map((metric) => (
                  <div key={metric.id} className="rounded-xl bg-[#f4f1ea] p-4">
                    <p className="mb-3 text-sm font-medium">{metric.platform} · {metric.recordedOn}</p>
                    <div className="grid grid-cols-4 gap-2">
                      <MiniStat label="Views" value={metric.views} />
                      <MiniStat label="Likes" value={metric.likes} />
                      <MiniStat label="Comments" value={metric.comments} />
                      <MiniStat label="Shares" value={metric.shares} />
                    </div>
                  </div>
                ))}
                {!item.metrics.length && <p className="py-6 text-center text-sm text-[#7b7f90]">No metrics recorded yet.</p>}
              </div>
              {!readOnly && item.stage === 'Post-Upload Metrics' && <MetricsCard item={item} onSave={onMetric} onOpen={() => undefined} />}
            </TabsContent>
          </Tabs>
        </div>

        {!readOnly && (
          <SheetFooter className="sticky bottom-0 border-t bg-white px-5 py-4">
            <div className="w-full space-y-2">
              {item.status === 'Pending approval' ? (
                <>
                  <Textarea value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="Required only when requesting changes" />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy} onClick={() => onApprove(item)}><Check /> Approve & move forward</Button>
                    <Button disabled={busy} variant="outline" onClick={() => onRequestChanges(item, changeNote)}><X /> Request changes</Button>
                  </div>
                </>
              ) : item.lifecycle === 'Active' ? (
                <Button disabled={busy} onClick={() => onSubmit(item)}><FileCheck2 /> Submit {item.stage} for approval</Button>
              ) : null}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
function InfoBlock({ label, people }: { label: string; people: Person[] }) { return <div className="rounded-xl bg-[#f4f1ea] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#7b7f90]">{label}</p><div className="mt-3 space-y-2">{people.map((person) => <div key={person.id} className="flex items-center gap-2"><Avatar person={person} /><span className="text-sm font-medium">{person.name}</span></div>)}{!people.length && <p className="text-sm text-[#7b7f90]">Unassigned</p>}</div></div>; }

function CreateDialog({ open, onOpenChange, people, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; people: Person[]; onCreate: (draft: { title: string; contentType: string; platform: string; dueAt: string; responsibleId: string; accountableIds: string[]; copyOwners: boolean }) => void }) { const [title, setTitle] = useState(''); const [contentType, setContentType] = useState('Instagram Reel'); const [platform, setPlatform] = useState('Instagram'); const [dueAt, setDueAt] = useState(''); const [responsibleId, setResponsibleId] = useState(people[1]?.id ?? people[0]?.id ?? ''); const [accountableIds, setAccountableIds] = useState<string[]>([]); const [copyOwners, setCopyOwners] = useState(true); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !responsibleId || !accountableIds.length) return; void onCreate({ title: title.trim(), contentType, platform, dueAt, responsibleId, accountableIds, copyOwners }); setTitle(''); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="font-display text-xl">Create content item</DialogTitle><DialogDescription>Start in Idea and assign the people who will get it moving.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div><Label className="mb-1.5">Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Five habits of confident wealth advisors" required /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label className="mb-1.5">Content type</Label><NativeSelect className="w-full" value={contentType} onChange={(event) => setContentType(event.target.value)}>{['Instagram Reel','Instagram Post','YouTube Video','YouTube Short','LinkedIn Post','Carousel'].map((value) => <NativeSelectOption key={value}>{value}</NativeSelectOption>)}</NativeSelect></div><div><Label className="mb-1.5">Platform</Label><NativeSelect className="w-full" value={platform} onChange={(event) => setPlatform(event.target.value)}>{['Instagram','YouTube','LinkedIn','Facebook'].map((value) => <NativeSelectOption key={value}>{value}</NativeSelectOption>)}</NativeSelect></div></div><div className="grid gap-3 sm:grid-cols-2"><div><Label className="mb-1.5">Idea due date</Label><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><div><Label className="mb-1.5">Responsible producer</Label><NativeSelect className="w-full" value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}>{people.map((person) => <NativeSelectOption key={person.id} value={person.id}>{person.name}</NativeSelectOption>)}</NativeSelect></div></div><div><Label>Accountable owners</Label><p className="mb-2 mt-1 text-xs text-[#7b7f90]">Choose one or more people. Any accountable owner can approve the transition.</p><div className="grid gap-2 sm:grid-cols-2">{people.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm"><Checkbox checked={accountableIds.includes(person.id)} onCheckedChange={(checked) => setAccountableIds(checked ? [...accountableIds, person.id] : accountableIds.filter((id) => id !== person.id))} />{person.name}</label>)}</div></div><label className="flex items-start gap-3 rounded-xl bg-[#f7efdd] p-3 text-sm"><Checkbox checked={copyOwners} onCheckedChange={(checked) => setCopyOwners(Boolean(checked))} /><span><strong className="block text-[#1f2342]">Plan accountability ahead</strong><span className="text-[#6b5b35]">Copy these owners across all six stages. Admin can revise each stage later.</span></span></label><DialogFooter className="mx-0 mb-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!title.trim() || !accountableIds.length}>Create item</Button></DialogFooter></form></DialogContent></Dialog>;
}

function OverrideDialog({ item, onOpenChange, onConfirm }: { item?: ContentItem; onOpenChange: (open: boolean) => void; onConfirm: (item: ContentItem, reason: string) => void }) { const [reason, setReason] = useState(''); return <Dialog open={Boolean(item)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Advance without second-lens review?</DialogTitle><DialogDescription>This exception will be flagged in the item history and emailed to admins and reviewers.</DialogDescription></DialogHeader><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why does this item need to advance now?" /><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!item || reason.trim().length < 6} onClick={() => item && onConfirm(item, reason.trim())}>Record override & advance</Button></DialogFooter></DialogContent></Dialog>; }

function LoginScreen({ client, notice, setNotice }: { client: SupabaseClient; notice: string; setNotice: (value: string) => void }) { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); const { error } = await client.auth.signInWithPassword({ email, password }); if (error) setNotice(error.message); setBusy(false); }; return <div className="grid min-h-svh place-items-center bg-[#f4f1ea] p-4"><div className="w-full max-w-md"><div className="mb-7 flex items-center justify-center gap-3"><div className="brand-mark !text-[#dfa126]">A</div><div><p className="font-display text-xl font-semibold text-[#1f2342]">AAFM India</p><p className="text-xs text-[#6b7280]">Content Ops Tracker</p></div></div><Card className="bg-white p-2 shadow-xl"><CardHeader><CardTitle className="font-display text-2xl">Sign in</CardTitle><CardDescription>Use the email and password assigned by your administrator.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div><Label className="mb-1.5">Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div><Label className="mb-1.5">Password</Label><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{notice && <p className="text-sm text-[#b34726]">{notice}</p>}<Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></form></CardContent></Card><p className="mt-4 text-center text-xs text-[#7b7f90]">Invite-only access · Asia/Kolkata</p></div></div>; }
function LoadingScreen() { return <div className="grid min-h-svh place-items-center bg-[#f4f1ea]"><div className="text-center"><div className="mx-auto mb-4 size-9 animate-spin rounded-full border-2 border-[#dfa126] border-t-transparent" /><p className="text-sm text-[#525570]">Opening content operations…</p></div></div>; }
function PendingAccess({ email, signOut }: { email: string; signOut: () => void }) { return <div className="grid min-h-svh place-items-center bg-[#f4f1ea] p-4"><Card className="max-w-md bg-white"><CardHeader><CardTitle>Access is waiting for an administrator</CardTitle><CardDescription>{email}</CardDescription></CardHeader><CardContent><p className="text-sm text-[#525570]">Your account is valid, but it needs an active profile and at least one role before the workspace can open.</p><Button variant="outline" className="mt-4" onClick={signOut}>Sign out</Button></CardContent></Card></div>; }
