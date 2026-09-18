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

/// The otp/start outcome.
class OtpStart {
  OtpStart({required this.isNew, required this.consentRequired, required this.optedOut, this.message});
  final bool isNew;
  final bool consentRequired;
  final bool optedOut;
  final String? message;
}

/// The consent record sent with a new signup.
class SignupConsent {
  const SignupConsent({
    required this.tosVersion,
    required this.tosAccepted,
    required this.smsTransactional,
    required this.smsMarketing,
  });
  final String tosVersion;
  final bool tosAccepted;
  final bool smsTransactional;
  final bool smsMarketing;
}

class AuthApi {
  AuthApi(this._api);
  final ApiClient _api;

  /// Request a sign-in code. A NEW number gets no text until it opts in to
  /// SMS (the code is itself a text): without [smsConsent] the result comes back
  /// `consentRequired` and nothing is sent. `optedOut` means the number replied
  /// STOP. Same contract as the web.
  Future<OtpStart> startOtp(String phone, {bool smsConsent = false}) async {
    final res = await _api.post('${Config.auth}/otp/start',
        auth: false, body: {'phone': phone, 'sms_consent': smsConsent});
    return OtpStart(
      isNew: (res['is_new'] as bool?) ?? false,
      consentRequired: (res['consent_required'] as bool?) ?? false,
      optedOut: (res['opted_out'] as bool?) ?? false,
      message: res['message'] as String?,
    );
  }

  Future<AuthResult> verifyOtp(String phone, String otp) async {
    final device = await _api.ensureDeviceUuid();
    final res = await _api.post('${Config.auth}/otp/verify',
        auth: false, body: {'phone': phone, 'otp': otp, 'device_uuid': device});
    return AuthResult.fromJson(res);
  }

  /// Finish a new signup with the name and the consent record (Terms +
  /// Privacy acceptance at [legalVersion], and the SMS choices).
  Future<AuthResult> completeSignup(String ticket, String displayName, SignupConsent consent) async {
    final device = await _api.ensureDeviceUuid();
    final res = await _api.post('${Config.auth}/otp/complete', auth: false, body: {
      'ticket': ticket,
      'display_name': displayName,
      'device_uuid': device,
      'tos_version': consent.tosVersion,
      'tos_accepted': consent.tosAccepted,
      'sms_transactional': consent.smsTransactional,
      'sms_marketing': consent.smsMarketing,
    });
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

  /// Permanently delete the signed-in account (cross-service purge). A 409
  /// `owns_leagues` comes back as an ApiException whose `data['leagues']` lists
  /// the leagues the user must hand off or archive first.
  Future<void> deleteAccount() => _api.delete('${Config.auth}/account');
}
