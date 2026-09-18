/// The web app's design tokens (web/styles/globals.css, Tailwind v4 palette
/// converted to sRGB) as a Flutter theme, so the phone app matches the webui:
/// Inter, violet primary, green brand, zinc/slate surfaces, 12px cards, 6px
/// controls, light + dark following the OS like the web (defaultTheme=system).
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Colors the Material ColorScheme has no slot for (brand, success, muted
/// text, input border, …). Read with `WaygerzColors.of(context)`.
@immutable
class WaygerzColors extends ThemeExtension<WaygerzColors> {
  const WaygerzColors({
    required this.background,
    required this.foreground,
    required this.card,
    required this.primary,
    required this.brand,
    required this.secondary,
    required this.muted,
    required this.mutedForeground,
    required this.border,
    required this.input,
    required this.destructive,
    required this.success,
    required this.warning,
    required this.info,
    required this.picked,
  });

  final Color background;
  final Color foreground;
  final Color card;
  final Color primary;
  final Color brand;
  final Color secondary;
  final Color muted;
  final Color mutedForeground;
  final Color border;
  final Color input;
  final Color destructive;
  final Color success;
  final Color warning;
  final Color info;

  /// A selected (not yet graded) pick — blue-500, used at 20% as a fill.
  final Color picked;

  static const light = WaygerzColors(
    background: Color(0xFFFFFFFF),
    foreground: Color(0xFF09090B),
    card: Color(0xFFFFFFFF),
    primary: Color(0xFF7F22FE), // violet-600
    brand: Color(0xFF00A63E), // green-600
    secondary: Color(0xFFF4F4F5),
    muted: Color(0xFFF4F4F5),
    mutedForeground: Color(0xFF71717B),
    border: Color(0xFFEBEBEE),
    input: Color(0xFFE4E4E7),
    destructive: Color(0xFFE7000B),
    success: Color(0xFF00A63E),
    warning: Color(0xFFFE9A00),
    info: Color(0xFF155DFC),
    picked: Color(0xFF2B7FFF),
  );

  static const dark = WaygerzColors(
    background: Color(0xFF0E0F14), // slate surface
    foreground: Color(0xFFFAFAFA),
    card: Color(0xFF191B24),
    primary: Color(0xFF8E51FF), // violet-500
    brand: Color(0xFF00C950), // green-500
    secondary: Color(0xFF262935),
    muted: Color(0xFF22242E),
    mutedForeground: Color(0xFF71717B),
    border: Color(0xFF2E3040),
    input: Color(0xFF2E3040),
    destructive: Color(0xFFE7000B),
    success: Color(0xFF00A63E),
    warning: Color(0xFFFE9A00),
    info: Color(0xFF155DFC),
    picked: Color(0xFF2B7FFF),
  );

  static WaygerzColors of(BuildContext context) =>
      Theme.of(context).extension<WaygerzColors>() ?? light;

  @override
  WaygerzColors copyWith() => this;

  @override
  WaygerzColors lerp(ThemeExtension<WaygerzColors>? other, double t) =>
      t < 0.5 ? this : (other as WaygerzColors? ?? this);
}

/// Radii from --radius (8px): cards/avatars xl, buttons/inputs md.
class WaygerzRadius {
  static const sm = 4.0;
  static const md = 6.0;
  static const lg = 8.0;
  static const xl = 12.0;
}

/// The header is dark in both themes on the web (it always carries `.dark`).
const kHeaderBackground = Color(0xFF0E0F14);
const kHeaderBorder = Color(0xFF2E3040);
const kHeaderHeight = 70.0;
const kBottomNavHeight = 64.0;

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? WaygerzColors.dark : WaygerzColors.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primary,
    onPrimary: Colors.white,
    secondary: c.secondary,
    onSecondary: c.foreground,
    tertiary: c.brand,
    onTertiary: Colors.white,
    error: c.destructive,
    onError: Colors.white,
    surface: c.background,
    onSurface: c.foreground,
    onSurfaceVariant: c.mutedForeground,
    surfaceContainerLowest: c.background,
    surfaceContainerLow: c.card,
    surfaceContainer: c.card,
    surfaceContainerHigh: c.muted,
    surfaceContainerHighest: c.secondary,
    outline: c.input,
    outlineVariant: c.border,
  );

  final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme);
  final text = GoogleFonts.interTextTheme(base.textTheme).apply(
    bodyColor: c.foreground,
    displayColor: c.foreground,
  );
  const controlShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(WaygerzRadius.md)),
  );
  // Buttons are at least 48px tall on mobile (min-h-12), 14px/500 label.
  const buttonSize = Size(48, 48);
  final buttonText = GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500);

  return base.copyWith(
    scaffoldBackgroundColor: c.background,
    textTheme: text,
    extensions: [c],
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    cardTheme: CardThemeData(
      color: c.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(WaygerzRadius.xl)),
        side: BorderSide(color: c.border),
      ),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: c.mutedForeground,
      textColor: c.foreground,
      subtitleTextStyle: text.bodySmall?.copyWith(color: c.mutedForeground),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(WaygerzRadius.xl)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.primary,
        foregroundColor: Colors.white,
        minimumSize: buttonSize,
        shape: controlShape,
        textStyle: buttonText,
        padding: const EdgeInsets.symmetric(horizontal: 16),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: c.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        minimumSize: buttonSize,
        shape: controlShape,
        textStyle: buttonText,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.foreground,
        backgroundColor: c.background,
        side: BorderSide(color: c.input),
        minimumSize: buttonSize,
        shape: controlShape,
        textStyle: buttonText,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.foreground,
        minimumSize: buttonSize,
        shape: controlShape,
        textStyle: buttonText,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.background,
      hintStyle: TextStyle(color: c.mutedForeground.withValues(alpha: 0.8)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(WaygerzRadius.md)),
        borderSide: BorderSide(color: c.input),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(WaygerzRadius.md)),
        borderSide: BorderSide(color: c.input),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(WaygerzRadius.md)),
        borderSide: BorderSide(color: c.primary, width: 1.5),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: const StadiumBorder(),
      side: BorderSide(color: c.input),
      backgroundColor: c.background,
      selectedColor: c.primary,
      labelStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.foreground,
      contentTextStyle: GoogleFonts.inter(color: c.background, fontSize: 14),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(WaygerzRadius.lg)),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.card,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(WaygerzRadius.xl)),
      ),
    ),
    // Screens that still push their own AppBar get the same dark header look.
    appBarTheme: AppBarTheme(
      backgroundColor: kHeaderBackground,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      toolbarHeight: kHeaderHeight,
      titleTextStyle: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
      shape: const Border(bottom: BorderSide(color: kHeaderBorder)),
    ),
  );
}
