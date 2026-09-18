/// Plain data models mirroring the API JSON. Kept intentionally small — grow
/// these as screens need more fields. JSON keys match the backend snake_case;
/// parse defensively (null-safe with defaults) since some endpoints enrich rows.
library;

class User {
  User({
    required this.id,
    required this.phone,
    required this.displayName,
    this.avatarKey,
    this.tosAcceptedAt,
    this.favoriteTeams = const [],
  });

  final String id;
  final String phone;
  final String displayName;
  final String? avatarKey;

  /// When the user accepted the Terms/Privacy at signup (null for accounts
  /// created before consent was recorded).
  final DateTime? tosAcceptedAt;

  /// From the users (profile) service; merged in by AuthController.
  final List<FavoriteTeam> favoriteTeams;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] as String,
        phone: (j['phone'] ?? '') as String,
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
        tosAcceptedAt: DateTime.tryParse((j['tos_accepted_at'] ?? '') as String),
      );

  /// Auth's /me carries identity only since the users-service split; the
  /// display name, avatar and favorites come from the profile.
  User withProfile(UserProfile p) => User(
        id: id,
        phone: phone,
        displayName: p.displayName.isNotEmpty ? p.displayName : displayName,
        avatarKey: p.avatarKey,
        tosAcceptedAt: tosAcceptedAt,
        favoriteTeams: p.favoriteTeams,
      );
}

/// Max favorite teams per user — keep in sync with users FAVORITE_TEAMS_MAX.
const maxFavoriteTeams = 6;

/// A favorite team snapshot (users service). Order in the list is the order;
/// the first is the user's primary team.
class FavoriteTeam {
  FavoriteTeam({
    required this.sport,
    required this.league,
    required this.externalId,
    required this.name,
    required this.abbreviation,
    this.logo,
    this.color,
  });

  final String sport;
  final String league;
  final String externalId;
  final String name;
  final String abbreviation;
  final String? logo;
  final String? color;

  bool sameAs(FavoriteTeam o) => sport == o.sport && league == o.league && externalId == o.externalId;

  factory FavoriteTeam.fromJson(Map<String, dynamic> j) => FavoriteTeam(
        sport: j['sport'] as String,
        league: j['league'] as String,
        externalId: '${j['external_id']}',
        name: (j['name'] ?? '') as String,
        abbreviation: (j['abbreviation'] ?? '') as String,
        logo: j['logo'] as String?,
        color: j['color'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'sport': sport,
        'league': league,
        'external_id': externalId,
        'name': name,
        'abbreviation': abbreviation,
        'logo': logo,
        'color': color,
      };
}

/// Max pinned leagues per user — keep in sync with users FAVORITE_LEAGUES_MAX.
const maxFavoriteLeagues = 20;

/// A pinned sports league (users service; private to the user, shared with
/// the web). Order in the list is pin order.
class FavoriteLeague {
  FavoriteLeague({required this.sport, required this.league, required this.name, this.abbreviation, this.logo});
  final String sport;
  final String league;
  final String name;
  final String? abbreviation;
  final String? logo;

  bool sameAs(String s, String l) => sport == s && league == l;

  factory FavoriteLeague.fromJson(Map<String, dynamic> j) => FavoriteLeague(
        sport: j['sport'] as String,
        league: j['league'] as String,
        name: (j['name'] ?? '') as String,
        abbreviation: j['abbreviation'] as String?,
        logo: j['logo'] as String?,
      );

  Map<String, dynamic> toJson() =>
      {'sport': sport, 'league': league, 'name': name, 'abbreviation': abbreviation, 'logo': logo};
}

/// The signed-in user's profile from the users service.
class UserProfile {
  UserProfile({required this.displayName, this.avatarKey, this.favoriteTeams = const []});
  final String displayName;
  final String? avatarKey;
  final List<FavoriteTeam> favoriteTeams;

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
        favoriteTeams: ((j['favorite_teams'] as List<dynamic>?) ?? [])
            .map((e) => FavoriteTeam.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// A sports-catalog entry (ingestor): a sport or a league within one.
class CatalogItem {
  CatalogItem({required this.slug, required this.name, this.logo, this.id = '', this.sportLeagueId, this.abbreviation});
  final String slug;
  final String name;
  final String? logo;
  final String id;

  /// A league's catalog id (what a Waygerz league references).
  final String? sportLeagueId;
  final String? abbreviation;

  factory CatalogItem.fromJson(Map<String, dynamic> j) => CatalogItem(
        slug: (j['slug'] ?? j['id'] ?? '') as String,
        name: (j['displayName'] ?? j['name'] ?? j['slug'] ?? '') as String,
        logo: j['logo'] as String?,
        id: '${j['id'] ?? ''}',
        sportLeagueId: j['sport_league_id'] as String?,
        abbreviation: j['abbreviation'] as String?,
      );
}

class FeedNotification {
  FeedNotification({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.read,
    this.templateKey,
    this.actorId,
    this.actorName,
    this.actorAvatarKey,
    this.refType,
    this.refId,
    this.deepLink,
    this.createdAt,
  });

  final String id;
  final String category;

  /// The specific event (wager_proposed, friend_request, …) — drives the icon
  /// and which inline action to offer. Null on legacy rows.
  final String? templateKey;
  final String title;
  final String body;
  final bool read;

  /// Who it's from, when applicable (a user, or a league for league notices).
  final String? actorId;
  final String? actorName;
  final String? actorAvatarKey;
  final String? refType; // wager | league | user | …
  final String? refId;
  final String? deepLink;
  final String? createdAt;

  factory FeedNotification.fromJson(Map<String, dynamic> j) => FeedNotification(
        id: '${j['id']}',
        category: (j['category'] ?? '') as String,
        templateKey: j['template_key'] as String?,
        title: (j['title'] ?? '') as String,
        body: (j['body'] ?? '') as String,
        read: (j['read'] ?? false) as bool,
        actorId: j['actor_id'] == null ? null : '${j['actor_id']}',
        actorName: j['actor_name'] as String?,
        actorAvatarKey: j['actor_avatar_key'] as String?,
        refType: j['ref_type'] as String?,
        refId: j['ref_id'] == null ? null : '${j['ref_id']}',
        deepLink: j['deep_link'] as String?,
        createdAt: j['created_at'] as String?,
      );
}

// ---------------------------------------------------------------- leagues -----

/// A league in the caller's list / detail. `leagueType` is "pickem" (free) or
/// "head_to_head" (money). Money-only fields are null for pickem.
class League {
  League({
    required this.id,
    required this.name,
    required this.leagueType,
    required this.status,
    this.description,
    this.logoUrl,
    this.commissionerId,
    this.myRole,
    this.memberCount = 0,
    this.periodType,
    this.startingBalanceCents,
    this.minWagerCents,
    this.maxWagerCents,
    this.currentPeriodId,
    this.inviteCode,
    this.currentPeriod,
    this.myBalanceCents,
    this.unreadFeedCount = 0,
    this.topMembers = const [],
    this.members = const [],
    this.sports = const [],
    this.rules = const {},
    this.timezone,
  });

  final String id;
  final String name;
  final String leagueType;
  final String status; // draft | active | completed | archived
  final String? description;
  final String? logoUrl;
  final String? commissionerId;
  final String? myRole;
  final int memberCount;
  final String? periodType; // weekly | season
  final int? startingBalanceCents;
  final int? minWagerCents;
  final int? maxWagerCents;
  final String? currentPeriodId;
  final String? inviteCode;
  final LeaguePeriod? currentPeriod;
  final int? myBalanceCents;

  /// Unread feed posts/notices (league list cards).
  final int unreadFeedCount;

  /// A few members for the list card's avatar stack.
  final List<LeagueMember> topMembers;

  /// Every active member (league detail only).
  final List<LeagueMember> members;

  /// The league's sport-leagues: `(id: sport_league_id, name)` (detail only).
  final List<({String id, String name})> sports;

  /// League settings (season_year / week_starts_on / who_can_propose, …).
  final Map<String, dynamic> rules;

  /// IANA zone the league's weeks roll over in.
  final String? timezone;

  bool get isActive => status == 'active';

  bool get isMoney => leagueType == 'head_to_head';
  bool get isPickem => leagueType == 'pickem';
  bool get isDraft => status == 'draft';

  factory League.fromJson(Map<String, dynamic> j) => League(
        id: j['id'] as String,
        name: (j['name'] ?? '') as String,
        leagueType: (j['league_type'] ?? 'pickem') as String,
        status: (j['status'] ?? 'draft') as String,
        description: j['description'] as String?,
        logoUrl: j['logo_url'] as String?,
        commissionerId: j['commissioner_id'] as String?,
        myRole: j['my_role'] as String?,
        memberCount: (j['member_count'] as int?) ?? 0,
        periodType: j['period_type'] as String?,
        startingBalanceCents: j['starting_balance_cents'] as int?,
        minWagerCents: j['min_wager_cents'] as int?,
        maxWagerCents: j['max_wager_cents'] as int?,
        currentPeriodId: (j['current_period'] is Map)
            ? (j['current_period']['id'] as String?)
            : j['current_period_id'] as String?,
        inviteCode: j['invite_code'] as String?,
        currentPeriod: (j['current_period'] is Map)
            ? LeaguePeriod.fromJson((j['current_period'] as Map).cast<String, dynamic>())
            : null,
        myBalanceCents: j['my_balance_cents'] as int?,
        unreadFeedCount: (j['unread_feed_count'] as int?) ?? 0,
        topMembers: _members(j['top_members']),
        members: _members(j['members']),
        rules: (j['rules'] as Map?)?.cast<String, dynamic>() ?? const {},
        timezone: j['timezone'] as String?,
        sports: [
          for (final e in (j['sports'] as List<dynamic>?) ?? const [])
            (id: '${(e as Map)['sport_league_id']}', name: (e['name'] ?? e['sport_league_id'] ?? '') as String),
        ],
      );

  static List<LeagueMember> _members(Object? v) => ((v as List<dynamic>?) ?? const [])
      .map((e) => LeagueMember.fromJson((e as Map).cast<String, dynamic>()))
      .toList();
}

class LeagueMember {
  LeagueMember({required this.userId, required this.displayName, this.role = 'member', this.avatarKey});
  final String userId;
  final String displayName;
  final String role; // commissioner | moderator | member
  final String? avatarKey;

  factory LeagueMember.fromJson(Map<String, dynamic> j) => LeagueMember(
        userId: '${j['user_id']}',
        displayName: (j['display_name'] ?? '') as String,
        role: (j['role'] ?? 'member') as String,
        avatarKey: j['avatar_key'] as String?,
      );
}

/// A league feed post (`GET /leagues/<id>/feed`): an announcement by a
/// member, or an activity event (joins, weeks opening/final, bet results).
class FeedItem {
  FeedItem({
    required this.id,
    required this.kind,
    required this.createdAt,
    this.eventType,
    this.authorId,
    this.authorName,
    this.title,
    this.body,
    this.linkUrl,
    this.linkLabel,
    this.meta = const {},
  });

  final String id;
  final String kind; // announcement | activity
  final String? eventType;
  final String? authorId;
  final String? authorName;
  final String? title;
  final String? body;
  final String? linkUrl;
  final String? linkLabel;

  /// Bet-result posts: `away`, `home`, `away_score`, `home_score`, `amount_cents`, `treat`.
  final Map<String, dynamic> meta;
  final String createdAt;

  factory FeedItem.fromJson(Map<String, dynamic> j) => FeedItem(
        id: '${j['id']}',
        kind: (j['kind'] ?? 'activity') as String,
        eventType: j['event_type'] as String?,
        authorId: j['author_id'] == null ? null : '${j['author_id']}',
        authorName: j['author_name'] as String?,
        title: j['title'] as String?,
        body: j['body'] as String?,
        linkUrl: j['link_url'] as String?,
        linkLabel: j['link_label'] as String?,
        meta: (j['meta'] as Map?)?.cast<String, dynamic>() ?? const {},
        createdAt: (j['created_at'] ?? '') as String,
      );
}

/// A pending league invite (`GET /leagues/invites`).
class LeagueInvite {
  LeagueInvite({
    required this.inviteId,
    required this.leagueId,
    required this.leagueName,
    required this.leagueType,
    this.leagueLogo,
    this.inviterName,
  });

  final String inviteId;
  final String leagueId;
  final String leagueName;
  final String leagueType;
  final String? leagueLogo;
  final String? inviterName;

  factory LeagueInvite.fromJson(Map<String, dynamic> j) => LeagueInvite(
        inviteId: j['invite_id'] as String,
        leagueId: j['league_id'] as String,
        leagueName: (j['league_name'] ?? '') as String,
        leagueType: (j['league_type'] ?? 'pickem') as String,
        leagueLogo: j['league_logo'] as String?,
        inviterName: j['inviter_name'] as String?,
      );
}

class LeaguePeriod {
  LeaguePeriod({
    required this.id,
    required this.index,
    required this.label,
    required this.status,
    this.startsAt,
    this.endsAt,
  });

  final String id;
  final int index;
  final String label;
  final String status; // upcoming | open | closed | final
  final String? startsAt;
  final String? endsAt;

  bool get isOpen => status == 'open';

  factory LeaguePeriod.fromJson(Map<String, dynamic> j) => LeaguePeriod(
        id: j['id'] as String,
        index: (j['index'] as int?) ?? 0,
        label: (j['label'] ?? '') as String,
        status: (j['status'] ?? 'upcoming') as String,
        startsAt: j['starts_at'] as String?,
        endsAt: j['ends_at'] as String?,
      );
}

/// A member's pick, enriched with the event snapshot the picks endpoint returns.
/// `correct` is null until graded; `voided` marks a no-contest game (excluded
/// from the tally) — see the leagues service Pick model.
class Pick {
  Pick({
    required this.eventId,
    required this.pickSide,
    this.correct,
    this.voided = false,
    this.eventName,
    this.homeTeam,
    this.awayTeam,
    this.startTime,
    this.status,
    this.tiebreakerTotal,
    this.homeScore,
    this.awayScore,
    this.homeLogo,
    this.awayLogo,
    this.homeAbbr,
    this.awayAbbr,
  });

  final String eventId;
  final String pickSide; // home | away
  final bool? correct;
  final bool voided;
  final String? eventName;
  final String? homeTeam;
  final String? awayTeam;
  final String? startTime;
  final String? status; // event status: scheduled | live | final | cancelled
  final int? tiebreakerTotal;
  final int? homeScore;
  final int? awayScore;
  final String? homeLogo;
  final String? awayLogo;
  final String? homeAbbr;
  final String? awayAbbr;

  factory Pick.fromJson(Map<String, dynamic> j) {
    final ev = (j['event'] is Map) ? (j['event'] as Map).cast<String, dynamic>() : <String, dynamic>{};
    return Pick(
      eventId: (j['event_id'] ?? ev['external_id'] ?? '') as String,
      pickSide: (j['pick_side'] ?? '') as String,
      correct: j['correct'] as bool?,
      voided: (j['voided'] ?? false) as bool,
      eventName: (j['event_name'] ?? ev['name']) as String?,
      homeTeam: (j['home_team'] ?? ev['home_team']) as String?,
      awayTeam: (j['away_team'] ?? ev['away_team']) as String?,
      startTime: (j['start_time'] ?? ev['start_time']) as String?,
      status: ev['status'] as String?,
      tiebreakerTotal: j['tiebreaker_total'] as int?,
      homeScore: ev['home_score'] as int?,
      awayScore: ev['away_score'] as int?,
      homeLogo: ev['home_logo'] as String?,
      awayLogo: ev['away_logo'] as String?,
      homeAbbr: ev['home_abbr'] as String?,
      awayAbbr: ev['away_abbr'] as String?,
    );
  }
}

/// One member's row on a pick'em week's leaderboard.
class WeeklyResultRow {
  WeeklyResultRow({
    required this.userId,
    required this.displayName,
    required this.correct,
    required this.graded,
    required this.total,
    required this.rank,
    required this.confirmed,
    this.avatarKey,
    this.tiebreakerTotal,
    this.tiebreakerDiff,
  });
  final String userId;
  final String displayName;
  final String? avatarKey;
  final int correct;
  final int graded;
  final int total;

  /// Competition rank; tied members (same correct + tie-breaker) share it.
  final int rank;

  /// The commissioner's per-week confirmation.
  final bool confirmed;
  final int? tiebreakerTotal;
  final int? tiebreakerDiff;

  factory WeeklyResultRow.fromJson(Map<String, dynamic> j) => WeeklyResultRow(
        userId: '${j['user_id']}',
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
        correct: (j['correct'] as int?) ?? 0,
        graded: (j['graded'] as int?) ?? 0,
        total: (j['total'] as int?) ?? 0,
        rank: (j['rank'] as int?) ?? 0,
        confirmed: (j['confirmed'] ?? false) as bool,
        tiebreakerTotal: j['tiebreaker_total'] as int?,
        tiebreakerDiff: j['tiebreaker_diff'] as int?,
      );
}

/// A pick'em week's results: leaderboard rows + the tie-breaker game's total.
class PeriodResults {
  PeriodResults({required this.rows, this.actualTotal});
  final List<WeeklyResultRow> rows;
  final int? actualTotal;

  factory PeriodResults.fromJson(Map<String, dynamic> j) => PeriodResults(
        rows: [for (final r in (j['rows'] as List<dynamic>?) ?? const []) WeeklyResultRow.fromJson(r as Map<String, dynamic>)],
        actualTotal: (j['last_game'] is Map) ? (j['last_game'] as Map)['actual_total'] as int? : null,
      );
}

class StandingRow {
  StandingRow({
    required this.userId,
    required this.displayName,
    this.avatarKey,
    this.wins = 0,
    this.losses = 0,
    this.pushes = 0,
    this.balanceCents,
    this.netCents,
    this.rank,
  });

  final String userId;
  final String displayName;
  final String? avatarKey;
  final int wins;
  final int losses;
  final int pushes;
  final int? balanceCents;
  final int? netCents;
  final int? rank;

  factory StandingRow.fromJson(Map<String, dynamic> j) => StandingRow(
        userId: (j['user_id'] ?? '') as String,
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
        wins: (j['wins'] as int?) ?? 0,
        losses: (j['losses'] as int?) ?? 0,
        pushes: (j['pushes'] as int?) ?? 0,
        balanceCents: j['balance_cents'] as int?,
        netCents: j['net_cents'] as int?,
        rank: j['rank'] as int?,
      );
}

// ------------------------------------------------------------- wagers (H2H) ---

/// An even-money head-to-head wager. Enriched with opponent names/avatars by the
/// contests service. `proposerSide` is home|away (ML/spread) or over|under
/// (total); the acceptor takes the opposite side.
class Wager {
  Wager({
    required this.id,
    required this.leagueId,
    required this.eventId,
    required this.status,
    required this.betType,
    required this.proposerSide,
    required this.acceptorSide,
    required this.amountCents,
    required this.proposerId,
    required this.acceptorId,
    this.line,
    this.treat,
    this.eventName,
    this.homeTeam = '',
    this.awayTeam = '',
    this.startTime,
    this.proposerName = '',
    this.acceptorName = '',
    this.proposerAvatarKey,
    this.acceptorAvatarKey,
    this.winnerUserId,
    this.cancelRequestedBy,
    this.heldId,
    this.pendingId,
    this.myTurn,
    this.stakeRound = 0,
    this.leagueName,
    this.periodId,
  });

  final String id;
  final String leagueId;
  final String eventId;
  final String status; // open|accepted|completed|settled|declined|cancelled|refunded
  final String betType; // moneyline|spread|total
  final String proposerSide; // home|away|over|under
  final String acceptorSide;
  final int amountCents;
  final String proposerId;
  final String acceptorId;

  /// Stored from the proposer's perspective (see [lineForSide]).
  final double? line;

  /// What the loser owes on a $0 bragging-rights bet: beer | shot.
  final String? treat;
  final String? eventName;
  final String homeTeam;
  final String awayTeam;
  final String? startTime;
  final String proposerName;
  final String acceptorName;
  final String? proposerAvatarKey;
  final String? acceptorAvatarKey;
  final String? winnerUserId;

  /// Set while one side waits on the other to approve calling the bet off.
  final String? cancelRequestedBy;

  /// Negotiation: whose stake is held (the waiting side) / whose turn it is.
  final String? heldId;
  final String? pendingId;

  /// Server-derived for the viewer: is it their turn to act?
  final bool? myTurn;

  /// Bumped on each counter (0 = the original proposal).
  final int stakeRound;

  /// The league's name, where the payload carries it (bet links).
  final String? leagueName;

  /// The league week the bet belongs to (null for none).
  final String? periodId;

  bool get isOpen => status == 'open';
  bool get isSettled => status == 'settled';

  factory Wager.fromJson(Map<String, dynamic> j) => Wager(
        id: j['id'] as String,
        leagueId: '${j['league_id'] ?? ''}',
        eventId: '${j['event_id'] ?? ''}',
        status: (j['status'] ?? 'open') as String,
        betType: (j['bet_type'] ?? 'moneyline') as String,
        proposerSide: (j['proposer_side'] ?? '') as String,
        acceptorSide: (j['acceptor_side'] ?? '') as String,
        amountCents: (j['amount_cents'] as int?) ?? 0,
        proposerId: '${j['proposer_id'] ?? ''}',
        acceptorId: '${j['acceptor_id'] ?? ''}',
        line: (j['line'] as num?)?.toDouble(),
        treat: j['treat'] as String?,
        eventName: j['event_name'] as String?,
        homeTeam: (j['home_team'] ?? '') as String,
        awayTeam: (j['away_team'] ?? '') as String,
        startTime: j['start_time'] as String?,
        proposerName: (j['proposer_name'] ?? '') as String,
        acceptorName: (j['acceptor_name'] ?? '') as String,
        proposerAvatarKey: j['proposer_avatar_key'] as String?,
        acceptorAvatarKey: j['acceptor_avatar_key'] as String?,
        winnerUserId: j['winner_user_id'] as String?,
        cancelRequestedBy: j['cancel_requested_by'] as String?,
        heldId: j['held_id'] as String?,
        pendingId: j['pending_id'] as String?,
        myTurn: j['my_turn'] as bool?,
        stakeRound: (j['stake_round'] as int?) ?? 0,
        leagueName: j['league'] as String?,
        periodId: j['period_id'] as String?,
      );
}

/// A game from the ingestor (`GET /ingestor/events/<external_id>`), for the
/// live/final score on a bet card.
class SportEvent {
  SportEvent({
    required this.externalId,
    required this.sport,
    required this.status,
    this.name = '',
    this.homeTeam = '',
    this.awayTeam = '',
    this.homeAbbr,
    this.awayAbbr,
    this.homeScore,
    this.awayScore,
    this.homeLogo,
    this.awayLogo,
    this.startTime,
    this.league = '',
    this.sportLeagueId,
    this.shortName,
    this.odds,
  });

  final String externalId;
  final String sport;

  /// The ingestor's league slug (for the odds endpoint) and catalog id.
  final String league;
  final String? sportLeagueId;
  final String? shortName;

  /// Last-known lines persisted by the ingestor (null until posted).
  final EventOdds? odds;
  final String status; // scheduled | live | final | cancelled
  final String name;
  final String homeTeam;
  final String awayTeam;
  final String? homeAbbr;
  final String? awayAbbr;
  final int? homeScore;
  final int? awayScore;
  final String? homeLogo;
  final String? awayLogo;
  final String? startTime;

  /// Field sports (golf, racing) have no home/away matchup. Mirrors web
  /// lib/espn.ts `isFieldSport`, where they're currently switched off (empty).
  static const fieldSports = <String>{};
  bool get isFieldSport => fieldSports.contains(sport);

  factory SportEvent.fromJson(Map<String, dynamic> j) => SportEvent(
        externalId: '${j['external_id'] ?? ''}',
        sport: (j['sport'] ?? '') as String,
        status: (j['status'] ?? 'scheduled') as String,
        name: (j['name'] ?? '') as String,
        homeTeam: (j['home_team'] ?? '') as String,
        awayTeam: (j['away_team'] ?? '') as String,
        homeAbbr: j['home_abbr'] as String?,
        awayAbbr: j['away_abbr'] as String?,
        homeScore: j['home_score'] as int?,
        awayScore: j['away_score'] as int?,
        homeLogo: j['home_logo'] as String?,
        awayLogo: j['away_logo'] as String?,
        startTime: j['start_time'] as String?,
        league: (j['league'] ?? '') as String,
        sportLeagueId: j['sport_league_id'] as String?,
        shortName: j['short_name'] as String?,
        odds: j['odds'] is Map ? EventOdds.fromJson((j['odds'] as Map).cast<String, dynamic>()) : null,
      );
}

/// Betting lines for a game (web lib/ingestor.ts EventOdds). Waygerz bets
/// straight up, so only the spread line (home team's number; away is its
/// inverse) and the total are used — no prices.
class EventOdds {
  EventOdds({this.spreadLine, this.total});
  final double? spreadLine;
  final double? total;

  bool get isEmpty => spreadLine == null && total == null;

  factory EventOdds.fromJson(Map<String, dynamic> j) => EventOdds(
        spreadLine: (j['spread'] is Map) ? ((j['spread'] as Map)['line'] as num?)?.toDouble() : null,
        total: (j['overUnder'] is Map) ? ((j['overUnder'] as Map)['total'] as num?)?.toDouble() : null,
      );
}

// --------------------------------------------------------------- wallet -------

class WalletBalance {
  WalletBalance({required this.account, required this.balanceCents});

  final String account;
  final int balanceCents;

  /// "$12.50" from cents (play-money credits).
  String get display => '\$${(balanceCents / 100).toStringAsFixed(2)}';

  factory WalletBalance.fromJson(Map<String, dynamic> j) {
    final w = (j['wallet'] is Map) ? j['wallet'] as Map<String, dynamic> : j;
    return WalletBalance(
      account: (w['account'] ?? '') as String,
      balanceCents: (w['balance_cents'] as int?) ?? 0,
    );
  }
}
