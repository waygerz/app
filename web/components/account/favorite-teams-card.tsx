'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Star, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { usersApi, MAX_FAVORITE_TEAMS, type FavoriteTeam, type FavoriteTeamInput } from '@/lib/users';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TeamPicker } from '@/components/team-picker';
import { FavoriteTeamPills, TeamLogo } from '@/components/favorite-teams';

const withPositions = (list: FavoriteTeam[]) => list.map((t, i) => ({ ...t, position: i }));

export function FavoriteTeamsCard() {
  const { user, saveFavorites } = useAuth();
  const [teams, setTeams] = useState<FavoriteTeam[]>(user?.favorite_teams ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Optimistic: apply locally, then persist the whole list via the context
  // saveFavorites (which merges the result back into AuthContext so the list
  // stays fresh across remounts). Don't overwrite from the success response
  // (avoids out-of-order clobbering on rapid edits); on error, resync from the
  // server truth.
  async function persist(next: FavoriteTeam[]) {
    setTeams(next);
    setSaving(true);
    try {
      await saveFavorites(next as FavoriteTeamInput[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save favorite teams');
      try {
        const { profile } = await usersApi.getMyProfile();
        setTeams(profile.favorite_teams);
      } catch {
        /* leave optimistic state if resync also fails */
      }
    } finally {
      setSaving(false);
    }
  }

  function add(t: FavoriteTeamInput) {
    if (teams.length >= MAX_FAVORITE_TEAMS) return;
    if (teams.some((e) => e.sport === t.sport && e.league === t.league && e.external_id === t.external_id)) return;
    persist(withPositions([...teams, { ...t, position: teams.length }]));
  }
  function remove(i: number) {
    persist(withPositions(teams.filter((_, idx) => idx !== i)));
  }
  function makePrimary(i: number) {
    if (i === 0) return;
    persist(withPositions([teams[i], ...teams.filter((_, idx) => idx !== i)]));
  }

  if (!user) return null;
  const full = teams.length >= MAX_FAVORITE_TEAMS;

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Favorite teams</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {teams.length}/{MAX_FAVORITE_TEAMS}
        </span>
      </div>

      {teams.length > 0 ? (
        <>
          <FavoriteTeamPills teams={teams} />
          <ul className="mt-1 flex flex-col border-t border-border">
            {teams.map((t, i) => (
              <li
                key={`${t.sport}-${t.league}-${t.external_id}`}
                className="flex items-center gap-3 border-b border-border py-2.5"
              >
                <TeamLogo team={t} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.league.toUpperCase()}</div>
                </div>
                {i === 0 ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Primary</span>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => makePrimary(i)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground disabled:opacity-50"
                  >
                    <Star className="size-3.5" /> Primary
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => remove(i)}
                  aria-label={`Remove ${t.name}`}
                  className="grid size-11 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add up to {MAX_FAVORITE_TEAMS} teams to show them on your profile.
        </p>
      )}

      <Button
        variant="outline"
        className="mt-1 w-full"
        disabled={saving || full}
        onClick={() => setPickerOpen(true)}
      >
        {full ? 'Maximum reached' : '+ Add team'}
      </Button>

      <TeamPicker open={pickerOpen} onOpenChange={setPickerOpen} existing={teams} onAdd={add} />
    </Card>
  );
}
