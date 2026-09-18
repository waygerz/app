import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config.dart';
import '../../theme/app_theme.dart';

enum LegalDoc {
  terms('/terms'),
  privacy('/privacy');

  const LegalDoc(this.path);
  final String path;

  Uri get uri => Uri.parse('${Config.apiBaseUrl}$path');
}

/// An inline link to the Terms / Privacy pages on the website.
TextSpan legalLink(BuildContext context, String label, LegalDoc doc) {
  final c = WaygerzColors.of(context);
  return TextSpan(
    text: label,
    style: TextStyle(color: c.primary, fontWeight: FontWeight.w500),
    recognizer: TapGestureRecognizer()
      ..onTap = () => launchUrl(doc.uri, mode: LaunchMode.externalApplication),
  );
}
