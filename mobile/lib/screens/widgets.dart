import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../api/users_api.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';

/// Small shared UI bits used across screens.

/// Hash matching web/lib/leagues.ts `leagueColor` / lib/avatar.ts, so an id
/// gets the same color on both clients.
int _hash(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return h;
}

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
  final s = parts.take(2).map((w) => w[0].toUpperCase()).join();
  return s.isEmpty ? '?' : s;
}

const _leaguePalette = [
  Color(0xFF6366F1), Color(0xFFEC4899), Color(0xFFF59E0B), Color(0xFF10B981),
  Color(0xFF3B82F6), Color(0xFFEF4444), Color(0xFF8B5CF6), Color(0xFF14B8A6),
];

/// A stored image value → something displayable, like the web's useMediaSrc:
/// an S3 key ("members/…") is resolved to a presigned URL via the media
/// service; a direct URL passes through. Renders [fallback] until (or unless)
/// there is an image.
class MediaImage extends StatelessWidget {
  const MediaImage({super.key, required this.value, required this.size, required this.fallback, this.circle = false, this.radius = 0});
  final String? value;
  final double size;
  final Widget fallback;
  final bool circle;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final v = value;
    if (v == null || v.isEmpty) return fallback;
    if (!v.startsWith('members/')) return _image(v);
    final cached = MediaApi.cachedUrl(v);
    if (cached != null) return _image(cached);
    return FutureBuilder<String?>(
      future: MediaApi(context.read<AuthController>().api).resolve(v),
      builder: (context, snap) => snap.data == null ? fallback : _image(snap.data!),
    );
  }

  Widget _image(String url) {
    final img = Image.network(url, width: size, height: size, fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => fallback);
    return circle ? ClipOval(child: img) : ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

/// League avatar as on the web: a 12px-rounded square in the league's hashed
/// color with white bold initials (logo/avatar-key resolution comes later).
class LeagueAvatar extends StatelessWidget {
  const LeagueAvatar({super.key, required this.name, this.id, this.logo, this.size = 40});
  final String name;
  final String? id;

  /// The league's `logo_url` (an uploaded media key or a URL).
  final String? logo;
  final double size;

  double get _radius => size >= 32 ? WaygerzRadius.xl : WaygerzRadius.md;

  @override
  Widget build(BuildContext context) =>
      MediaImage(value: logo, size: size, radius: _radius, fallback: _initials());

  Widget _initials() {
    final color = _leaguePalette[_hash(id ?? name) % _leaguePalette.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(_radius),
      ),
      child: Text(
        initialsOf(name),
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.36),
      ),
    );
  }
}

/// User avatar fallback as on the web (lib/avatar.ts): initials in a hue, on a
/// 10% tint of the same hue, picked by hashing the user id.
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.userId, required this.name, this.avatarKey, this.size = 40});
  final String userId;
  final String name;

  /// An uploaded avatar's media key; resolved to a presigned URL and shown in
  /// place of the initials when set.
  final String? avatarKey;
  final double size;

  @override
  Widget build(BuildContext context) {
    return MediaImage(value: avatarKey, size: size, circle: true, fallback: _initials(context));
  }

  Widget _initials(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = WaygerzColors.of(context);
    final hues = [
      c.destructive,
      c.primary,
      dark ? const Color(0xFFFFB900) : const Color(0xFFE17100), // amber
      dark ? const Color(0xFF05DF72) : const Color(0xFF00A63E), // green
      dark ? const Color(0xFF51A2FF) : const Color(0xFF155DFC), // blue
      dark ? const Color(0xFFA684FF) : const Color(0xFF7F22FE), // violet
      dark ? const Color(0xFFFF637E) : const Color(0xFFEC003F), // rose
      dark ? const Color(0xFF00D5BE) : const Color(0xFF009689), // teal
    ];
    final hue = hues[_hash(userId) % hues.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: hue.withValues(alpha: 0.1), shape: BoxShape.circle),
      child: Text(
        initialsOf(name),
        style: TextStyle(color: hue, fontWeight: FontWeight.w600, fontSize: size * 0.38),
      ),
    );
  }
}

/// A titled card section, as the web's account cards: 20px padding, 16px
/// title (600), optional 12px muted description.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, this.title, this.description, required this.children, this.titleColor, this.borderColor, this.trailing});
  final String? title;
  final String? description;
  final List<Widget> children;
  final Color? titleColor;
  final Color? borderColor;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(WaygerzRadius.xl),
        border: Border.all(color: borderColor ?? c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Row(children: [
              Expanded(
                child: Text(title!,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: titleColor ?? c.foreground)),
              ),
              if (trailing != null) trailing!,
            ]),
          if (description != null) ...[
            const SizedBox(height: 4),
            Text(description!, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ],
          if (title != null || description != null) const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

/// A league's current period — "Week 3 · Open" (green dot while open) — or
/// Draft before the league starts; null when there's no period (web
/// components/period-badge.tsx). The league row and My Leagues cards use it.
Widget? periodBadge(WaygerzColors c, {required String status, LeaguePeriod? period}) {
  if (status == 'draft') return const WzBadge('Draft', variant: BadgeVariant.warning);
  if (period == null) return null;
  final s = period.status.isEmpty ? '' : '${period.status[0].toUpperCase()}${period.status.substring(1)}';
  return WzBadge('${period.label} · $s', variant: BadgeVariant.secondary, dot: period.status == 'open' ? c.brand : null);
}

/// Team logo (network) with the web's fallback: a colored circle with the
/// abbreviation.
class TeamLogo extends StatelessWidget {
  const TeamLogo({super.key, required this.name, required this.abbreviation, this.logo, this.color, this.size = 28});
  final String name;
  final String abbreviation;
  final String? logo;
  final String? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: parseHex(color) ?? c.muted, shape: BoxShape.circle),
      child: Text(
        abbreviation.isEmpty ? initialsOf(name) : abbreviation,
        style: TextStyle(
          fontSize: size * 0.34,
          fontWeight: FontWeight.w700,
          color: parseHex(color) == null ? c.mutedForeground : Colors.white,
        ),
      ),
    );
    final url = logo;
    if (url == null || url.isEmpty) return fallback;
    return Image.network(url, width: size, height: size, errorBuilder: (context, error, stack) => fallback);
  }

  /// "#rrggbb" (or bare hex) → a color; null when missing or malformed.
  static Color? parseHex(String? v) {
    if (v == null) return null;
    final h = v.replaceFirst('#', '');
    if (h.length != 6) return null;
    final n = int.tryParse(h, radix: 16);
    return n == null ? null : Color(0xFF000000 | n);
  }
}
