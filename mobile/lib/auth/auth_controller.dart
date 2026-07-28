import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../models.dart';
import 'token_store.dart';

enum AuthStatus { unknown, signedOut, signedIn }

/// App-wide auth state. Owns the token store and exposes the OTP login flow.
class AuthController extends ChangeNotifier {
  AuthController({TokenStore? tokens, ApiClient? api}) : _tokens = tokens ?? TokenStore() {
    _api = api ?? ApiClient(_tokens);
    _auth = AuthApi(_api);
  }

  final TokenStore _tokens;
  late final ApiClient _api;
  late final AuthApi _auth;

  ApiClient get api => _api;
  TokenStore get tokens => _tokens;

  AuthStatus status = AuthStatus.unknown;
  User? user;

  /// Restore a persisted session on launch (validates it against /me).
  Future<void> bootstrap() async {
    if (!await _tokens.hasSession) {
      _set(AuthStatus.signedOut, null);
      return;
    }
    try {
      final u = await _auth.me();
      _set(AuthStatus.signedIn, u);
    } on SessionExpired {
      await _tokens.clear();
      _set(AuthStatus.signedOut, null);
    } catch (_) {
      // Network hiccup — keep the stored session; screens can retry.
      _set(AuthStatus.signedIn, null);
    }
  }

  Future<String?> startOtp(String phone) => _auth.startOtp(phone);

  /// Verify the code. Returns the ticket if the account is new (caller then
  /// calls [completeSignup]); returns null once signed in.
  Future<String?> verifyOtp(String phone, String otp) async {
    final res = await _auth.verifyOtp(phone, otp);
    if (res.needsProfile) return res.ticket;
    await _persist(res);
    return null;
  }

  Future<void> completeSignup(String ticket, String displayName) async {
    final res = await _auth.completeSignup(ticket, displayName);
    await _persist(res);
  }

  Future<void> logout() async {
    try {
      await _auth.logout();
    } catch (_) {/* best effort */}
    await _tokens.clear();
    _set(AuthStatus.signedOut, null);
  }

  Future<void> _persist(AuthResult res) async {
    if (res.accessToken != null && res.refreshToken != null) {
      await _tokens.saveTokens(res.accessToken!, res.refreshToken!);
    }
    _set(AuthStatus.signedIn, res.user);
  }

  void _set(AuthStatus s, User? u) {
    status = s;
    user = u;
    notifyListeners();
  }
}
