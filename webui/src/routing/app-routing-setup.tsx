import { Route, Routes } from 'react-router';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireGuest } from '@/auth/RequireGuest';
import { FallbackRedirect } from '@/auth/FallbackRedirect';
import { AppLayout } from '@/components/layouts/default';
import { HomePage } from '@/pages/home/page';
import { SportsPage } from '@/pages/sports/page';
import { SportPage } from '@/pages/sport/page';
import { LeaguePage } from '@/pages/league/page';
import { LoginPage } from '@/pages/login/page';
import { SignupPage } from '@/pages/signup/page';
import { FriendsPage } from '@/pages/friends/page';
import { NewLeaguePage } from '@/pages/leagues/new/page';
import { LeagueLayout } from '@/pages/leagues/detail/page';
import { LeagueOverview } from '@/pages/leagues/detail/overview';
import {
  LeaguePlay, LeagueStandings, LeagueSchedule, LeagueActivity, LeagueMembers, LeagueManage,
} from '@/pages/leagues/detail/sections';
import { InvitePage } from '@/pages/invite/page';
import { AddFriendPage } from '@/pages/add-friend/page';
import { BetsLayout, BetsIndex, BetsView } from '@/pages/bets/page';

export function AppRoutingSetup() {
  return (
    <Routes>
      {/* Public entry points (share links — no app shell) */}
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/add-friend" element={<AddFriendPage />} />

      {/* Auth screens — guests only */}
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      {/* Everything below requires authentication */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/leagues/new" element={<NewLeaguePage />} />
          <Route path="/leagues/:id" element={<LeagueLayout />}>
            <Route index element={<LeagueOverview />} />
            <Route path="play" element={<LeaguePlay />} />
            <Route path="standings" element={<LeagueStandings />} />
            <Route path="schedule" element={<LeagueSchedule />} />
            <Route path="members" element={<LeagueMembers />} />
            <Route path="activity" element={<LeagueActivity />} />
            <Route path="manage" element={<LeagueManage />} />
          </Route>
          <Route path="/sports" element={<SportsPage />} />
          <Route path="/sports/:slug" element={<SportPage />} />
          <Route path="/sports/:slug/leagues/:league" element={<LeaguePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/bets" element={<BetsLayout />}>
            <Route index element={<BetsIndex />} />
            <Route path=":filter" element={<BetsView />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  );
}
