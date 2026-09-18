import 'package:flutter/material.dart';

/// Tailwind palette values the web uses directly (outside the theme tokens),
/// e.g. the league-type accents and notification tints.
class Tw {
  static const amber400 = Color(0xFFFBBF24);
  static const amber500 = Color(0xFFF59E0B);
  static const amber600 = Color(0xFFD97706);
  static const orange500 = Color(0xFFF97316);
  static const violet400 = Color(0xFFA78BFA);
  static const violet500 = Color(0xFF8B5CF6);
  static const violet600 = Color(0xFF7C3AED);
  static const fuchsia500 = Color(0xFFD946EF);
  static const fuchsia600 = Color(0xFFC026D3);
  static const sky500 = Color(0xFF0EA5E9);
  static const rose500 = Color(0xFFF43F5E);
  static const blue500 = Color(0xFF3B82F6);
  static const red500 = Color(0xFFEF4444);
}

extension Tint on Color {
  /// The web's `bg-x/15`-style translucent fill.
  Color tint(double alpha) => withValues(alpha: alpha);
}
