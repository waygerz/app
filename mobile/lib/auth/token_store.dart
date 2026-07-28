import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the JWT pair + device id in the OS secure enclave (Keychain /
/// Keystore). This is the native equivalent of the web's HttpOnly cookies.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _s = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _s;

  static const _kAccess = 'waygerz_access';
  static const _kRefresh = 'waygerz_refresh';
  static const _kDevice = 'waygerz_device_uuid';

  Future<String?> get accessToken => _s.read(key: _kAccess);
  Future<String?> get refreshToken => _s.read(key: _kRefresh);
  Future<String?> get deviceUuid => _s.read(key: _kDevice);

  Future<void> saveTokens(String access, String refresh) async {
    await _s.write(key: _kAccess, value: access);
    await _s.write(key: _kRefresh, value: refresh);
  }

  Future<void> saveDeviceUuid(String uuid) => _s.write(key: _kDevice, value: uuid);

  Future<void> clear() async {
    await _s.delete(key: _kAccess);
    await _s.delete(key: _kRefresh);
    // Keep the device uuid — it identifies this install across logins.
  }

  Future<bool> get hasSession async => (await accessToken) != null;
}
