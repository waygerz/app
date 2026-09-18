import 'package:http/http.dart' as http;

import '../config.dart';
import '../models.dart';
import 'api_client.dart';

/// Users (profile) service: display name, avatar key, favorite teams.
class UsersApi {
  UsersApi(this._api);
  final ApiClient _api;

  Future<UserProfile> myProfile() async {
    final res = await _api.get('${Config.users}/profile');
    return UserProfile.fromJson(res['profile'] as Map<String, dynamic>);
  }

  Future<UserProfile> updateDisplayName(String name) async {
    final res = await _api.patch('${Config.users}/profile', body: {'display_name': name});
    return UserProfile.fromJson(res['profile'] as Map<String, dynamic>);
  }

  /// Set (or clear, with null) the avatar to an uploaded media key.
  Future<UserProfile> setAvatar(String? key) async {
    final res = await _api.patch('${Config.users}/profile/avatar', body: {'avatar_key': key});
    return UserProfile.fromJson(res['profile'] as Map<String, dynamic>);
  }

  /// Replace the whole ordered favorites list (first = primary, max 6).
  Future<List<FavoriteTeam>> saveFavorites(List<FavoriteTeam> teams) async {
    final res = await _api.put('${Config.users}/favorites/teams',
        body: {'teams': teams.map((t) => t.toJson()).toList()});
    return ((res['favorite_teams'] as List<dynamic>?) ?? [])
        .map((e) => FavoriteTeam.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// The user's pinned leagues, in pin order.
  Future<List<FavoriteLeague>> favoriteLeagues() async =>
      _leagues(await _api.get('${Config.users}/favorites/leagues'));

  /// Replace the whole ordered pinned-leagues list.
  Future<List<FavoriteLeague>> saveFavoriteLeagues(List<FavoriteLeague> leagues) async => _leagues(
      await _api.put('${Config.users}/favorites/leagues', body: {'leagues': leagues.map((l) => l.toJson()).toList()}));

  static List<FavoriteLeague> _leagues(Map<String, dynamic> res) =>
      ((res['favorite_leagues'] as List<dynamic>?) ?? [])
          .map((e) => FavoriteLeague.fromJson(e as Map<String, dynamic>))
          .toList();
}

/// An uploaded media asset (only what the app needs).
class MediaAsset {
  MediaAsset({required this.id, required this.key});
  final String id;
  final String key;
  factory MediaAsset.fromJson(Map<String, dynamic> j) =>
      MediaAsset(id: '${j['id']}', key: (j['s3_key'] ?? '') as String);
}

/// Media service: presigned uploads and key → URL resolution.
class MediaApi {
  MediaApi(this._api, {http.Client? client}) : _http = client ?? http.Client();
  final ApiClient _api;
  final http.Client _http;

  // Presigned GET URLs last about an hour; reuse them for a while.
  static final _urlCache = <String, (String, DateTime)>{};

  /// Upload bytes end to end: presign → PUT to S3 (skipped when the service
  /// runs mocked) → complete. Returns the ready asset.
  Future<MediaAsset> upload(String purpose, List<int> bytes, String contentType) async {
    final presign = await _api.post('${Config.media}/uploads/presign', body: {
      'purpose': purpose,
      'content_type': contentType,
      'byte_size': bytes.length,
    });
    final asset = MediaAsset.fromJson(presign['asset'] as Map<String, dynamic>);
    final url = presign['upload_url'] as String?;
    if (url != null) {
      final headers = (presign['upload_headers'] as Map<String, dynamic>? ?? {})
          .map((k, v) => MapEntry(k, '$v'));
      final put = await _http.put(Uri.parse(url), headers: headers, body: bytes);
      if (put.statusCode >= 300) throw ApiException(put.statusCode, 'Upload failed (${put.statusCode})');
    }
    final done = await _api.post('${Config.media}/uploads/${asset.id}/complete');
    return MediaAsset.fromJson(done['asset'] as Map<String, dynamic>);
  }

  /// The caller's recent uploads of a purpose, newest first.
  Future<List<MediaAsset>> mine(String purpose, {int limit = 5}) async {
    final res = await _api.get(withQuery('${Config.media}/uploads/mine', {'purpose': purpose, 'limit': limit}));
    return ((res['assets'] as List<dynamic>?) ?? [])
        .map((e) => MediaAsset.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// A still-fresh resolved URL for [key], without a request (null if none).
  static String? cachedUrl(String key) {
    final hit = _urlCache[key];
    return hit != null && DateTime.now().isBefore(hit.$2) ? hit.$1 : null;
  }

  /// A displayable URL for an avatar/media key (presigned GET).
  Future<String?> resolve(String key) async {
    final hit = _urlCache[key];
    if (hit != null && DateTime.now().isBefore(hit.$2)) return hit.$1;
    final res = await _api.get(withQuery('${Config.media}/uploads/resolve', {'key': key}));
    final url = res['url'] as String?;
    if (url != null) _urlCache[key] = (url, DateTime.now().add(const Duration(minutes: 45)));
    return url;
  }

  static String contentTypeFor(String path) {
    final p = path.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.webp')) return 'image/webp';
    if (p.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }
}

/// The ingestor's public sports catalog, for the team picker.
class CatalogApi {
  CatalogApi(this._api);
  final ApiClient _api;

  Future<List<CatalogItem>> sports() async {
    final res = await _api.get('${Config.ingestor}/sports');
    return _items(res['sports']);
  }

  Future<List<CatalogItem>> leagues(String sport) async {
    final res = await _api.get('${Config.ingestor}/sports/$sport/leagues');
    return _items(res['leagues']);
  }

  /// Teams as favorite-team snapshots (what the picker adds).
  Future<List<FavoriteTeam>> teams(String sport, String league) async {
    final res = await _api.get('${Config.ingestor}/sports/$sport/leagues/$league/teams');
    return ((res['teams'] as List<dynamic>?) ?? []).map((e) {
      final t = e as Map<String, dynamic>;
      final name = (t['name'] ?? '') as String;
      final abbr = ((t['abbreviation'] as String?)?.isNotEmpty ?? false)
          ? t['abbreviation'] as String
          : (name.length >= 3 ? name.substring(0, 3) : name);
      final color = t['color'] as String?;
      return FavoriteTeam(
        sport: sport,
        league: league,
        externalId: '${t['external_id']}',
        name: name,
        abbreviation: abbr.toUpperCase(),
        logo: t['logo'] as String?,
        color: color == null || color.isEmpty ? null : (color.startsWith('#') ? color : '#$color'),
      );
    }).toList();
  }

  static List<CatalogItem> _items(dynamic list) => ((list as List<dynamic>?) ?? [])
      .map((e) => CatalogItem.fromJson(e as Map<String, dynamic>))
      .toList();
}
