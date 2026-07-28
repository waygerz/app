/// App-wide config. The API base is the public ALB — native talks to the same
/// `/v1/{group}/{service}` endpoints the web does, but with bearer tokens.
class Config {
  /// Override at build time: `flutter run --dart-define=API_BASE_URL=...`.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://waygerz.com',
  );

  /// Marks requests as native so `auth` returns tokens in the JSON body
  /// (instead of the web's HttpOnly cookies) — see api/auth service_auth.py.
  static const String clientTypeHeader = 'X-Client-Type';
  static const String clientType = 'mobile';

  // API path prefixes — mirror api/<service>/app/utils/config.py::api_prefix()
  // and webui/lib/api-paths.ts. Keep in sync when a service group changes.
  static const String auth = '/v1/platform/auth';
  static const String notifications = '/v1/platform/notifications';
  static const String wallet = '/v1/platform/wallet';
  static const String friends = '/v1/social/friends';
  static const String contests = '/v1/gameplay/contests';
  static const String leagues = '/v1/gameplay/leagues';
}
