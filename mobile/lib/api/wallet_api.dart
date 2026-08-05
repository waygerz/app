import '../config.dart';
import '../models.dart';
import 'api_client.dart';

/// Client for the wallet service (`/v1/gameplay/wallet`) — play-money credits.
/// Every account is league-scoped: `league:{leagueId}`. Mirrors web/lib/wallet.ts.
class WalletApi {
  WalletApi(this._api);
  final ApiClient _api;
  String get _p => Config.wallet;

  /// The league-scoped account key money lives under.
  static String leagueAccount(String leagueId) => 'league:$leagueId';

  Future<WalletBalance> balance(String account) async {
    final res = await _api.get('$_p/me?account=$account');
    return WalletBalance.fromJson(res);
  }

  Future<WalletBalance> leagueBalance(String leagueId) => balance(leagueAccount(leagueId));

  /// Ledger entries for an account (grants, holds, payouts, refunds).
  Future<List<Map<String, dynamic>>> transactions(String account, {int limit = 50}) async {
    final res = await _api.get('$_p/me/transactions?account=$account&limit=$limit');
    final list = (res['transactions'] as List<dynamic>? ?? []);
    return list.cast<Map<String, dynamic>>();
  }
}
