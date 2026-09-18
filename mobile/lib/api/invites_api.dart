import '../config.dart';
import 'api_client.dart';

/// Unified invite-code client for `/c/<code>` links. Mirrors web/lib/invites.ts:
/// the code's leading letter picks the owning service (F → friends, B → contests,
/// anything else → leagues) and every service answers the same contract.
class InvitesApi {
  InvitesApi(this._api);
  final ApiClient _api;

  /// Strip display grouping dashes and normalize casing.
  static String normalize(String raw) => raw.replaceAll('-', '').trim().toUpperCase();

  static String _serviceFor(String code) {
    if (code.startsWith('F')) return Config.friends;
    if (code.startsWith('B')) return Config.contests;
    return Config.leagues;
  }

  static String _typeFor(String code) =>
      code.startsWith('F') ? 'friend' : (code.startsWith('B') ? 'bet' : 'league');

  /// Resolve a code to its preview + allowed actions. An unknown code is a 404
  /// that still carries the contract body (state `invalid`), so it resolves
  /// rather than throws.
  Future<ResolvedCode> resolve(String raw) async {
    final code = normalize(raw);
    try {
      return ResolvedCode.fromJson(
          await _api.get('${_serviceFor(code)}/c/${Uri.encodeComponent(code)}'));
    } on ApiException catch (e) {
      if (e.statusCode == 404) {
        return e.data['type'] is String ? ResolvedCode.fromJson(e.data) : ResolvedCode.invalid(code, _typeFor(code));
      }
      rethrow;
    }
  }

  /// Perform an action on a code (`join`, `add`, `accept`, `decline`,
  /// `undecline`); returns the target to open.
  Future<({String type, String targetId})> act(String raw, String action) async {
    final code = normalize(raw);
    final res = await _api.post('${_serviceFor(code)}/c/${Uri.encodeComponent(code)}/act',
        body: {'action': action});
    return (type: res['type'] as String, targetId: res['target_id'] as String);
  }

  /// Get-or-create the caller's reusable personal friend link code.
  Future<String> myFriendCode() async =>
      (await _api.get('${Config.friends}/my-code'))['code'] as String;
}

class ResolvedCode {
  ResolvedCode({
    required this.type,
    required this.code,
    required this.targetId,
    required this.state,
    required this.singleUse,
    required this.viewer,
    required this.preview,
    required this.actions,
  });

  final String type; // league | friend | bet
  final String code;
  final String? targetId;
  final String state; // ok | invalid | expired | consumed
  final bool singleUse;
  /// `{authenticated, relationship, request_id?, my_turn?}`.
  final Map<String, dynamic> viewer;
  /// League preview, `{user}` for a friend code, `{wager}` for a bet code.
  final Map<String, dynamic>? preview;
  final List<String> actions;

  bool get isValid => state == 'ok';

  factory ResolvedCode.fromJson(Map<String, dynamic> j) => ResolvedCode(
        type: j['type'] as String,
        code: (j['code'] ?? '') as String,
        targetId: j['target_id'] as String?,
        state: (j['state'] ?? 'invalid') as String,
        singleUse: (j['single_use'] ?? false) as bool,
        viewer: (j['viewer'] as Map<String, dynamic>?) ?? const {},
        preview: j['preview'] as Map<String, dynamic>?,
        actions: ((j['actions'] as List<dynamic>?) ?? const []).cast<String>(),
      );

  factory ResolvedCode.invalid(String code, String type) => ResolvedCode(
        type: type,
        code: code,
        targetId: null,
        state: 'invalid',
        singleUse: false,
        viewer: const {'authenticated': false, 'relationship': 'none'},
        preview: null,
        actions: const [],
      );
}
