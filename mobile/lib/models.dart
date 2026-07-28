/// Plain data models mirroring the API JSON. Kept intentionally small — grow
/// these as screens need more fields.

class User {
  User({required this.id, required this.phone, required this.displayName, this.avatarKey});

  final String id;
  final String phone;
  final String displayName;
  final String? avatarKey;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] as String,
        phone: (j['phone'] ?? '') as String,
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
      );
}

class FeedNotification {
  FeedNotification({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.read,
    this.deepLink,
    this.createdAt,
  });

  final String id;
  final String category;
  final String title;
  final String body;
  final bool read;
  final String? deepLink;
  final String? createdAt;

  factory FeedNotification.fromJson(Map<String, dynamic> j) => FeedNotification(
        id: j['id'] as String,
        category: (j['category'] ?? '') as String,
        title: (j['title'] ?? '') as String,
        body: (j['body'] ?? '') as String,
        read: (j['read'] ?? false) as bool,
        deepLink: j['deep_link'] as String?,
        createdAt: j['created_at'] as String?,
      );
}
