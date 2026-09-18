import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/notifications_api.dart';
import '../../auth/auth_controller.dart';
import '../../theme/app_theme.dart';
import '../widgets.dart';
import 'legal_links.dart';

/// Web: components/account/notifications-card.tsx. One shared preferences
/// load backs both cards; writes are optimistic and roll back on failure.
class NotificationPrefsModel extends ChangeNotifier {
  NotificationPrefsModel(this._api) {
    load();
  }
  final NotificationsApi _api;

  Map<String, dynamic>? prefs;
  bool error = false;

  bool get loading => prefs == null && !error;
  bool get smsMuted => (prefs?['opted_out'] as bool?) ?? false;

  bool channel(String category, String ch) =>
      (((prefs?['channels'] as Map<String, dynamic>?)?[category] as Map<String, dynamic>?)?[ch] as bool?) ?? false;

  Future<void> load() async {
    error = false;
    notifyListeners();
    try {
      final res = await _api.preferences();
      prefs = res['preferences'] as Map<String, dynamic>?;
    } catch (_) {
      error = true;
    }
    notifyListeners();
  }

  Future<bool> set(Map<String, dynamic> patch) async {
    final prev = prefs;
    prefs = _apply(prev ?? {}, patch);
    notifyListeners();
    try {
      final res = await _api.updatePreferences(patch);
      prefs = res['preferences'] as Map<String, dynamic>? ?? prefs;
      notifyListeners();
      return true;
    } catch (_) {
      prefs = prev;
      notifyListeners();
      return false;
    }
  }

  Future<bool> toggle(String category, String ch, bool v) => set({
        'channels': {
          category: {ch: v}
        }
      });

  static Map<String, dynamic> _apply(Map<String, dynamic> prev, Map<String, dynamic> patch) {
    final next = Map<String, dynamic>.from(prev);
    final chans = Map<String, dynamic>.from((prev['channels'] as Map<String, dynamic>?) ?? {});
    if (patch.containsKey('opted_out')) next['opted_out'] = patch['opted_out'];
    (patch['channels'] as Map<String, dynamic>? ?? {}).forEach((cat, v) {
      chans[cat] = {...((chans[cat] as Map<String, dynamic>?) ?? {}), ...(v as Map<String, dynamic>)};
    });
    next['channels'] = chans;
    return next;
  }
}

const _smsTransactionalConsent =
    'I agree to receive account and bet-related text messages from Waygerz — bet challenges, results, and '
    'reminders — at the number provided. These alerts are optional and not a condition of using Waygerz. '
    'Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help, or '
    'email support@waygerz.com.';
const _smsMarketingConsent =
    'I agree to receive occasional promotional and marketing text messages from Waygerz. Consent is not a '
    'condition of using Waygerz. Message and data rates may apply. Message frequency varies. Reply STOP to '
    'opt out, HELP for help, or email support@waygerz.com.';

// (key, title, description, in-app only)
const _categories = [
  ('wager_alert', 'Wager alerts', 'Bets proposed, accepted, or settled.', false),
  ('league_invite', 'League invites', 'When someone invites you to a league.', false),
  ('league_alert', 'League updates', 'A new week opening and weekly results in your leagues.', false),
  ('friend_request', 'Friend requests', 'New and accepted friend requests.', false),
  ('reaction', 'Reactions', 'When someone reacts to your post.', true),
  ('weekly_digest', 'Weekly digest', 'A weekly recap of your leagues.', false),
];

/// Run a preference write and toast on failure. The messenger is captured
/// before the await, so no BuildContext is used across the async gap.
Future<void> _save(BuildContext context, Future<bool> Function() write) async {
  final messenger = ScaffoldMessenger.of(context);
  if (!await write()) {
    messenger.showSnackBar(const SnackBar(content: Text("Couldn't save that — try again.")));
  }
}

/// The "Allow SMS" master switch plus its carrier disclosures in one box.
class _SmsBox extends StatelessWidget {
  const _SmsBox({required this.title, required this.value, required this.enabled, required this.onChanged, required this.marketing});
  final String title;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;
  final bool marketing;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final small = TextStyle(fontSize: 11, height: 1.5, color: c.mutedForeground);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(WaygerzRadius.lg),
        border: Border.all(color: c.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: c.muted.withValues(alpha: 0.2),
          padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
          child: Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500))),
            Switch(value: value, onChanged: enabled ? onChanged : null),
          ]),
        ),
        Container(
          decoration: BoxDecoration(
            color: c.muted.withValues(alpha: 0.3),
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text.rich(TextSpan(style: small, children: [
              TextSpan(text: '${marketing ? _smsMarketingConsent : _smsTransactionalConsent} See our '),
              legalLink(context, 'Terms of Service', LegalDoc.terms),
              const TextSpan(text: ' and '),
              legalLink(context, 'Privacy Policy', LegalDoc.privacy),
              const TextSpan(text: '.'),
            ])),
            if (!marketing) ...[
              const SizedBox(height: 6),
              Text(
                'Account security texts (one-time sign-in codes) are always sent to verify it’s you and aren’t '
                'controlled here.',
                style: small,
              ),
            ],
          ]),
        ),
      ]),
    );
  }
}

class NotificationsCard extends StatelessWidget {
  const NotificationsCard({super.key});

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final m = context.watch<NotificationPrefsModel>();
    final header = TextStyle(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.mutedForeground);

    return SectionCard(
      title: 'Notifications',
      description: 'How you hear about app activity — bets, invites, friends, and your weekly recap.',
      children: [
        _SmsBox(
          title: 'Allow SMS for Notifications',
          value: !m.smsMuted,
          enabled: !m.loading,
          marketing: false,
          onChanged: (v) => _save(context, () => m.set({'opted_out': !v})),
        ),
        const SizedBox(height: 16),
        if (m.error)
          Text('Couldn’t load your preferences.', style: TextStyle(fontSize: 14, color: c.mutedForeground))
        else ...[
          Row(children: [
            const Expanded(child: SizedBox()),
            SizedBox(width: 56, child: Center(child: Text('SMS', style: header))),
            SizedBox(width: 56, child: Center(child: Text('IN-APP', style: header))),
          ]),
          for (final (i, cat) in _categories.indexed)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                border: i == 0 ? null : Border(top: BorderSide(color: c.border)),
              ),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(cat.$2, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 2),
                    Text(cat.$3, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                  ]),
                ),
                SizedBox(
                  width: 56,
                  child: Center(
                    // In-app-only categories never text; the SMS master pauses the column.
                    child: cat.$4
                        ? Text('—', style: TextStyle(color: c.mutedForeground))
                        : Switch(
                            value: m.smsMuted ? false : m.channel(cat.$1, 'sms'),
                            onChanged: m.loading || m.smsMuted
                                ? null
                                : (v) => _save(context, () => m.toggle(cat.$1, 'sms', v)),
                          ),
                  ),
                ),
                SizedBox(
                  width: 56,
                  child: Center(
                    child: Switch(
                      value: m.channel(cat.$1, 'inapp'),
                      onChanged: m.loading ? null : (v) => _save(context, () => m.toggle(cat.$1, 'inapp', v)),
                    ),
                  ),
                ),
              ]),
            ),
        ],
      ],
    );
  }
}

class PromotionsCard extends StatelessWidget {
  const PromotionsCard({super.key});

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final m = context.watch<NotificationPrefsModel>();
    return SectionCard(
      title: 'Promotions',
      description: 'Occasional promos, news, and offers — separate from your notifications, and never turned '
          'on or off by them.',
      children: [
        _SmsBox(
          title: 'Allow SMS for Promotions',
          value: m.channel('marketing', 'sms'),
          enabled: !m.loading,
          marketing: true,
          onChanged: (v) => _save(context, () => m.toggle('marketing', 'sms', v)),
        ),
        const SizedBox(height: 12),
        if (m.error)
          Text('Couldn’t load your preferences.', style: TextStyle(fontSize: 14, color: c.mutedForeground))
        else
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Show in the app', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text('Also show promotions and offers in your in-app bell.',
                    style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ]),
            ),
            Switch(
              value: m.channel('marketing', 'inapp'),
              onChanged: m.loading ? null : (v) => _save(context, () => m.toggle('marketing', 'inapp', v)),
            ),
          ]),
      ],
    );
  }
}

/// Provides one shared prefs model to both cards.
class NotificationPrefsScope extends StatelessWidget {
  const NotificationPrefsScope({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => NotificationPrefsModel(NotificationsApi(context.read<AuthController>().api)),
      child: child,
    );
  }
}
