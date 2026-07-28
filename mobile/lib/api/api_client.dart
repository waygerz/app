import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../auth/token_store.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Thrown when a request needs auth but the session can't be refreshed. The app
/// should route back to login on this.
class SessionExpired implements Exception {}

/// HTTP wrapper for the Waygerz API. Attaches the bearer access token and the
/// mobile client header, and transparently refreshes the token once on a 401.
class ApiClient {
  ApiClient(this._tokens, {http.Client? client}) : _http = client ?? http.Client();

  final TokenStore _tokens;
  final http.Client _http;

  // Single-flight refresh: concurrent 401s share one refresh call.
  Future<bool>? _refreshing;

  Future<Map<String, dynamic>> get(String path) => _json('GET', path);
  Future<Map<String, dynamic>> post(String path, {Object? body, bool auth = true}) =>
      _json('POST', path, body: body, auth: auth);
  Future<Map<String, dynamic>> put(String path, {Object? body}) => _json('PUT', path, body: body);
  Future<Map<String, dynamic>> delete(String path, {Object? body}) =>
      _json('DELETE', path, body: body);

  Future<Map<String, dynamic>> _json(String method, String path,
      {Object? body, bool auth = true}) async {
    final res = await _send(method, path, body: body, auth: auth);
    final decoded = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    final msg = (decoded is Map && decoded['error'] is String)
        ? decoded['error'] as String
        : 'Request failed (${res.statusCode})';
    throw ApiException(res.statusCode, msg);
  }

  Future<http.Response> _send(String method, String path, {Object? body, bool auth = true}) async {
    var res = await _raw(method, path, body: body, auth: auth);
    if (res.statusCode == 401 && auth) {
      final ok = await _refreshOnce();
      if (!ok) throw SessionExpired();
      res = await _raw(method, path, body: body, auth: auth);
      if (res.statusCode == 401) throw SessionExpired();
    }
    return res;
  }

  Future<http.Response> _raw(String method, String path, {Object? body, bool auth = true}) async {
    final uri = Uri.parse('${Config.apiBaseUrl}$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      Config.clientTypeHeader: Config.clientType,
    };
    if (auth) {
      final token = await _tokens.accessToken;
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    final payload = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'GET':
        return _http.get(uri, headers: headers);
      case 'POST':
        return _http.post(uri, headers: headers, body: payload);
      case 'PUT':
        return _http.put(uri, headers: headers, body: payload);
      case 'DELETE':
        return _http.delete(uri, headers: headers, body: payload);
      default:
        throw ArgumentError('unsupported method $method');
    }
  }

  Future<bool> _refreshOnce() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final refresh = await _tokens.refreshToken;
    final device = await ensureDeviceUuid();
    if (refresh == null) return false;
    final res = await _raw('POST', Config.auth + '/refresh',
        auth: false, body: {'refresh_token': refresh, 'device_uuid': device});
    if (res.statusCode != 200) return false;
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final access = data['access_token'] as String?;
    final newRefresh = data['refresh_token'] as String?;
    if (access == null || newRefresh == null) return false;
    await _tokens.saveTokens(access, newRefresh);
    return true;
  }

  /// The per-install device id the refresh-token rotation is bound to. Created
  /// once and persisted.
  Future<String> ensureDeviceUuid() async {
    final existing = await _tokens.deviceUuid;
    if (existing != null) return existing;
    final uuid = _uuidV4();
    await _tokens.saveDeviceUuid(uuid);
    return uuid;
  }

  static String _uuidV4() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    String hex(int i) => b[i].toRadixString(16).padLeft(2, '0');
    final s = List.generate(16, hex).join();
    return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}'
        '-${s.substring(16, 20)}-${s.substring(20)}';
  }
}
