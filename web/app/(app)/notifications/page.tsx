'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, BellOff, Swords, Trophy, TrendingDown, UserPlus, UserCheck, Ticket, BarChart3, SmilePlus, Ellipsis, X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CenterCard } from '@/components/ui/center-card';
import { Skeleton } from '@/components/ui/skeleton';
import { AppSheet } from '@/components/ui/app-sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { notificationsApi, type FeedNotification } from '@/lib/notifications';
import { actOnCode, resolveCode, type LeagueCodePreview } from '@/lib/invites';
import { friendsApi } from '@/lib/friends';
import { leaguesApi } from '@/lib/leagues';
import { fetchEvent } from '@/lib/ingestor';
import { wagerPick, wagersApi, viewerSide, type Wager } from '@/lib/wagers';
import { formatCredits } from '@/lib/wallet';
import { UserAvatar } from '@/components/user-avatar';
import { LeagueAvatar } from '@/components/league-avatar';
import { CounterButton } from '@/components/counter-dialog';
import { BetCard } from '@/components/bet-card';
import { LeagueInviteCard } from '@/components/league-invite-card';
import { formatStart } from '@/components/event-card';
import { treatEmoji } from '@/components/treat-picker';
import { useProfileDialog } from '@/components/profile-dialog-context';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';

type ActionKind = 'bet' | 'friend' | 'league';
type Tone = 'default' | 'win' | 'loss';
interface Meta { Icon: LucideIcon; tint: string; tone: Tone; action: ActionKind | null }

// Icon + accent + inline action, driven by the specific event (template_key)
// and falling back to the coarse category for legacy rows (which get no action).
function notifMeta(n: FeedNotification): Meta {
  const bet = 'text-primary bg-primary/15';
  const friend = 'text-sky-500 bg-sky-500/15';
  const invite = 'text-fuchsia-500 bg-fuchsia-500/15';
  const digest = 'text-amber-500 bg-amber-500/15';
  switch (n.template_key) {
    case 'wager_proposed': return { Icon: Swords, tint: bet, tone: 'default', action: 'bet' };
    // A counter is a "your turn" state, same as a fresh proposal — the recipient
    // can Accept/Counter/Reject right from the notification.
    case 'wager_countered': return { Icon: Swords, tint: bet, tone: 'default', action: 'bet' };
    case 'wager_accepted': return { Icon: Swords, tint: bet, tone: 'default', action: null };
    case 'wager_settled_win': return { Icon: Trophy, tint: 'text-brand bg-brand/15', tone: 'win', action: null };
    case 'wager_settled_loss': return { Icon: TrendingDown, tint: 'text-destructive bg-destructive/15', tone: 'loss', action: null };
    case 'friend_request': return { Icon: UserPlus, tint: friend, tone: 'default', action: 'friend' };
    case 'friend_accepted': return { Icon: UserCheck, tint: friend, tone: 'default', action: null };
    case 'league_invite': return { Icon: Ticket, tint: invite, tone: 'default', action: 'league' };
    case 'pickem_week': return { Icon: Trophy, tint: digest, tone: 'default', action: null };
    case 'weekly_digest': return { Icon: BarChart3, tint: digest, tone: 'default', action: null };
  }
  switch (n.category) {
    case 'wager_alert': return { Icon: Swords, tint: bet, tone: 'default', action: null };
    case 'friend_request': return { Icon: UserPlus, tint: friend, tone: 'default', action: null };
    case 'league_invite': return { Icon: Ticket, tint: invite, tone: 'default', action: null };
    case 'league_alert': return { Icon: Trophy, tint: digest, tone: 'default', action: null };
    case 'reaction': return { Icon: SmilePlus, tint: 'text-rose-500 bg-rose-500/15', tone: 'default', action: null };
    case 'weekly_digest': return { Icon: BarChart3, tint: digest, tone: 'default', action: null };
  }
  return { Icon: Bell, tint: 'text-muted-foreground bg-muted', tone: 'default', action: null };
}

// A bet-challenge notification whose wager has moved past "open" should show
// the REAL outcome — not a blanket "No longer available", which reads as expired
// even when the viewer accepted it (e.g. from the SMS link). Maps the contests
// wager status to a feed label; `ok` outcomes get the resolved-check styling.
const BET_RESOLVED: Record<string, { label: string; ok: boolean }> = {
  accepted: { label: 'Accepted', ok: true },
  completed: { label: 'Accepted', ok: true }, // accepted; event over, awaiting settlement
  settled: { label: 'Settled', ok: true },
  declined: { label: 'Declined', ok: false },
  cancelled: { label: 'Cancelled', ok: false },
  refunded: { label: 'No longer available', ok: false },
};
function betResolved(status: string | undefined) {
  if (!status || status === 'open') return null;
  return BET_RESOLVED[status] ?? { label: 'No longer available', ok: false };
}

// Is this a bet notification (challenge / counter / accept / settle)?
function isBetNotif(n: FeedNotification): boolean {
  return (n.template_key ?? '').startsWith('wager_') || n.category === 'wager_alert';
}

// The bet's /c code — from the deep_link when it points there, otherwise parsed
// out of the notification body (every bet notification includes its full
// https://…/c/<code> link). Lets even older rows, whose stored deep_link
// predates the /c fix, open the bet view and drive inline Accept/Counter/Reject.
function betCode(n: FeedNotification): string | null {
  const m =
    (n.deep_link ?? '').match(/\/c\/([A-Za-z0-9]+)/) ??
    (n.body ?? '').match(/\/c\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// A league invite's /c code (its deep_link points there since the invite
// preview moved to the code card); null on older rows that link to /leagues.
function leagueCode(n: FeedNotification): string | null {
  const m = (n.deep_link ?? '').match(/\/c\/(L[A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// Compact relative time: "now", "5m", "3h", "2d", then a date.
function shortAgo(iso: string | null) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type Filter = 'all' | 'bets' | 'leagues' | 'friends' | 'social';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'bets', label: 'Bets' },
  { value: 'leagues', label: 'Leagues' },
  { value: 'friends', label: 'Friends' },
  { value: 'social', label: 'Social' },
];

// Which filter chip a notification falls under (null = only under All).
function filterOf(n: FeedNotification): Filter | null {
  const k = n.template_key ?? '';
  if (isBetNotif(n)) return 'bets';
  if (['league_invite', 'league_alert', 'pickem_week', 'weekly_digest'].includes(k)) return 'leagues';
  if (['league_invite', 'league_alert', 'weekly_digest'].includes(n.category)) return 'leagues';
  if (k.startsWith('friend_') || n.category === 'friend_request') return 'friends';
  if (n.category === 'reaction' || k.includes('comment')) return 'social';
  return null;
}

function dayBucket(iso: string): 'Today' | 'This week' | 'Earlier' {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return now.getTime() - d.getTime() < 7 * 86_400_000 ? 'This week' : 'Earlier';
}

// A list row: one notification, or several reactions to the same post on the
// same day folded into one ("Riley +4 reacted to your post").
interface Entry { n: FeedNotification; ids: string[]; count: number }

function foldReactions(list: FeedNotification[]): Entry[] {
  const out: Entry[] = [];
  const byKey = new Map<string, Entry>();
  for (const n of list) {
    const key = n.category === 'reaction' && n.ref_id ? `${n.ref_id}|${new Date(n.created_at).toDateString()}` : null;
    const hit = key ? byKey.get(key) : undefined;
    if (hit) {
      hit.ids.push(n.id);
      hit.count += 1;
      continue;
    }
    const e = { n, ids: [n.id], count: 1 };
    out.push(e);
    if (key) byKey.set(key, e);
  }
  return out;
}

function reactionSummary(n: FeedNotification, count: number): string {
  return `${n.actor_name ?? 'Someone'} +${count - 1} reacted${/post/i.test(n.title) ? ' to your post' : ''}`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const me = user?.id ?? '';
  const qc = useQueryClient();
  const router = useRouter();
  // Notifications resolved inline this session → show a terse "done" line.
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  // The "needs you" row whose details sheet is open.
  const [sheet, setSheet] = useState<FeedNotification | null>(null);
  // The counter editor, opened from a row's ⋯ menu or the bet sheet.
  const [counter, setCounter] = useState<{ n: FeedNotification; w: Wager; seq: number } | null>(null);

  const feedQ = useQuery({
    queryKey: ['notifications-feed'],
    queryFn: () => notificationsApi.list(50),
    enabled: !!user,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const items = feedQ.data?.notifications ?? [];
  const unread = feedQ.data?.unread ?? 0;

  // A bet challenge expires when its game kicks off (the scheduler voids the open
  // offer). The notification row can't see that on its own, so cross-reference
  // the viewer's own wagers — `my_wagers` includes the offers addressed to them,
  // with live status — and show "no longer available" instead of a dead
  // Accept/Reject that only errors when tapped.
  const hasBetActions = items.some((n) => notifMeta(n).action === 'bet' && !n.read);
  const wagersQ = useQuery({
    queryKey: ['wagers-all'],
    queryFn: () => wagersApi.all(),
    enabled: !!user && hasBetActions,
    staleTime: 15_000,
  });
  const wagerStatusById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of wagersQ.data ?? []) m.set(w.id, w.status);
    return m;
  }, [wagersQ.data]);
  // Full wager objects, so a bet notification can open the same Counter dialog
  // used on the bets page / share link (needs the sides, line, stake, treat).
  const wagerById = useMemo(() => {
    const m = new Map<string, Wager>();
    for (const w of wagersQ.data ?? []) m.set(w.id, w);
    return m;
  }, [wagersQ.data]);

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-feed'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  // Inline Accept / Reject / Join — act without leaving the page.
  const act = useMutation({
    mutationFn: async ({ n, yes }: { n: FeedNotification; yes: boolean }) => {
      const meta = notifMeta(n);
      if (meta.action === 'bet') {
        const code = betCode(n);
        if (!code || !code.startsWith('B')) throw new Error('This bet link is invalid');
        await actOnCode(code, yes ? 'accept' : 'decline');
        return yes ? 'Accepted' : 'Rejected';
      }
      if (meta.action === 'friend') {
        const reqs = await friendsApi.requests();
        const who = String(n.actor_id ?? n.ref_id ?? '');
        const r = reqs.incoming.find((x) => String(x.user_id) === who);
        if (!r) throw new Error('This request is no longer pending');
        if (yes) await friendsApi.accept(r.id);
        else await friendsApi.decline(r.id);
        return yes ? 'Added' : 'Declined';
      }
      if (meta.action === 'league') {
        if (yes) await leaguesApi.acceptInvite(String(n.ref_id));
        return yes ? 'Joined' : 'Dismissed';
      }
      return 'Done';
    },
    onSuccess: (label, { n }) => {
      setResolved((r) => ({ ...r, [n.id]: label }));
      if (!n.read) markRead.mutate([n.id]);
      for (const key of [
        ['wagers-all'], ['wagers'], ['friends'], ['friend-requests'], ['leagues'], ['league-invites'],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e: Error, { n }) => {
      // Race: the offer/invite lapsed between render and tap. Reflect it as a
      // resolved "no longer available" line rather than a jarring red error.
      if (/no longer|already started|expired/i.test(e.message)) {
        setResolved((r) => ({ ...r, [n.id]: 'No longer available' }));
        if (!n.read) markRead.mutate([n.id]);
        return;
      }
      toast.error(e.message);
    },
  });

  // Opening an item marks it read and jumps to where the live action lives.
  // Bet notifications always open the /c bet view (Accept/Counter/Reject + the
  // game), derived from the code even when the stored deep_link is older.
  const openItem = (n: FeedNotification) => {
    if (!n.read) markRead.mutate([n.id]);
    // Engagement tracking (goal A): a genuine open, logged fire-and-forget so it
    // never delays navigation. Distinct from mark-read (which also fires on
    // mark-all-read + inline resolves).
    void notificationsApi.recordOpen(n.id).catch(() => {});
    const code = isBetNotif(n) ? betCode(n) : null;
    const dest = code ? `/c/${code}` : n.deep_link;
    if (dest) router.push(dest);
  };

  if (!user) return null;

  // ---- Shape the list -------------------------------------------------------
  // "Needs you": offers waiting on an answer (same rule as the old inline
  // actions). Everything else is grouped by day, with repeated reactions to one
  // post on one day folded into a single row.
  const isNeed = (n: FeedNotification) => {
    const meta = notifMeta(n);
    if (!meta.action || n.read || resolved[n.id]) return false;
    return meta.action !== 'bet' || !betResolved(wagerStatusById.get(n.ref_id ?? ''));
  };
  const inFilter = (n: FeedNotification) => filter === 'all' || filterOf(n) === filter;
  const needs = items.filter((n) => isNeed(n) && inFilter(n));
  const rest = foldReactions(items.filter((n) => !isNeed(n) && inFilter(n)));
  const sections = (['Today', 'This week', 'Earlier'] as const)
    .map((label) => ({ label, rows: rest.filter((e) => dayBucket(e.n.created_at) === label) }))
    .filter((s) => s.rows.length > 0);
  const unreadIn = (f: Filter) => items.filter((n) => !n.read && (f === 'all' || filterOf(n) === f)).length;

  const openEntry = (e: Entry) => {
    const unreadIds = e.ids.filter((id) => items.find((x) => x.id === id && !x.read));
    if (unreadIds.length > 1) markRead.mutate(unreadIds);
    openItem(e.n);
  };

  // The left side of a "needs you" row opens its details sheet; a league
  // invite without a /c code (older rows) just opens like any other row.
  const openDetails = (n: FeedNotification) => {
    const meta = notifMeta(n);
    if (meta.action === 'bet' && !wagerById.get(n.ref_id ?? '')) return openItem(n);
    if (meta.action === 'league' && !leagueCode(n)) return openItem(n);
    void notificationsApi.recordOpen(n.id).catch(() => {});
    setSheet(n);
  };

  const sheetMeta = sheet ? notifMeta(sheet) : null;
  const sheetWager = sheet && sheetMeta?.action === 'bet' ? wagerById.get(sheet.ref_id ?? '') ?? null : null;
  const answer = (n: FeedNotification, yes: boolean) => {
    act.mutate({ n, yes });
    setSheet(null);
  };
  const startCounter = (n: FeedNotification, w: Wager) => {
    setSheet(null);
    setCounter({ n, w, seq: Date.now() });
  };

  return (
    <div className="container py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        {/* Filters — chips, with unread counts. */}
        <div className="-mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Filter notifications">
          {FILTERS.map((f) => {
            const on = filter === f.value;
            const count = unreadIn(f.value);
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {f.label}
                {count > 0 && f.value !== 'all' && (
                  <span className={cn('rounded-full px-1.5 text-[10px] leading-4 tabular-nums', on ? 'bg-primary-foreground/20' : 'bg-primary text-primary-foreground')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {unread > 0 && (
        <div className="-mt-1 mb-2 flex justify-end">
          <Button variant="ghost" size="sm" className="h-8 min-h-8 text-xs" disabled={markRead.isPending} onClick={() => markRead.mutate(undefined)}>
            Mark all read
          </Button>
        </div>
      )}

      {feedQ.isLoading ? (
        <div className="-mx-4 flex flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-6" />
            </div>
          ))}
        </div>
      ) : needs.length === 0 && sections.length === 0 ? (
        <CenterCard>
          <BellOff className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filter === 'all' ? 'You’re all caught up.' : 'Nothing here yet.'}
          </p>
        </CenterCard>
      ) : (
        <div className="-mx-4 flex flex-col">
          {needs.length > 0 && (
            <section aria-labelledby="needs-h">
              <SectionLabel id="needs-h">Needs you · {needs.length}</SectionLabel>
              {needs.map((n) => {
                const meta = notifMeta(n);
                const w = meta.action === 'bet' ? wagerById.get(n.ref_id ?? '') : undefined;
                const busy = act.isPending && act.variables?.n.id === n.id;
                return (
                  <div key={n.id} className="flex items-center gap-2 bg-primary/[0.06] px-4 py-2">
                    <button
                      type="button"
                      onClick={() => openDetails(n)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <NotifAvatar n={n} meta={meta} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {n.title} <span className="font-normal text-muted-foreground">· {shortAgo(n.created_at)}</span>
                        </span>
                        {w && (
                          <span className="block truncate text-xs tabular-nums text-muted-foreground">
                            {wagerPick(w, viewerSide(w, me))} · {w.amount_cents ? formatCredits(w.amount_cents) : treatEmoji(w.treat)} · {formatStart(w.start_time)}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" className="h-9 min-h-9" disabled={busy} onClick={() => act.mutate({ n, yes: true })}>
                        {meta.action === 'league' ? 'Join' : 'Accept'}
                      </Button>
                      {meta.action === 'bet' ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="size-9 min-h-9 px-0" disabled={busy} aria-label="More: Counter or Reject">
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {w && <DropdownMenuItem onClick={() => startCounter(n, w)}>Counter</DropdownMenuItem>}
                            <DropdownMenuItem className="text-destructive" onClick={() => act.mutate({ n, yes: false })}>
                              Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="size-9 min-h-9 px-0"
                          disabled={busy}
                          aria-label={meta.action === 'league' ? 'Dismiss' : 'Decline'}
                          onClick={() => act.mutate({ n, yes: false })}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {sections.map((s) => (
            <section key={s.label} aria-label={s.label}>
              <SectionLabel>{s.label}</SectionLabel>
              {s.rows.map((e) => {
                const n = e.n;
                const meta = notifMeta(n);
                const unreadRow = e.ids.some((id) => items.find((x) => x.id === id && !x.read));
                const done = resolved[n.id];
                const betOutcome = meta.action === 'bet' ? betResolved(wagerStatusById.get(n.ref_id ?? '')) : null;
                const note = done ?? betOutcome?.label;
                // An expired bet challenge has no live destination — no link.
                const clickable = !betOutcome || betOutcome.ok;
                const text = e.count > 1 ? reactionSummary(n, e.count) : n.title;
                const body = (
                  <>
                    <NotifAvatar n={n} meta={meta} />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        unreadRow ? 'font-medium text-foreground' : 'text-foreground/90',
                        meta.tone === 'win' && 'text-brand',
                        meta.tone === 'loss' && 'text-destructive',
                      )}
                    >
                      {text}
                      {note && <span className="font-normal text-muted-foreground"> · {note}</span>}
                      <span className="font-normal text-muted-foreground"> · {shortAgo(n.created_at)}</span>
                    </span>
                    {unreadRow && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </>
                );
                const cls = cn('flex w-full items-center gap-2.5 px-4 py-2 text-left', unreadRow && 'bg-primary/[0.06]');
                return clickable ? (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openEntry(e)}
                    className={cn(cls, 'transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary')}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={n.id} className={cls}>{body}</div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {/* Details for a "needs you" row: the bet card, the league card or the
          person, with the same answers as the row. */}
      <AppSheet
        open={!!sheet}
        onOpenChange={(o) => !o && setSheet(null)}
        hideHeader={sheetMeta?.action === 'bet'}
        title={sheetMeta?.action === 'league' ? 'League invite' : sheetMeta?.action === 'friend' ? 'Friend request' : 'Bet'}
        description={sheet && sheetMeta?.action !== 'bet' ? sheet.title : undefined}
        bodyClassName={sheetMeta?.action === 'bet' ? 'pt-2' : undefined}
        footer={
          sheet &&
          (sheetMeta?.action === 'bet' ? (
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => answer(sheet, true)}>Accept</Button>
              <Button variant="outline" disabled={!sheetWager} onClick={() => sheetWager && startCounter(sheet, sheetWager)}>
                Counter
              </Button>
              <Button variant="outline" onClick={() => answer(sheet, false)}>Reject</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => answer(sheet, true)}>{sheetMeta?.action === 'league' ? 'Join league' : 'Accept'}</Button>
              <Button variant="outline" onClick={() => answer(sheet, false)}>
                {sheetMeta?.action === 'league' ? 'Dismiss' : 'Decline'}
              </Button>
            </div>
          ))
        }
      >
        {sheet && sheetMeta?.action === 'bet' && sheetWager && <BetSheetBody wager={sheetWager} me={me} />}
        {sheet && sheetMeta?.action === 'league' && <LeagueSheetBody code={leagueCode(sheet)} />}
        {sheet && sheetMeta?.action === 'friend' && <FriendSheetBody n={sheet} />}
      </AppSheet>

      {counter && (
        <CounterButton
          key={counter.seq}
          wager={counter.w}
          me={me}
          open
          onOpenChange={(o) => !o && setCounter(null)}
          onDone={() => {
            setResolved((r) => ({ ...r, [counter.n.id]: 'Countered' }));
            if (!counter.n.read) markRead.mutate([counter.n.id]);
            qc.invalidateQueries({ queryKey: ['wagers-all'] });
            qc.invalidateQueries({ queryKey: ['wagers'] });
          }}
        />
      )}
    </div>
  );
}

function SectionLabel({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

// Who it's from (with a small category badge), else a category icon chip.
function NotifAvatar({ n, meta }: { n: FeedNotification; meta: Meta }) {
  const Icon = meta.Icon;
  if (!n.actor_id) {
    return (
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', meta.tint)}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <span className="relative shrink-0">
      {n.ref_type === 'league' ? (
        <LeagueAvatar name={n.actor_name ?? 'League'} logoUrl={n.actor_avatar_key} id={n.actor_id} size={32} />
      ) : (
        <UserAvatar userId={n.actor_id} name={n.actor_name ?? 'Someone'} imageUrl={n.actor_avatar_key} className="size-8" clickable={false} />
      )}
      <span className={cn('absolute -bottom-1 -end-1 flex size-4 items-center justify-center rounded-full ring-2 ring-background', meta.tint)}>
        <Icon className="size-2.5" />
      </span>
    </span>
  );
}

// The bet behind a challenge, as the shared bet card (live score while on).
function BetSheetBody({ wager, me }: { wager: Wager; me: string }) {
  const evQ = useQuery({
    queryKey: ['c-bet-event', wager.event_id],
    queryFn: () => fetchEvent(wager.event_id),
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'live' ? 30_000 : false),
  });
  return <BetCard wager={wager} event={evQ.data ?? null} me={me} closeInset />;
}

// The league behind an invite, from its /c code (same card as the link).
function LeagueSheetBody({ code }: { code: string | null }) {
  const q = useQuery({
    queryKey: ['invite-code', code ?? ''],
    queryFn: () => resolveCode(code!),
    enabled: !!code,
    retry: false,
  });
  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  const lg = q.data?.type === 'league' ? (q.data.preview as LeagueCodePreview | null) : null;
  if (!lg) return <p className="py-6 text-center text-sm text-muted-foreground">This invite is no longer available.</p>;
  return <LeagueInviteCard league={lg} />;
}

// The person asking to be friends.
function FriendSheetBody({ n }: { n: FeedNotification }) {
  const profile = useProfileDialog();
  const name = n.actor_name ?? 'Someone';
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      {n.actor_id && (
        <UserAvatar userId={n.actor_id} name={name} imageUrl={n.actor_avatar_key} className="size-20" fallbackClassName="text-xl" clickable={false} />
      )}
      <div>
        <p className="text-lg font-bold text-foreground">{name}</p>
        <p className="text-sm text-muted-foreground">wants to be friends</p>
      </div>
      {profile && n.actor_id && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => profile.openProfile({ userId: String(n.actor_id), name, avatarKey: n.actor_avatar_key })}
        >
          View profile
        </Button>
      )}
    </div>
  );
}
