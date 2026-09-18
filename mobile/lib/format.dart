/// Display formatting shared by every screen. Each helper mirrors its web
/// counterpart so both clients print the same strings.
library;

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Play-money credits: "$5", "$12.50", "$1,200" (web lib/wallet.ts formatCredits).
String formatCredits(int cents) {
  final negative = cents < 0;
  final abs = cents.abs();
  final whole = abs ~/ 100;
  final frac = abs % 100;
  final digits = whole.toString();
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(',');
    grouped.write(digits[i]);
  }
  final body = frac == 0 ? '$grouped' : '$grouped.${frac.toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}\$$body';
}

/// Kickoff time: "Sun, Sep 21, 1:00 PM" (web components/event-card.tsx formatStart).
String formatStart(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (d == null) return 'TBD';
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minute = d.minute.toString().padLeft(2, '0');
  final ampm = d.hour < 12 ? 'AM' : 'PM';
  return '${_weekdays[d.weekday - 1]}, ${_months[d.month - 1]} ${d.day}, $hour:$minute $ampm';
}

/// "just now", "5m ago", "3h ago", "2d ago", else the date (web notifications timeAgo).
String timeAgo(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final s = DateTime.now().difference(d).inSeconds;
  if (s < 60) return 'just now';
  final m = s ~/ 60;
  if (m < 60) return '${m}m ago';
  final h = m ~/ 60;
  if (h < 24) return '${h}h ago';
  final days = h ~/ 24;
  if (days < 7) return '${days}d ago';
  return '${d.month}/${d.day}/${d.year}';
}

/// "Head-to-head" / "Pick'em" (web lib/leagues.ts leagueTypeLabel).
String leagueTypeLabel(String type) => switch (type) {
      'head_to_head' => 'Head-to-head',
      'pickem' => "Pick'em",
      _ => type,
    };

/// "Commish" / "Moderator" / "Member" (web _sections/shared.tsx memberRoleLabel).
String memberRoleLabel(String role) => switch (role) {
      'commissioner' => 'Commish',
      'moderator' => 'Moderator',
      'member' => 'Member',
      _ => role.isEmpty ? role : role[0].toUpperCase() + role.substring(1),
    };

/// "3–1" or "3–1–2" with pushes (web standings formatRecord).
String formatRecord(int wins, int losses, [int pushes = 0]) =>
    pushes > 0 ? '$wins–$losses–$pushes' : '$wins–$losses';

/// The $0 bragging-rights treat: 🍺 or 🥃 (web components/treat-picker.tsx).
String treatEmoji(String? treat) => treat == 'shot' ? '🥃' : '🍺';
