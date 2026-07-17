'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leaguesApi, leagueTypeLabel, type LeagueType } from '@/lib/leagues';
import { mediaApi } from '@/lib/media';
import { imageToWebp } from '@/lib/imageToWebp';
import { fetchSports, fetchLeagues } from '@/lib/ingestor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { LeagueAvatar } from '@/components/league-avatar';
import { X } from 'lucide-react';

const TYPES: { value: LeagueType; blurb: string }[] = [
  { value: 'head_to_head', blurb: 'Challenge members 1v1. Winner takes the pot.' },
  { value: 'pickem', blurb: 'No money — pick winners each round and climb the table.' },
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function NewLeaguePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // The WebP-normalized logo, uploaded to S3 on submit (not stored inline).
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [type, setType] = useState<LeagueType>('head_to_head');
  const [periodType, setPeriodType] = useState<'weekly' | 'season'>('season');
  const [year, setYear] = useState('2026');
  const [weekStartsOn, setWeekStartsOn] = useState('tuesday');
  const [startingCredits, setStartingCredits] = useState('1000');

  // Sports picker (real catalog via the ingestor)
  const sportsQ = useQuery({ queryKey: ['sports'], queryFn: fetchSports });
  const [activeSport, setActiveSport] = useState<string>('');
  const leaguesQ = useQuery({
    queryKey: ['sport-leagues', activeSport],
    queryFn: () => fetchLeagues(activeSport),
    enabled: !!activeSport,
  });
  const [chosen, setChosen] = useState<{ id: string; label: string }[]>([]);

  const isMoney = type !== 'pickem';

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await imageToWebp(file, { size: 400, square: true });
      setLogoFile(webp);
      setLogoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(webp);
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function toggleLeague(id: string, label: string) {
    setChosen((cur) =>
      cur.some((c) => c.id === id) ? cur.filter((c) => c.id !== id) : [...cur, { id, label }],
    );
  }

  const create = useMutation({
    mutationFn: async () => {
      const rules: Record<string, unknown> =
        periodType === 'season' ? { season_year: Number(year) } : { week_starts_on: weekStartsOn };
      // Upload the logo to S3 first; store its object key (not the bytes).
      let logoKey: string | null = null;
      if (logoFile) {
        const asset = await mediaApi.upload('league_logo', logoFile);
        logoKey = asset.s3_key;
      }
      return leaguesApi.create({
        name: name.trim(),
        description: description.trim() || null,
        logo_url: logoKey,
        league_type: type,
        period_type: periodType,
        starting_balance_cents: isMoney ? Math.round(Number(startingCredits) * 100) : null,
        sports: chosen.map((c) => ({ sport_league_id: c.id, name: c.label })),
        rules,
      });
    },
    onSuccess: (lg) => {
      toast.success(`Created ${lg.name}`);
      qc.invalidateQueries({ queryKey: ['leagues'] });
      router.push(`/leagues/${lg.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    name.trim() && chosen.length > 0 && (!isMoney || Number(startingCredits) > 0);

  return (
    <div className="container py-8">
      <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-6 text-xl font-bold text-foreground sm:text-2xl">Create a league</h1>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        {/* Type */}
        <div className="flex flex-col gap-2">
          <Label>League type</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  type === t.value ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50'
                }`}
              >
                <div className="text-sm font-semibold text-foreground">{leagueTypeLabel(t.value)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <Label>League name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office NBA" />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <Label>Description (optional)</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this league about? (shown on the invite page)"
            className="min-h-[72px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>

        {/* Logo upload + big preview */}
        <div className="flex flex-col gap-2">
          <Label>League logo (optional)</Label>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <LeagueAvatar name={name || 'New League'} logoUrl={logoPreview} id={name || 'preview'} size={96} />
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  {logoFile ? 'Change image' : 'Upload image'}
                </Button>
                {logoFile && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearLogo}>
                    Remove
                  </Button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Square works best. Leave blank for a generated avatar.
              </span>
            </div>
          </div>
        </div>

        {/* Period */}
        <div className="flex flex-col gap-2">
          <Label>Period</Label>
          <div className="flex flex-wrap gap-2">
            {(['season', 'weekly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodType(p)}
                className={`rounded-lg border px-4 py-2 text-sm capitalize transition-colors ${
                  periodType === p ? 'border-primary bg-primary/5 text-foreground' : 'border-input text-muted-foreground'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {periodType === 'season' ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <Label>Season year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="max-w-[140px]"
              />
            </div>
          ) : type === 'pickem' ? (
            // Pick'em weeks are seeded from the sport's real schedule, so the
            // reset day would be ignored — don't ask for it.
            <p className="mt-1 text-xs text-muted-foreground">
              Weeks follow the sport’s real schedule (Week 1, Week 2, …).
            </p>
          ) : (
            <div className="mt-1 flex flex-col gap-1.5">
              <Label>Week resets on</Label>
              <Combobox
                ariaLabel="Week resets on"
                className="w-full max-w-[200px] capitalize"
                value={weekStartsOn}
                onChange={setWeekStartsOn}
                options={DAYS.map((d) => ({
                  value: d,
                  label: d.charAt(0).toUpperCase() + d.slice(1),
                }))}
              />
              <span className="text-xs text-muted-foreground">
                e.g. NFL weeks run Tuesday → Monday, so pick Tuesday.
              </span>
            </div>
          )}
        </div>

        {/* Starting balance (money only) */}
        {isMoney && (
          <div className="flex flex-col gap-1.5">
            <Label>Starting balance per member (credits)</Label>
            <Input type="number" min={1} value={startingCredits} onChange={(e) => setStartingCredits(e.target.value)} />
            <span className="text-xs text-muted-foreground">
              No personal wallet — this is each member’s only funds in the league.
            </span>
          </div>
        )}

        {/* Sports from the API */}
        <div className="flex flex-col gap-2">
          <Label>Sports</Label>
          {sportsQ.isLoading && <span className="text-sm text-muted-foreground">Loading sports…</span>}
          {sportsQ.isError && (
            <span className="text-sm text-destructive">Couldn’t load sports: {(sportsQ.error as Error).message}</span>
          )}
          {/* sport tabs */}
          <div className="flex flex-wrap gap-2">
            {(sportsQ.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSport(s.slug)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  activeSport === s.slug ? 'border-primary bg-primary/5 text-foreground' : 'border-input text-muted-foreground'
                }`}
              >
                {s.displayName || s.name}
              </button>
            ))}
          </div>
          {/* leagues within the active sport */}
          {activeSport && (
            <div className="mt-1 flex flex-wrap gap-2">
              {leaguesQ.isLoading && <span className="text-sm text-muted-foreground">Loading leagues…</span>}
              {(leaguesQ.data ?? []).map((l) => {
                const label = l.abbreviation || l.name;
                const on = chosen.some((c) => c.id === (l.sport_league_id || l.id));
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLeague(l.sport_league_id || l.id, label)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground'
                    }`}
                  >
                    {l.logo && (
                      <img
                        src={l.logo}
                        alt=""
                        className="size-4 object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {/* chosen chips */}
          {chosen.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {chosen.map((c) => (
                <span key={c.id} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                  {c.label}
                  <button type="button" onClick={() => toggleLeague(c.id, c.label)}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <span className="text-xs text-muted-foreground">The only games members can bet on.</span>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="submit" className="w-full sm:w-auto" disabled={!canSubmit || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create league'}
          </Button>
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => router.push('/')}>Cancel</Button>
        </div>
      </form>
      </div>
    </div>
  );
}
