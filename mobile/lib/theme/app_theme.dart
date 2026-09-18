/// The web app's design tokens (web/styles/globals.css, Tailwind v4 palette
/// converted to sRGB) as a Flutter theme, so the phone app matches the webui:
/// Inter, violet primary, green brand, zinc/slate surfaces, 12px cards, 6px
/// controls, light + dark following the OS like the web (defaultTheme=system).
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    required this.headerBackground,
    required this.headerBorder,
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

  /// The top bar is dark in both themes (the web header always carries
  /// `.dark`), in the chosen dark surface.
  final Color headerBackground;
  final Color headerBorder;

  /// The token set for a brightness and the user's appearance choices.
  factory WaygerzColors.resolve(Brightness brightness, Appearance a) {
    final dark = brightness == Brightness.dark;
    final surface = a.surface.tokens;
    return WaygerzColors(
      background: dark ? surface.background : const Color(0xFFFFFFFF),
      foreground: dark ? const Color(0xFFFAFAFA) : const Color(0xFF09090B),
      card: dark ? surface.card : const Color(0xFFFFFFFF),
      primary: a.primary.shade(dark),
      brand: a.accent.shade(dark),
      secondary: dark ? surface.secondary : const Color(0xFFF4F4F5),
      muted: dark ? surface.muted : const Color(0xFFF4F4F5),
      mutedForeground: const Color(0xFF71717B),
      border: dark ? surface.border : const Color(0xFFEBEBEE),
      input: dark ? surface.border : const Color(0xFFE4E4E7),
      destructive: const Color(0xFFE7000B),
      success: const Color(0xFF00A63E),
      warning: const Color(0xFFFE9A00),
      info: const Color(0xFF155DFC),
      picked: const Color(0xFF2B7FFF),
      headerBackground: surface.background,
      headerBorder: surface.border,
    );
  }

  static WaygerzColors of(BuildContext context) =>
      Theme.of(context).extension<WaygerzColors>() ??
      WaygerzColors.resolve(Theme.of(context).brightness, const Appearance());

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

const kHeaderHeight = 70.0;
const kBottomNavHeight = 64.0;

ThemeData buildTheme(Brightness brightness, [Appearance appearance = const Appearance()]) {
  final c = WaygerzColors.resolve(brightness, appearance);
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primary,
    onPrimary: appearance.primary.onColor,
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
        foregroundColor: appearance.primary.onColor,
        minimumSize: buttonSize,
        shape: controlShape,
        textStyle: buttonText,
        padding: const EdgeInsets.symmetric(horizontal: 16),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: c.primary,
        foregroundColor: appearance.primary.onColor,
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
      backgroundColor: c.headerBackground,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      toolbarHeight: kHeaderHeight,
      titleTextStyle: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
      shape: Border(bottom: BorderSide(color: c.headerBorder)),
    ),
  );
}


// ---------------------------------------------------------------- appearance
// The web's Appearance settings (components/theme/color-theme.tsx): a primary
// and an accent hue (light uses the -600 shade, dark the -500) and a dark
// surface, stored per device. Theme mode (system/light/dark) is added here
// because the phone has no browser-level toggle.

enum Hue {
  red('Red', Color(0xFFE7000B), Color(0xFFFB2C36)),
  orange('Orange', Color(0xFFF54900), Color(0xFFFF6900)),
  yellow('Yellow', Color(0xFFF0B100), Color(0xFFF0B100)),
  green('Green', Color(0xFF00A63E), Color(0xFF00C950)),
  blue('Blue', Color(0xFF155DFC), Color(0xFF2B7FFF)),
  indigo('Indigo', Color(0xFF4F39F6), Color(0xFF615FFF)),
  violet('Violet', Color(0xFF7F22FE), Color(0xFF8E51FF));

  const Hue(this.label, this._light, this._dark);
  final String label;
  final Color _light;
  final Color _dark;

  Color shade(bool dark) => dark ? _dark : _light;

  /// Yellow needs dark text on top (as on the web).
  Color get onColor => this == Hue.yellow ? const Color(0xFF09090B) : Colors.white;
}

class SurfaceTokens {
  const SurfaceTokens(this.background, this.card, this.secondary, this.muted, this.border);
  final Color background;
  final Color card;
  final Color secondary;
  final Color muted;
  final Color border;
}

enum Surface {
  slate('Slate', SurfaceTokens(Color(0xFF0E0F14), Color(0xFF191B24), Color(0xFF262935), Color(0xFF22242E), Color(0xFF2E3040))),
  soft('Soft', SurfaceTokens(Color(0xFF0F0F12), Color(0xFF17171B), Color(0xFF26262E), Color(0xFF1F1F26), Color(0xFF2B2B33))),
  lifted('Lifted', SurfaceTokens(Color(0xFF131318), Color(0xFF1E1E26), Color(0xFF2F2F3A), Color(0xFF26262F), Color(0xFF33333D))),
  flat('Flat', SurfaceTokens(Color(0xFF09090B), Color(0xFF09090B), Color(0xFF27272A), Color(0xFF18181B), Color(0xFF27272A)));

  const Surface(this.label, this.tokens);
  final String label;
  final SurfaceTokens tokens;
}

@immutable
class Appearance {
  const Appearance({
    this.mode = ThemeMode.system,
    this.primary = Hue.violet,
    this.accent = Hue.green,
    this.surface = Surface.slate,
  });
  final ThemeMode mode;
  final Hue primary;
  final Hue accent;
  final Surface surface;

  Appearance copyWith({ThemeMode? mode, Hue? primary, Hue? accent, Surface? surface}) => Appearance(
        mode: mode ?? this.mode,
        primary: primary ?? this.primary,
        accent: accent ?? this.accent,
        surface: surface ?? this.surface,
      );
}

/// Holds the appearance and persists it on the device (the web keeps the same
/// choices in localStorage). Any storage failure just leaves the defaults.
class AppearanceController extends ChangeNotifier {
  Appearance value = const Appearance();

  static const _kMode = 'waygerz-mode';
  static const _kPrimary = 'waygerz-primary';
  static const _kAccent = 'waygerz-accent';
  static const _kSurface = 'waygerz-surface';

  Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      T pick<T extends Enum>(List<T> values, String? name, T fallback) =>
          values.where((v) => v.name == name).firstOrNull ?? fallback;
      value = Appearance(
        mode: pick(ThemeMode.values, p.getString(_kMode), ThemeMode.system),
        primary: pick(Hue.values, p.getString(_kPrimary), Hue.violet),
        accent: pick(Hue.values, p.getString(_kAccent), Hue.green),
        surface: pick(Surface.values, p.getString(_kSurface), Surface.slate),
      );
      notifyListeners();
    } catch (_) {/* defaults */}
  }

  Future<void> update(Appearance next) async {
    value = next;
    notifyListeners();
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_kMode, next.mode.name);
      await p.setString(_kPrimary, next.primary.name);
      await p.setString(_kAccent, next.accent.name);
      await p.setString(_kSurface, next.surface.name);
    } catch (_) {/* still applied for this session */}
  }
}
