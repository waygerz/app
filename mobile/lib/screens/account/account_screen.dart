import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/users_api.dart';
import '../../auth/auth_controller.dart';
import '../../shell/app_header.dart';
import '../../theme/app_theme.dart';
import '../widgets.dart';
import 'appearance_card.dart';
import 'favorite_teams_card.dart';
import 'legal_links.dart';
import 'notifications_cards.dart';

/// The Account page (web: app/(app)/account/page.tsx), same sections in the
/// same order: avatar, display name, phone, favorite teams, appearance,
/// notifications, promotions, agreements, delete account.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const WaygerzHeader.page('Account'),
      body: NotificationPrefsScope(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
          children: const [
            _AvatarCard(),
            SizedBox(height: 24),
            _NameCard(),
            SizedBox(height: 24),
            _PhoneCard(),
            SizedBox(height: 24),
            FavoriteTeamsCard(),
            SizedBox(height: 24),
            AppearanceCard(),
            SizedBox(height: 24),
            NotificationsCard(),
            SizedBox(height: 24),
            PromotionsCard(),
            SizedBox(height: 24),
            _AgreementsCard(),
            SizedBox(height: 24),
            _DeleteAccountCard(),
          ],
        ),
      ),
    );
  }
}

void _toast(BuildContext context, String msg) {
  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

String _message(Object e) => e is ApiException ? e.message : 'Something went wrong';

// ---------------------------------------------------------------- avatar
class _AvatarCard extends StatefulWidget {
  const _AvatarCard();

  @override
  State<_AvatarCard> createState() => _AvatarCardState();
}

class _AvatarCardState extends State<_AvatarCard> {
  late final UsersApi _users;
  late final MediaApi _media;
  late Future<List<MediaAsset>> _recent;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthController>().api;
    _users = UsersApi(api);
    _media = MediaApi(api);
    _recent = _media.mine('avatar');
  }

  Future<void> _run(Future<void> Function() work, String done) async {
    setState(() => _busy = true);
    try {
      await work();
      if (mounted) _toast(context, done);
    } catch (e) {
      if (mounted) _toast(context, _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setAvatar(String? key) async {
    final auth = context.read<AuthController>();
    auth.applyProfile(await _users.setAvatar(key));
  }

  Future<void> _choose() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 512,
      maxHeight: 512,
      imageQuality: 85,
    );
    if (file == null) return;
    await _run(() async {
      final bytes = await file.readAsBytes();
      final type = file.mimeType ?? MediaApi.contentTypeFor(file.name);
      final asset = await _media.upload('avatar', bytes, type);
      await _setAvatar(asset.key);
      setState(() => _recent = _media.mine('avatar'));
    }, 'Avatar updated');
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final user = context.watch<AuthController>().user;
    if (user == null) return const SizedBox.shrink();
    final hasAvatar = user.avatarKey?.isNotEmpty ?? false;

    return SectionCard(title: 'Avatar', children: [
      Center(
        child: Stack(clipBehavior: Clip.none, children: [
          GestureDetector(
            onTap: _busy ? null : _choose,
            child: Opacity(
              opacity: _busy ? 0.7 : 1,
              child: Container(
                width: 192,
                height: 192,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: c.mutedForeground.withValues(alpha: hasAvatar ? 0.4 : 0.25)),
                ),
                child: hasAvatar
                    ? UserAvatar(userId: user.id, name: user.displayName, avatarKey: user.avatarKey, size: 190)
                    : Icon(LucideIcons.user, size: 48, color: c.mutedForeground),
              ),
            ),
          ),
          if (hasAvatar)
            PositionedDirectional(
              top: 0,
              end: 0,
              child: SizedBox(
                width: 28,
                height: 28,
                child: OutlinedButton(
                  onPressed: _busy ? null : () => _run(() => _setAvatar(null), 'Avatar removed'),
                  style: OutlinedButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(28, 28),
                    shape: const CircleBorder(),
                  ),
                  child: const Icon(LucideIcons.x, size: 14),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 16),
      Text(hasAvatar ? 'Avatar set' : 'Upload avatar',
          textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      const SizedBox(height: 2),
      Text('PNG or JPG — square images look best',
          textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      const SizedBox(height: 16),
      Center(
        child: FilledButton.icon(
          onPressed: _busy ? null : _choose,
          icon: const Icon(LucideIcons.imagePlus, size: 16),
          label: Text(_busy ? 'Uploading…' : (hasAvatar ? 'Upload new' : 'Choose image')),
        ),
      ),
      FutureBuilder<List<MediaAsset>>(
        future: _recent,
        builder: (context, snap) {
          final recent = snap.data ?? const [];
          if (recent.isEmpty) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Recent — tap to reuse', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              const SizedBox(height: 12),
              Wrap(spacing: 20, runSpacing: 12, children: [
                for (final a in recent)
                  GestureDetector(
                    onTap: _busy || a.key == user.avatarKey
                        ? null
                        : () => _run(() => _setAvatar(a.key), 'Avatar updated'),
                    child: Stack(clipBehavior: Clip.none, children: [
                      Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: a.key == user.avatarKey ? const Color(0xFF05DF72) : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        child: UserAvatar(userId: user.id, name: user.displayName, avatarKey: a.key, size: 56),
                      ),
                      if (a.key == user.avatarKey)
                        Positioned(
                          right: -2,
                          top: -2,
                          child: Container(
                            padding: const EdgeInsets.all(2),
                            decoration: const BoxDecoration(color: Color(0xFF00C950), shape: BoxShape.circle),
                            child: const Icon(LucideIcons.check, size: 12, color: Colors.white),
                          ),
                        ),
                    ]),
                  ),
              ]),
            ]),
          );
        },
      ),
    ]);
  }
}

// ---------------------------------------------------------------- name / phone
class _NameCard extends StatefulWidget {
  const _NameCard();

  @override
  State<_NameCard> createState() => _NameCardState();
}

class _NameCardState extends State<_NameCard> {
  late final TextEditingController _name;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: context.read<AuthController>().user?.displayName ?? '');
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final auth = context.read<AuthController>();
    final next = _name.text.trim();
    setState(() => _saving = true);
    try {
      auth.applyProfile(await UsersApi(auth.api).updateDisplayName(next));
      if (mounted) _toast(context, 'Name updated');
    } catch (e) {
      if (mounted) _toast(context, _message(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = context.watch<AuthController>().user?.displayName ?? '';
    // Pick up the profile's name once it loads, unless the user is editing.
    if (_name.text.isEmpty && current.isNotEmpty) _name.text = current;
    final next = _name.text.trim();
    return SectionCard(children: [
      const Text('Display name', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      const SizedBox(height: 10),
      TextField(
        controller: _name,
        maxLength: 64,
        style: const TextStyle(fontSize: 16),
        decoration: const InputDecoration(hintText: 'Your name', counterText: ''),
      ),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: _saving || next.isEmpty || next == current ? null : _save,
        child: Text(_saving ? 'Saving…' : 'Save'),
      ),
    ]);
  }
}

class _PhoneCard extends StatelessWidget {
  const _PhoneCard();

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final phone = context.watch<AuthController>().user?.phone ?? '';
    return SectionCard(children: [
      const Text('Phone', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      const SizedBox(height: 10),
      TextField(
        controller: TextEditingController(text: phone),
        enabled: false,
        style: const TextStyle(fontSize: 16),
      ),
      const SizedBox(height: 8),
      Text('Your phone number is how you sign in and can’t be changed here yet.',
          style: TextStyle(fontSize: 12, color: c.mutedForeground)),
    ]);
  }
}

// ---------------------------------------------------------------- agreements
class _AgreementsCard extends StatelessWidget {
  const _AgreementsCard();

  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final at = context.watch<AuthController>().user?.tosAcceptedAt?.toLocal();
    final style = TextStyle(fontSize: 12, height: 1.5, color: c.mutedForeground);
    return SectionCard(title: 'Agreements', children: [
      Text.rich(TextSpan(style: style, children: [
        TextSpan(text: at != null ? 'You agreed to the ' : 'Review our '),
        legalLink(context, 'Terms of Service', LegalDoc.terms),
        const TextSpan(text: ' and '),
        legalLink(context, 'Privacy Policy', LegalDoc.privacy),
        TextSpan(text: at != null ? ' on ${_months[at.month - 1]} ${at.day}, ${at.year}.' : '.'),
      ])),
    ]);
  }
}

// ---------------------------------------------------------------- delete
class _DeleteAccountCard extends StatelessWidget {
  const _DeleteAccountCard();

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return SectionCard(
      title: 'Delete account',
      titleColor: c.destructive,
      borderColor: c.destructive.withValues(alpha: 0.3),
      description: 'Permanently deletes your account and personal data. Any active bets are voided and stakes '
          'returned. This can’t be undone.',
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: c.destructive, foregroundColor: Colors.white),
            onPressed: () => showDialog<void>(context: context, builder: (_) => const _DeleteDialog()),
            child: const Text('Delete account'),
          ),
        ),
      ],
    );
  }
}

class _DeleteDialog extends StatefulWidget {
  const _DeleteDialog();

  @override
  State<_DeleteDialog> createState() => _DeleteDialogState();
}

class _DeleteDialogState extends State<_DeleteDialog> {
  static const _confirmWord = 'DELETE';
  final _confirm = TextEditingController();
  bool _busy = false;
  List<Map<String, dynamic>>? _blocking;

  @override
  void dispose() {
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    final auth = context.read<AuthController>();
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    setState(() => _busy = true);
    try {
      await auth.deleteAccount();
      nav.popUntil((r) => r.isFirst);
      messenger.showSnackBar(const SnackBar(content: Text('Your account has been deleted')));
    } on ApiException catch (e) {
      final leagues = (e.data['leagues'] as List<dynamic>?)?.cast<Map<String, dynamic>>();
      if (e.statusCode == 409 && (leagues?.isNotEmpty ?? false)) {
        setState(() => _blocking = leagues);
      } else {
        messenger.showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not delete your account')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final blocking = _blocking;
    if (blocking != null) {
      return AlertDialog(
        title: const Text('Transfer or close your leagues first'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(
            'You’re the commissioner of ${blocking.length == 1 ? 'a league' : '${blocking.length} leagues'}. '
            'Hand the commissioner role to another member, or archive the league, then delete your account.',
            style: TextStyle(fontSize: 14, color: c.mutedForeground),
          ),
          const SizedBox(height: 12),
          for (final l in blocking)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(WaygerzRadius.md),
              ),
              child: Row(children: [
                Expanded(child: Text('${l['name']}', style: const TextStyle(fontWeight: FontWeight.w500))),
                Text('${l['member_count']} member${l['member_count'] == 1 ? '' : 's'}',
                    style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ]),
            ),
        ]),
        actions: [OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close'))],
      );
    }
    return PopScope(
      canPop: !_busy,
      child: AlertDialog(
        title: Row(children: [
          Icon(LucideIcons.triangleAlert, color: c.destructive, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text('Delete your account?', style: TextStyle(color: c.destructive))),
        ]),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            'This permanently deletes your account and personal data and signs you out on every device. Active '
            'bets are voided and stakes returned. Your messages and past bets stay in other members’ history, '
            'shown as “Deleted user.” This can’t be undone.',
            style: TextStyle(fontSize: 14, color: c.mutedForeground),
          ),
          const SizedBox(height: 16),
          Text.rich(TextSpan(style: const TextStyle(fontSize: 14), children: [
            const TextSpan(text: 'Type '),
            TextSpan(text: _confirmWord, style: TextStyle(fontWeight: FontWeight.w600, color: c.foreground)),
            const TextSpan(text: ' to confirm'),
          ])),
          const SizedBox(height: 8),
          TextField(
            controller: _confirm,
            enabled: !_busy,
            autocorrect: false,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(hintText: _confirmWord),
            onChanged: (_) => setState(() {}),
          ),
        ]),
        actions: [
          OutlinedButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: c.destructive, foregroundColor: Colors.white),
            onPressed: _busy || _confirm.text.trim() != _confirmWord ? null : _delete,
            child: Text(_busy ? 'Deleting…' : 'Delete account'),
          ),
        ],
      ),
    );
  }
}
