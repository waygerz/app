import '../config.dart';
import '../models.dart';
import 'api_client.dart';

/// Outcome of verify/complete. Either the caller is logged in (user + the token
/// pair, which the mobile flow receives in the body) or a new account still
/// needs a display name (needsProfile + ticket).
class AuthResult {
  AuthResult({this.user, this.needsProfile = false, this.ticket, this.accessToken, this.refreshToken});
  final User? user;
  final bool needsProfile;
  final String? ticket;
  final String? accessToken;
  final String? refreshToken;

  factory AuthResult.fromJson(Map<String, dynamic> j) {
    if (j['needs_profile'] == true) {
      return AuthResult(needsProfile: true, ticket: j['ticket'] as String?);
    }
    return AuthResult(
      user: User.fromJson(j['user'] as Map<String, dynamic>),
      accessToken: j['access_token'] as String?,
      refreshToken: j['refresh_token'] as String?,
    );
  }
}

class AuthApi {
  AuthApi(this._api);
  final ApiClient _api;

  /// Request an OTP for [phone]. In non-prod (or with AUTH_REVEAL_OTP) the code
  /// comes back as `dev_otp` for testing.
  Future<String?> startOtp(String phone) async {
    final res = await _api.post('${Config.auth}/otp/start', auth: false, body: {'phone': phone});
    return res['dev_otp'] as String?;
  }

  Future<AuthResult> verifyOtp(String phone, String otp) async {
    final device = await _api.ensureDeviceUuid();
    final res = await _api.post('${Config.auth}/otp/verify',
        auth: false, body: {'phone': phone, 'otp': otp, 'device_uuid': device});
    return AuthResult.fromJson(res);
  }

  Future<AuthResult> completeSignup(String ticket, String displayName) async {
    final device = await _api.ensureDeviceUuid();
    final res = await _api.post('${Config.auth}/otp/complete',
        auth: false, body: {'ticket': ticket, 'display_name': displayName, 'device_uuid': device});
    return AuthResult.fromJson(res);
  }

  Future<User> me() async {
    final res = await _api.get('${Config.auth}/me');
    return User.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    final device = await _api.ensureDeviceUuid();
    await _api.post('${Config.auth}/logout', body: {'device_uuid': device});
  }
}
