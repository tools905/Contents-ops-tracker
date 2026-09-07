import type { ContentItem, Person } from './content-types';

export const demoPeople: Person[] = [
  { id: 'p1', name: 'Aditi Mehra', email: 'aditi@aafmindia.test', initials: 'AM', roles: ['Owner'], isActive: true },
  { id: 'p2', name: 'Nisha Verma', email: 'nisha@aafmindia.test', initials: 'NV', roles: ['Content Producer'] },
  { id: 'p3', name: 'Rohit Saini', email: 'rohit@aafmindia.test', initials: 'RS', roles: ['Content Producer'] },
  { id: 'p4', name: 'Aman Khanna', email: 'aman@aafmindia.test', initials: 'AK', roles: ['Content Producer'] },
  { id: 'p5', name: 'Meera Shah', email: 'meera@aafmindia.test', initials: 'MS', roles: ['Content Producer'] },
  { id: 'p6', name: 'BuildableLabs', email: 'review@buildablelabs.test', initials: 'BL', roles: ['Content Approver'] },
  { id: 'p7', name: 'Kabir Rao', email: 'kabir@aafmindia.test', initials: 'KR', roles: ['Monitoring'] },
  { id: 'p8', name: 'Regional Head', email: 'stakeholder@aafmindia.test', initials: 'RH', roles: ['Read-only Stakeholder'] },
  { id: 'p9', name: 'Operations Director', email: 'operations@aafmindia.test', initials: 'OD', roles: ['Owner'], isActive: true },
  { id: 'p10', name: 'Content Lead', email: 'lead@aafmindia.test', initials: 'CL', roles: ['Admin'], isActive: true },
];

const [owner, nisha, rohit, aman, meera, , monitor] = demoPeople;

export const demoItems: ContentItem[] = [
  {
    id: 'c1', title: 'CWM: Career paths in private banking', contentType: 'Instagram Reel', platform: 'Instagram', stage: 'Script', status: 'Pending approval', dueAt: '2026-09-07T17:30:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [nisha], accountable: [nisha, owner], secondLens: 'Awaiting review',
    links: [{ label: 'Working script', kind: 'Script', url: 'https://docs.google.com/' }],
    history: [
      { action: 'Item created', actor: 'Nisha Verma', at: '5 Sep · 10:20 AM' },
      { action: 'Idea approved → Script', actor: 'Aditi Mehra', at: '5 Sep · 4:45 PM' },
      { action: 'Script submitted for approval', actor: 'Nisha Verma', at: 'Today · 11:10 AM' },
    ],
    comments: [
      { id: 'm1', author: 'BuildableLabs', initials: 'BL', body: 'The hook is strong. Could we make the first five seconds more specific to relationship managers?', at: '12:10 PM' },
      { id: 'm2', author: 'Nisha Verma', initials: 'NV', body: '@BuildableLabs Updated the opening to call out RMs directly. Please check the new first paragraph.', at: '1:02 PM', parentId: 'm1' },
    ], metrics: [],
  },
  {
    id: 'c2', title: 'Estate planning myths: carousel', contentType: 'LinkedIn Post', platform: 'LinkedIn', stage: 'Production', status: 'Pending approval', dueAt: '2026-09-08T11:00:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [rohit], accountable: [rohit], secondLens: 'Awaiting review',
    links: [{ label: 'Approved script', kind: 'Script', url: 'https://docs.google.com/' }, { label: 'Design draft', kind: 'Edited video', url: 'https://drive.google.com/' }],
    history: [{ action: 'Script approved → Shoot', actor: 'Aditi Mehra', at: '3 Sep · 3:12 PM' }, { action: 'Shoot approved → Production', actor: 'Aman Khanna', at: '5 Sep · 7:40 PM' }, { action: 'Production submitted for approval', actor: 'Rohit Saini', at: 'Today · 9:25 AM' }],
    comments: [{ id: 'm3', author: 'Rohit Saini', initials: 'RS', body: 'Slides 4–6 have been rebuilt with the legal disclaimer intact.', at: '9:24 AM' }], metrics: [],
  },
  {
    id: 'c3', title: 'Inside the Wealth & Alternates Convention', contentType: 'YouTube Video', platform: 'YouTube', stage: 'Shoot', status: 'In progress', dueAt: '2026-09-08T14:00:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [aman, meera], accountable: [aman, meera], secondLens: 'Not needed',
    links: [{ label: 'Shoot brief', kind: 'Brief', url: 'https://docs.google.com/' }], history: [{ action: 'Item created', actor: 'Aman Khanna', at: '1 Sep · 2:20 PM' }, { action: 'Script approved → Shoot', actor: 'Nisha Verma', at: '6 Sep · 5:42 PM' }], comments: [], metrics: [],
  },
  {
    id: 'c4', title: 'What makes the CTEP designation different?', contentType: 'YouTube Short', platform: 'YouTube', stage: 'Production', status: 'Changes requested', dueAt: '2026-09-06T18:00:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [rohit], accountable: [rohit, owner], secondLens: 'Changes requested',
    links: [{ label: 'Raw interview', kind: 'Raw footage', url: 'https://dropbox.com/' }, { label: 'Edit v2', kind: 'Edited video', url: 'https://drive.google.com/' }], history: [{ action: 'Production changes requested', actor: 'BuildableLabs', at: 'Yesterday · 4:08 PM', note: 'Tighten the transition at 00:18 and bring the designation name on-screen sooner.' }], comments: [{ id: 'm4', author: 'BuildableLabs', initials: 'BL', body: 'Please bring the CTEP title card forward to the first three seconds.', at: 'Yesterday · 4:08 PM' }], metrics: [],
  },
  {
    id: 'c5', title: 'Financial literacy week: daily tips', contentType: 'Instagram Post', platform: 'Instagram', stage: 'Upload', status: 'In progress', dueAt: '2026-09-07T16:00:00+05:30', reminderHours: 6, lifecycle: 'Active', responsible: [nisha], accountable: [nisha], secondLens: 'Not needed',
    links: [{ label: 'Final artwork', kind: 'Edited video', url: 'https://drive.google.com/' }], history: [{ action: 'Production approved → Upload', actor: 'Rohit Saini', at: 'Today · 10:02 AM' }], comments: [], metrics: [],
  },
  {
    id: 'c6', title: 'CWM alumni spotlight: Saurabh Parekh', contentType: 'Instagram Reel', platform: 'Instagram', stage: 'Post-Upload Metrics', status: 'In progress', dueAt: '2026-09-07T19:00:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [monitor], accountable: [monitor], secondLens: 'Not needed', publishedAt: '2026-09-07T09:12:00+05:30',
    links: [{ label: 'Published reel', kind: 'Published post', url: 'https://instagram.com/aafm.india/' }], history: [{ action: 'Upload approved → Post-Upload Metrics', actor: 'Nisha Verma', at: 'Today · 9:12 AM' }], comments: [], metrics: [],
  },
  {
    id: 'c7', title: 'Three portfolio mistakes new advisors make', contentType: 'LinkedIn Post', platform: 'LinkedIn', stage: 'Post-Upload Metrics', status: 'In progress', dueAt: '2026-09-08T09:00:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [monitor], accountable: [monitor], secondLens: 'Overridden', publishedAt: '2026-09-06T08:45:00+05:30',
    links: [{ label: 'Published post', kind: 'Published post', url: 'https://linkedin.com/company/aafmindia/' }], history: [{ action: 'Advanced without second-lens review', actor: 'Rohit Saini', at: '5 Sep · 8:14 PM', note: 'Time-sensitive market reference; approved directly after internal fact-check.', flagged: true }, { action: 'Upload approved → Post-Upload Metrics', actor: 'Nisha Verma', at: 'Yesterday · 8:45 AM' }], comments: [],
    metrics: [{ id: 'me1', platform: 'LinkedIn', views: 8240, likes: 311, comments: 26, shares: 49, recordedOn: '2026-09-06' }],
  },
  {
    id: 'c8', title: 'Ask an advisor: choosing a finance credential', contentType: 'YouTube Video', platform: 'YouTube', stage: 'Idea', status: 'In progress', dueAt: '2026-09-10T17:00:00+05:30', reminderHours: 24, lifecycle: 'Active', responsible: [meera], accountable: [owner], secondLens: 'Not needed', links: [], history: [{ action: 'Item created', actor: 'Meera Shah', at: 'Today · 1:35 PM' }], comments: [], metrics: [],
  },
];
