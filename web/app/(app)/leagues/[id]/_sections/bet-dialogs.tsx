'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { type LeagueDetail } from '@/lib/leagues';
import { wagersApi, type BetType, type WagerSide } from '@/lib/wagers';
import { type Treat } from '@/components/treat-picker';
import { fetchEventOdds, type SportEvent } from '@/lib/ingestor';
import { fetchEspnDetail } from '@/lib/espn';
import { TeamLogo, formatStart } from '@/components/event-card';
import { Combobox } from '@/components/ui/combobox';
import { UserAvatar } from '@/components/user-avatar';
import { ListSearch } from '@/components/list-search';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, Check } from 'lucide-react';
import { STATE, pickBtn, StakeChips, StakeSummary } from './shared';

// Two-step bet flow opened from a Schedule game card. Step 1 configures the bet
// (team, straight-up vs ATS + spread, amount); step 2 checks off which members
// to challenge. Each checked member gets a head-to-head request via propose.
// Shared opponent picker for the bet dialogs: the "Challenge members" list with
// a search box once the league grows past eight members (matching the roster
// convention). Each dialog owns its own selection; this renders + filters only.
function MemberPicker({
  opponents,
  selected,
  onToggle,
}: {
  opponents: LeagueDetail['members'];
  selected: string[];
  onToggle: (uid: string) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? opponents.filter((m) => m.display_name.toLowerCase().includes(needle))
    : opponents;
  const selectedMembers = opponents.filter((m) => selected.includes(m.user_id));
  return (
    <div className="flex flex-col gap-2">
      <Label>
        Challenge members
        {selectedMembers.length > 0 && (
          <span className="font-normal text-muted-foreground"> · {selectedMembers.length} selected</span>
        )}
      </Label>
      {opponents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other members to challenge yet.</p>
      ) : (
        <>
          {/* Selected members stay visible as removable chips, so they aren't lost
              when the list scrolls or a search filters them out. */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedMembers.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => onToggle(m.user_id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 py-1 pl-1 pr-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                  aria-label={`Remove ${m.display_name}`}
                >
                  <UserAvatar userId={m.user_id} name={m.display_name} imageUrl={m.avatar_key} className="size-5" />
                  <span className="max-w-[9rem] truncate">{m.display_name}</span>
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}
          {opponents.length > 8 && (
            <ListSearch value={q} onChange={setQ} placeholder="Search members" />
          )}
          <div className="flex flex-col gap-2">
            {shown.map((m) => {
              const on = selected.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(m.user_id)}
                  className={cn('flex items-center gap-3 px-3 py-2.5 text-left', pickBtn(on))}
                >
                  <UserAvatar
                    userId={m.user_id}
                    name={m.display_name}
                    imageUrl={m.avatar_key}
                    className="size-10 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.display_name}</span>
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                    )}
                    aria-hidden
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                </button>
              );
            })}
            {needle && shown.length === 0 && (
              <p className="text-sm text-muted-foreground">No members match “{q.trim()}”.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ScheduleBetDialog({
  lg, event, me, open, onOpenChange,
}: {
  lg: LeagueDetail;
  event: SportEvent | null;
  me?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'config' | 'members'>('config');
  const [side, setSide] = useState<WagerSide>('away');
  const [betType, setBetType] = useState<BetType>('moneyline');
  const [line, setLine] = useState<number | null>(null);
  const [picked, setPicked] = useState(false); // no cell selected until the user taps one
  const [credits, setCredits] = useState('10');
  const [treat, setTreat] = useState<Treat>('beer');
  const [selected, setSelected] = useState<string[]>([]);

  const oddsQ = useQuery({
    queryKey: ['odds', event?.external_id],
    queryFn: () => fetchEventOdds(event!.sport, event!.league, event!.external_id),
    enabled: open && !!event && !event.odds,
    initialData: event?.odds ?? undefined,
    staleTime: 5 * 60_000,
  });
  const spread = oddsQ.data?.spread;
  const total = oddsQ.data?.overUnder;

  // Reset the flow whenever a new game is opened.
  useEffect(() => {
    if (open) {
      setStep('config'); setSide('away'); setBetType('moneyline'); setLine(null);
      setPicked(false); setCredits('10'); setTreat('beer'); setSelected([]);
    }
  }, [open, event?.external_id]);

  // Tapping a cell fixes the side, market and (for spread/total) the line.
  const pickCell = (s: WagerSide, bt: BetType, ln: number | null) => {
    setSide(s);
    setBetType(bt);
    setLine(bt === 'moneyline' ? null : ln);
    setPicked(true);
  };

  const opponents = lg.members.filter((m) => m.user_id !== me);
  const toggle = (uid: string) =>
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  const propose = useMutation({
    mutationFn: () => wagersApi.propose({
      league_id: lg.id, event_id: event!.external_id, side,
      amount_cents: Math.round(Number(credits) * 100), acceptor_ids: selected, treat,
      bet_type: betType, line: betType === 'moneyline' ? null : line,
    }),
    onSuccess: (r) => {
      if (r.created.length) toast.success(`Bet sent to ${r.created.length} member${r.created.length === 1 ? '' : 's'}`);
      r.errors.forEach((e) => toast.error(e.error));
      qc.invalidateQueries({ queryKey: ['wagers', lg.id] });
      qc.invalidateQueries({ queryKey: ['wagers-all'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!event) return null;
  const teamName = (s: 'home' | 'away') => (s === 'away' ? event.away_team : event.home_team);
  const teamLogo = (s: 'home' | 'away') => (s === 'away' ? event.away_logo : event.home_logo);
  const teamAbbr = (s: 'home' | 'away') => (s === 'away' ? event.away_abbr : event.home_abbr);
  const configReady = picked && credits.trim() !== '' && Number(credits) >= 0;
  const canSubmit = selected.length > 0 && configReady;
  const sign = (n?: number) => (n === undefined || n === null ? undefined : n > 0 ? `+${n}` : `${n}`);
  const isSel = (s: WagerSide, bt: BetType) => picked && side === s && betType === bt;
  // A one-line description of the current pick, for the Next button.
  const pickLabel = () => {
    if (!picked) return 'Next';
    if (betType === 'total') return `Next · ${side === 'over' ? 'Over' : 'Under'} ${line}`;
    const t = teamName(side as 'home' | 'away');
    return `Next · ${t}${betType === 'spread' ? ` ${sign(line ?? undefined)}` : ''}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          {/* Title is screen-reader-only: the team names already show in the
              selection rows below (away on top, home on the bottom), so the
              visible title is redundant. Kept for dialog accessibility. */}
          <DialogTitle className="sr-only">{event.away_team} @ {event.home_team}</DialogTitle>
          <DialogDescription className="sr-only">
            Configure and send a head-to-head bet to league members. Tap the market and side you want to
            back.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 py-2">
          {step === 'config' ? (
            <>
              {/* Sportsbook-style selectable rows: Spread | Total | Winner. Total
                  is over on the away row, under on the home row. */}
              <div>
                <div className="flex items-center gap-1.5 pb-1.5">
                  <span className="min-w-0 flex-1 pl-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Winner</span>
                  {(['Spread', 'Total'] as const).map((h) => (
                    <span key={h} className="w-[3.75rem] shrink-0 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-[4.75rem]">{h}</span>
                  ))}
                </div>
                {(['away', 'home'] as const).map((s) => {
                  const spMain = spread ? sign(s === 'away' ? -spread.line : spread.line) : undefined;
                  // Total: away row = Over, home row = Under.
                  const ouSide: WagerSide = s === 'away' ? 'over' : 'under';
                  const ouMain = total ? `${s === 'away' ? 'O' : 'U'} ${total.total}` : undefined;
                  const cellCls = (on: boolean, disabled?: boolean) =>
                    cn(
                      'flex h-12 w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0 rounded-md border tabular-nums leading-tight transition-colors sm:w-[4.75rem]',
                      disabled ? 'cursor-not-allowed opacity-40 border-input' : on ? STATE.selected : STATE.idle,
                    );
                  return (
                    <div key={s} className="flex items-center gap-1.5 border-b border-border py-2 last:border-0">
                      {/* The team name IS the straight-up (Winner) pick. */}
                      <button
                        type="button"
                        onClick={() => pickCell(s, 'moneyline', null)}
                        className={cn(
                          'flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md border px-2.5 transition-colors',
                          isSel(s, 'moneyline') ? STATE.selected : STATE.idle,
                        )}
                      >
                        <TeamLogo src={teamLogo(s)} name={teamAbbr(s) || teamName(s)} size="sm" />
                        <span className="truncate text-sm font-medium text-foreground">{teamName(s)}</span>
                      </button>
                      {/* Spread */}
                      <button type="button" disabled={!spread} onClick={() => pickCell(s, 'spread', s === 'away' ? -spread!.line : spread!.line)} className={cellCls(isSel(s, 'spread'), !spread)}>
                        {spread ? (
                          <span className="text-xs font-medium text-foreground">{spMain}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </button>
                      {/* Total (O/U) */}
                      <button type="button" disabled={!total} onClick={() => pickCell(ouSide, 'total', total!.total)} className={cellCls(isSel(ouSide, 'total'), !total)}>
                        {total ? (
                          <span className="text-xs font-medium text-foreground">{ouMain}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </button>
                    </div>
                  );
                })}
              </div>

              <StakeChips credits={credits} onPick={setCredits} treat={treat} onTreat={setTreat} />

              <Button className="w-full" disabled={!configReady} onClick={() => setStep('members')}>
                {pickLabel()}
              </Button>
            </>
          ) : (
            <>
              {/* Compact bet summary: pick + stake on one line, matchup + kickoff
                  beneath (indent aligns under the pick, past the logo). */}
              <div>
                <div className="flex items-center gap-2.5">
                  {betType !== 'total' && (
                    <TeamLogo
                      src={teamLogo(side as 'home' | 'away')}
                      name={teamAbbr(side as 'home' | 'away') || teamName(side as 'home' | 'away')}
                      size="sm"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {betType === 'total'
                      ? <>{side === 'over' ? 'Over' : 'Under'} {line}</>
                      : <>{teamName(side as 'home' | 'away')}{betType === 'spread' ? ` ${sign(line ?? undefined)}` : ''}</>}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                    {betType === 'moneyline' ? 'Straight up' : betType === 'spread' ? 'Spread' : 'Total'}
                    {' · '}<StakeSummary cents={Math.round(Number(credits) * 100)} treat={treat} />
                  </span>
                </div>
                <div className={cn('mt-1 truncate text-xs text-muted-foreground', betType !== 'total' && 'pl-[2.625rem]')}>
                  {event.short_name || `${event.away_team} at ${event.home_team}`}
                  {event.start_time ? ` · ${formatStart(event.start_time)}` : ''}
                </div>
              </div>
              <MemberPicker opponents={opponents} selected={selected} onToggle={toggle} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('config')}>Back</Button>
                <Button className="w-full sm:w-auto" disabled={!canSubmit || propose.isPending} onClick={() => propose.mutate()}>
                  {propose.isPending
                    ? 'Sending…'
                    : `Bet${selected.length > 1 ? ` (${selected.length})` : ''}`}
                </Button>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// A field-sport (golf, racing) bet: the tournament has a whole field, so instead
// of backing a fixed side the proposer picks two competitors (theirs + the
// opponent's) and challenges members — the higher finish wins, peer-confirmed
// like any other head-to-head bet.
export function MatchupBetDialog({
  lg, event, me, open, onOpenChange,
}: {
  lg: LeagueDetail;
  event: SportEvent | null;
  me?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'config' | 'members'>('config');
  const [myPick, setMyPick] = useState('');
  const [theirPick, setTheirPick] = useState('');
  const [credits, setCredits] = useState('10');
  const [treat, setTreat] = useState<Treat>('beer');
  const [selected, setSelected] = useState<string[]>([]);

  const fieldQ = useQuery({
    queryKey: ['espn-field', event?.sport, event?.external_id],
    queryFn: () => fetchEspnDetail(event!.sport, event!.external_id),
    enabled: open && !!event,
    staleTime: 5 * 60_000,
  });
  const options = (fieldQ.data?.field ?? [])
    .filter((c) => c.name)
    .map((c) => ({ value: c.name, label: c.name }));

  useEffect(() => {
    if (open) { setStep('config'); setMyPick(''); setTheirPick(''); setCredits('10'); setTreat('beer'); setSelected([]); }
  }, [open, event?.external_id]);

  const opponents = lg.members.filter((m) => m.user_id !== me);
  const toggle = (uid: string) =>
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  const propose = useMutation({
    mutationFn: () => wagersApi.propose({
      league_id: lg.id, event_id: event!.external_id, side: 'home',
      home_team: myPick, away_team: theirPick,
      amount_cents: Math.round(Number(credits) * 100), acceptor_ids: selected, treat,
    }),
    onSuccess: (r) => {
      if (r.created.length) toast.success(`Bet sent to ${r.created.length} member${r.created.length === 1 ? '' : 's'}`);
      r.errors.forEach((e) => toast.error(e.error));
      qc.invalidateQueries({ queryKey: ['wagers', lg.id] });
      qc.invalidateQueries({ queryKey: ['wagers-all'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!event) return null;
  const noun = event.sport === 'racing' ? 'driver' : 'golfer';
  const distinct =
    myPick.trim() !== '' && theirPick.trim() !== '' &&
    myPick.trim().toLowerCase() !== theirPick.trim().toLowerCase();
  const configReady = distinct && credits.trim() !== '' && Number(credits) >= 0;
  const canSubmit = selected.length > 0 && configReady;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a matchup and challenge league members.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 py-2">
          {step === 'config' ? (
            <>
              <p className="text-sm text-muted-foreground">
                Pick your {noun} and your opponent’s — whoever finishes higher wins.
              </p>
              {fieldQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading the field…</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The field for this event isn’t posted yet — check back closer to the start.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Your {noun}</Label>
                    <Combobox
                      options={options.filter((o) => o.value !== theirPick)}
                      value={myPick} onChange={setMyPick}
                      placeholder={`Pick your ${noun}`} ariaLabel={`Your ${noun}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Their {noun}</Label>
                    <Combobox
                      options={options.filter((o) => o.value !== myPick)}
                      value={theirPick} onChange={setTheirPick}
                      placeholder={`Pick their ${noun}`} ariaLabel={`Their ${noun}`}
                    />
                  </div>
                </>
              )}
              <StakeChips credits={credits} onPick={setCredits} treat={treat} onTreat={setTreat} />
              <Button className="w-full self-stretch sm:w-auto sm:self-end" disabled={!configReady} onClick={() => setStep('members')}>Next</Button>
            </>
          ) : (
            <>
              <div className="text-sm text-foreground">
                <span className="font-semibold">{myPick}</span> vs <span className="font-semibold">{theirPick}</span>
                {' · '}<StakeSummary cents={Math.round(Number(credits) * 100)} treat={treat} />
              </div>
              <MemberPicker opponents={opponents} selected={selected} onToggle={toggle} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('config')}>Back</Button>
                <Button className="w-full sm:w-auto" disabled={!canSubmit || propose.isPending} onClick={() => propose.mutate()}>
                  {propose.isPending
                    ? 'Sending…'
                    : `Bet${selected.length > 1 ? ` (${selected.length})` : ''}`}
                </Button>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
