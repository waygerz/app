'use client';

import { cn } from '@/lib/utils';
import { type FavoriteTeam } from '@/lib/users';

/** Short label = last word of the team name ("Cardinals"), falling back to the
 *  abbreviation when that word isn't unique in this person's list (NY Rangers +
 *  Texas Rangers → two "Rangers"; Red Sox + White Sox → two "Sox"). */
function shortLabel(t: FavoriteTeam, all: FavoriteTeam[]): string {
  const last = t.name.split(/\s+/).slice(-1)[0] || t.name;
  const collides = all.some(
    (o) => o !== t && (o.name.split(/\s+/).slice(-1)[0] || o.name) === last,
  );
  return collides ? t.abbreviation || last : last;
}

const teamKey = (t: FavoriteTeam) => `${t.sport}-${t.league}-${t.external_id}`;

export function TeamLogo({ team, size }: { team: FavoriteTeam; size: number }) {
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: team.color ?? '#444', fontSize: Math.round(size / 3) }}
    >
      {(team.abbreviation || team.name).slice(0, 3).toUpperCase()}
    </span>
  );
}

/** The one favorite-teams presentation: brand-color pills, primary filled solid,
 *  ordered (first = primary). Reused on the profile card and the profile dialog. */
export function FavoriteTeamPills({ teams }: { teams: FavoriteTeam[] }) {
  if (!teams.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {teams.map((t, i) => {
        const tc = t.color ?? '#6d4bff';
        const primary = i === 0;
        return (
          <span
            key={teamKey(t)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border py-1 pe-2.5 ps-1 text-[13px] font-semibold',
              primary ? 'text-white' : 'text-foreground',
            )}
            style={
              primary
                ? { background: tc, borderColor: tc }
                : {
                    background: `color-mix(in srgb, ${tc} 12%, var(--card))`,
                    borderColor: `color-mix(in srgb, ${tc} 45%, var(--border))`,
                  }
            }
          >
            <TeamLogo team={t} size={18} />
            {shortLabel(t, teams)}
          </span>
        );
      })}
    </div>
  );
}
