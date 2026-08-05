/// Plain data models mirroring the API JSON. Kept intentionally small — grow
/// these as screens need more fields. JSON keys match the backend snake_case;
/// parse defensively (null-safe with defaults) since some endpoints enrich rows.

class User {
  User({required this.id, required this.phone, required this.displayName, this.avatarKey});

  final String id;
  final String phone;
  final String displayName;
  final String? avatarKey;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] as String,
        phone: (j['phone'] ?? '') as String,
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
      );
}

class FeedNotification {
  FeedNotification({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.read,
    this.deepLink,
    this.createdAt,
  });

  final String id;
  final String category;
  final String title;
  final String body;
  final bool read;
  final String? deepLink;
  final String? createdAt;

  factory FeedNotification.fromJson(Map<String, dynamic> j) => FeedNotification(
        id: j['id'] as String,
        category: (j['category'] ?? '') as String,
        title: (j['title'] ?? '') as String,
        body: (j['body'] ?? '') as String,
        read: (j['read'] ?? false) as bool,
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
    );
  }
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
    this.rank,
  });

  final String userId;
  final String displayName;
  final String? avatarKey;
  final int wins;
  final int losses;
  final int pushes;
  final int? balanceCents;
  final int? rank;

  factory StandingRow.fromJson(Map<String, dynamic> j) => StandingRow(
        userId: (j['user_id'] ?? '') as String,
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
        wins: (j['wins'] as int?) ?? 0,
        losses: (j['losses'] as int?) ?? 0,
        pushes: (j['pushes'] as int?) ?? 0,
        balanceCents: j['balance_cents'] as int?,
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
    required this.status,
    required this.betType,
    required this.proposerSide,
    required this.amountCents,
    this.line,
    this.eventName,
    this.homeTeam,
    this.awayTeam,
    this.startTime,
    this.proposerId,
    this.acceptorId,
    this.proposerName,
    this.acceptorName,
    this.winnerUserId,
  });

  final String id;
  final String leagueId;
  final String status; // open|accepted|settled|declined|cancelled|refunded
  final String betType; // moneyline|spread|total
  final String proposerSide;
  final int amountCents;
  final double? line;
  final String? eventName;
  final String? homeTeam;
  final String? awayTeam;
  final String? startTime;
  final String? proposerId;
  final String? acceptorId;
  final String? proposerName;
  final String? acceptorName;
  final String? winnerUserId;

  bool get isOpen => status == 'open';
  bool get isSettled => status == 'settled';

  /// "$5.00" stake, or "Bragging rights" for a $0 wager.
  String get stakeLabel =>
      amountCents == 0 ? 'Bragging rights' : '\$${(amountCents / 100).toStringAsFixed(2)}';

  factory Wager.fromJson(Map<String, dynamic> j) => Wager(
        id: j['id'] as String,
        leagueId: (j['league_id'] ?? '') as String,
        status: (j['status'] ?? 'open') as String,
        betType: (j['bet_type'] ?? 'moneyline') as String,
        proposerSide: (j['proposer_side'] ?? '') as String,
        amountCents: (j['amount_cents'] as int?) ?? 0,
        line: (j['line'] as num?)?.toDouble(),
        eventName: j['event_name'] as String?,
        homeTeam: j['home_team'] as String?,
        awayTeam: j['away_team'] as String?,
        startTime: j['start_time'] as String?,
        proposerId: j['proposer_id'] as String?,
        acceptorId: j['acceptor_id'] as String?,
        proposerName: j['proposer_name'] as String?,
        acceptorName: j['acceptor_name'] as String?,
        winnerUserId: j['winner_user_id'] as String?,
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
