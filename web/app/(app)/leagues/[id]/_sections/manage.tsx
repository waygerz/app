'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeague } from '../league-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, type LeagueDetail } from '@/lib/leagues';
import { fetchSports, fetchLeagues } from '@/lib/ingestor';
import { Combobox } from '@/components/ui/combobox';
import { Card } from '@/components/ui/card';
import { CenterCard } from '@/components/ui/center-card';
import { LeagueAvatar } from '@/components/league-avatar';
import { mediaApi } from '@/lib/media';
import { imageToWebp } from '@/lib/imageToWebp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AppSheet } from '@/components/ui/app-sheet';
import { formatCredits } from '@/lib/wallet';
import { Settings, X, ImagePlus, Trash2, Lock, Tag, CalendarClock, ChevronRight } from 'lucide-react';

// ===================== MANAGE =====================
// Edit the league's name, description, and which sport-leagues members can bet
// on. Mirrors the Create-League sports picker, seeded with the current values.
function EditLeagueDetails({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const [name, setName] = useState(lg.name);
  const [description, setDescription] = useState(lg.description ?? '');
  const [chosen, setChosen] = useState<{ id: string; label: string }[]>(
    lg.sports.map((s) => ({ id: s.sport_league_id, label: s.name || s.sport_league_id })),
  );

  const sportsQ = useQuery({ queryKey: ['sports'], queryFn: fetchSports });
  const [activeSport, setActiveSport] = useState('');
  const leaguesQ = useQuery({
    queryKey: ['sport-leagues', activeSport],
    queryFn: () => fetchLeagues(activeSport),
    enabled: !!activeSport,
  });
  const toggleLeague = (id: string, label: string) =>
    setChosen((cur) => (cur.some((c) => c.id === id) ? cur.filter((c) => c.id !== id) : [...cur, { id, label }]));

  const save = useMutation({
    mutationFn: () => leaguesApi.update(lg.id, {
      name: name.trim(),
      description: description.trim() || null,
      sports: chosen.map((c) => ({ sport_league_id: c.id, name: c.label })),
    }),
    onSuccess: () => {
      toast.success('League updated');
      qc.invalidateQueries({ queryKey: ['league', lg.id] });
      qc.invalidateQueries({ queryKey: ['leagues'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = name.trim().length > 0 && chosen.length > 0;

  const fileRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const saveLogo = async (logo_url: string | null) => {
    await leaguesApi.update(lg.id, { logo_url });
    qc.invalidateQueries({ queryKey: ['league', lg.id] });
    qc.invalidateQueries({ queryKey: ['leagues'] });
  };
  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    try {
      const webp = await imageToWebp(file, { size: 400, square: true });
      const asset = await mediaApi.upload('league_logo', webp);
      await saveLogo(asset.s3_key);
      toast.success('Logo updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      await saveLogo(null);
      toast.success('Logo removed');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Logo</Label>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
        <div className="flex items-center gap-4">
          <LeagueAvatar name={name} logoUrl={lg.logo_url} id={lg.id} size={128} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" />
              {logoBusy ? 'Uploading…' : lg.logo_url ? 'Change logo' : 'Upload logo'}
            </Button>
            {lg.logo_url && (
              <Button size="sm" variant="outline" disabled={logoBusy} onClick={removeLogo}>
                <Trash2 className="size-4" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this league about? (shown on the invite page)"
          className="min-h-[72px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Available leagues</Label>
        <div className="flex flex-wrap gap-2">
          {(sportsQ.data ?? []).map((s) => (
            <button key={s.id} type="button" onClick={() => setActiveSport(s.slug)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeSport === s.slug ? 'border-primary bg-primary/5 text-foreground' : 'border-input text-muted-foreground'}`}>
              {s.displayName || s.name}
            </button>
          ))}
        </div>
        {activeSport && (
          <div className="mt-1 flex flex-wrap gap-2">
            {leaguesQ.isLoading && <span className="text-sm text-muted-foreground">Loading leagues…</span>}
            {(leaguesQ.data ?? []).map((l) => {
              const label = l.abbreviation || l.name;
              const id = l.sport_league_id || l.id;
              const on = chosen.some((c) => c.id === id);
              return (
                <button key={l.id} type="button" onClick={() => toggleLeague(id, label)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground'}`}>
                  {l.logo && (
                    <img src={l.logo} alt="" className="size-4 object-contain" loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {chosen.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {chosen.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                {c.label}
                <button type="button" onClick={() => toggleLeague(c.id, c.label)}><X className="size-3" /></button>
              </span>
            ))}
          </div>
        )}
        <span className="text-xs text-muted-foreground">The only games members can bet on.</span>
      </div>

      <Button size="lg" className="mt-1 w-full" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save details'}
      </Button>
    </div>
  );
}

// The tab is only shown to the commissioner, but the route isn't guarded — a
// non-commissioner who deep-links here would otherwise see a control panel where
// every action 403s. Bounce them with a clear message. (Enforcement is still on
// the backend; this is UX.)
export function LeagueManage() {
  const lg = useLeague();
  const router = useRouter();
  if (lg.my_role !== 'commissioner') {
    return (
      <CenterCard>
        <Lock className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Only the commissioner can manage this league.</p>
        <Button variant="outline" size="sm" onClick={() => router.push(`/leagues/${lg.id}`)}>
          Back to Feed
        </Button>
      </CenterCard>
    );
  }
  return <LeagueManageInner />;
}

// Canonical form pattern: react-hook-form + zod validation + the shared Form
// primitives, wired to the existing TanStack mutation. Blank min/max = "no
// limit"; zod enforces non-negative numbers and max >= min before submit.
// Curated zones for the picker; the backend accepts any valid IANA name.
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
];

const rulesSchema = z
  .object({
    min: z.string().trim(),
    max: z.string().trim(),
    whoCanPropose: z.enum(['any', 'commissioner']),
    timezone: z.string().min(1),
  })
  .refine((v) => v.min === '' || Number(v.min) >= 0, { path: ['min'], message: 'Enter a number ≥ 0, or leave blank.' })
  .refine((v) => v.max === '' || Number(v.max) >= 0, { path: ['max'], message: 'Enter a number ≥ 0, or leave blank.' })
  .refine((v) => v.min === '' || v.max === '' || Number(v.max) >= Number(v.min), {
    path: ['max'],
    message: 'Max must be at least the minimum.',
  });

type RulesValues = z.infer<typeof rulesSchema>;

function RulesForm({ lg }: { lg: LeagueDetail }) {
  const qc = useQueryClient();
  const isH2H = lg.league_type === 'head_to_head';

  const form = useForm<RulesValues>({
    resolver: zodResolver(rulesSchema),
    defaultValues: {
      min: lg.min_wager_cents ? String(lg.min_wager_cents / 100) : '',
      max: lg.max_wager_cents ? String(lg.max_wager_cents / 100) : '',
      whoCanPropose:
        ((lg.rules || {}) as Record<string, unknown>).who_can_propose === 'commissioner' ? 'commissioner' : 'any',
      timezone: lg.timezone || 'America/New_York',
    },
  });

  const save = useMutation({
    mutationFn: (v: RulesValues) =>
      leaguesApi.update(lg.id, {
        min_wager_cents: v.min ? Math.round(Number(v.min) * 100) : null,
        max_wager_cents: v.max ? Math.round(Number(v.max) * 100) : null,
        rules: { ...(lg.rules || {}), who_can_propose: v.whoCanPropose },
        timezone: v.timezone,
      }),
    onSuccess: (_d, v) => {
      toast.success('Rules saved');
      qc.invalidateQueries({ queryKey: ['league', lg.id] });
      form.reset(v);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5">
            <FormField
              control={form.control}
              name="min"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Min wager ($)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="max"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max wager ($)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} placeholder="none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {isH2H && (
            <FormField
              control={form.control}
              name="whoCanPropose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Who can propose bets</FormLabel>
                  <FormControl>
                    <Combobox
                      className="w-full"
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: 'any', label: 'Any member' },
                        { value: 'commissioner', label: 'Commissioner only' },
                      ]}
                    />
                  </FormControl>
                  <FormDescription>Limit who can start head-to-head bets.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>League timezone</FormLabel>
                <FormControl>
                  <Combobox className="w-full" value={field.value} onChange={field.onChange} options={TIMEZONE_OPTIONS} />
                </FormControl>
                <FormDescription>
                  Weeks roll over at 4:00 AM in this timezone, so late night games finish before a period closes.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save rules'}
          </Button>
        </form>
      </Form>
    </div>
  );
}

function LeagueManageInner() {
  const lg = useLeague();
  const router = useRouter();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['league', lg.id] });
  const onErr = (e: Error) => toast.error(e.message);

  const isMoney = lg.league_type !== 'pickem';
  const showPeriod = lg.status === 'active' && lg.period_type === 'weekly';

  const advance = useMutation({
    mutationFn: () => leaguesApi.advancePeriod(lg.id),
    onSuccess: () => { toast.success('Period advanced'); refresh(); },
    onError: onErr,
  });
  const archive = useMutation({
    mutationFn: () => leaguesApi.archive(lg.id),
    onSuccess: () => { toast.success('League archived'); qc.invalidateQueries({ queryKey: ['leagues'] }); router.push('/'); },
    onError: onErr,
  });

  const [openSheet, setOpenSheet] = useState<'details' | 'rules' | 'period' | null>(null);

  const sportsSummary = lg.sports.length
    ? lg.sports.slice(0, 2).map((s) => s.name || s.sport_league_id).join(', ') + (lg.sports.length > 2 ? ` +${lg.sports.length - 2}` : '')
    : 'No sports yet';
  const whoCanPropose = ((lg.rules || {}) as Record<string, unknown>).who_can_propose === 'commissioner' ? 'Commissioner only' : 'Any member';
  const rulesSummary = isMoney
    ? `${lg.min_wager_cents ? `${formatCredits(lg.min_wager_cents)} min` : 'No min'} · ${lg.max_wager_cents ? `${formatCredits(lg.max_wager_cents)} max` : 'No max'} · ${whoCanPropose}`
    : '';
  const periodSummary = lg.current_period ? `${lg.current_period.label} · ${cap(lg.current_period.status)}` : '—';

  return (
    <div className="flex flex-col gap-7">
      <SettingsGroup label="League">
        <SettingsRow icon={Tag} title="League Details" summary={`${lg.name} · ${sportsSummary}`} onClick={() => setOpenSheet('details')} />
        {isMoney && <SettingsRow icon={Settings} title="Rules & Limits" summary={rulesSummary} onClick={() => setOpenSheet('rules')} />}
      </SettingsGroup>

      {showPeriod && (
        <SettingsGroup label="Season">
          <SettingsRow icon={CalendarClock} title="Weekly Period" summary={periodSummary} onClick={() => setOpenSheet('period')} />
        </SettingsGroup>
      )}

      {/* Danger zone — a red-tinted card outside the settings list, always
          visible (not one more row to tap through to). */}
      <SettingsGroup label="Danger zone" rows={false}>
        <Card className="gap-4 border-destructive/30 bg-destructive/5 p-6">
          <h2 className="text-base font-semibold text-destructive sm:text-lg">Archive league</h2>
          <p className="text-sm text-muted-foreground">Removes it from everyone’s dashboard. Balances and history are preserved.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" variant="outline" className="mt-1 w-full border-destructive/40 text-destructive hover:bg-destructive/10" disabled={archive.isPending}>
                {archive.isPending ? 'Archiving…' : 'Archive league'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive “{lg.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  It disappears from everyone’s dashboard. Balances and history are preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={archive.isPending}
                  onClick={() => archive.mutate()}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Archive league
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </SettingsGroup>

      <AppSheet open={openSheet === 'details'} onOpenChange={(o) => !o && setOpenSheet(null)} title="League Details" tall bodyClassName="pt-1">
        <EditLeagueDetails lg={lg} />
      </AppSheet>

      <AppSheet open={openSheet === 'rules'} onOpenChange={(o) => !o && setOpenSheet(null)} title="Rules & Limits" bodyClassName="pt-1">
        <RulesForm lg={lg} />
      </AppSheet>

      <AppSheet open={openSheet === 'period'} onOpenChange={(o) => !o && setOpenSheet(null)} title="Weekly Period" bodyClassName="pt-1">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">Current: {periodSummary}</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" variant="outline" className="w-full" disabled={advance.isPending}>
                {advance.isPending ? 'Advancing…' : 'Advance period'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Advance to the next period?</AlertDialogTitle>
                <AlertDialogDescription>
                  This closes the current week now and opens the next one. Open bets settle as usual.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={advance.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={advance.isPending} onClick={() => advance.mutate()}>
                  Advance period
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AppSheet>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A labeled group. `rows`: wraps children (SettingsRows) in one bordered,
 * divided container, so a multi-row group reads as a single card, not one
 * border per row. Danger zone passes `rows={false}` — it holds its own Card. */
function SettingsGroup({ label, rows = true, children }: { label: string; rows?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      {rows ? <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">{children}</div> : children}
    </div>
  );
}

/** One row in a settings group: an icon chip, a title + one-line summary, and
 * a chevron — tapping opens that setting's sheet. Generous padding (16px) and
 * a 60px min-height keep it a comfortable tap target. The group container
 * supplies the border/rounding, so the row itself is flush. */
function SettingsRow({
  icon: Icon, title, summary, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}
