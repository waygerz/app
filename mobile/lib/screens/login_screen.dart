import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../auth/auth_controller.dart';
import '../legal.dart';
import '../theme/app_theme.dart';
import 'account/legal_links.dart';

/// Sign in / sign up — the web's /login flow (app/(guest)/login/page.tsx), same
/// steps and backend contract:
///   phone → (new number) consent → code → name → terms → account created.
/// A NEW number gets no text until it opts in on the consent card: the one-time
/// code is itself an SMS, so consent must come first.
enum _Step { phone, consent, code, name, terms }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _name = TextEditingController();

  _Step _step = _Step.phone;
  String _ticket = '';
  // SMS consent from the consent card (new numbers only): the account box is
  // required to send the code; marketing is optional.
  bool _smsAccount = false;
  bool _smsMarketing = false;
  bool _agreeTerms = false;
  bool _agreePrivacy = false;
  bool _busy = false;
  String? _error;

  AuthController get _auth => context.read<AuthController>();

  @override
  void initState() {
    super.initState();
    for (final c in [_phone, _otp, _name]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong — please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static const _optedOut = 'You’ve opted out of texts. Text START to get your login code.';

  // Phone step: an existing number gets a code now; a new one sees the consent card.
  Future<void> _sendCode() => _run(() async {
        final res = await _auth.startOtp(_phone.text.trim());
        if (res.optedOut) {
          setState(() => _error = res.message ?? _optedOut);
        } else {
          setState(() => _step = res.consentRequired ? _Step.consent : _Step.code);
        }
      });

  // Consent card: opt in, then the code is sent.
  Future<void> _agreeConsent() => _run(() async {
        final res = await _auth.startOtp(_phone.text.trim(), smsConsent: true);
        if (res.optedOut) {
          setState(() => _error = res.message ?? _optedOut);
        } else {
          setState(() => _step = _Step.code);
        }
      });

  Future<void> _verify() => _run(() async {
        final ticket = await _auth.verifyOtp(_phone.text.trim(), _otp.text.trim());
        if (ticket != null) {
          setState(() {
            _ticket = ticket;
            _step = _Step.name;
          });
        }
        // else: signed in — _Root swaps to HomeScreen via the provider.
      });

  Future<void> _create() => _run(() => _auth.completeSignup(
        _ticket,
        _name.text.trim(),
        SignupConsent(
          tosVersion: legalVersion,
          tosAccepted: _agreeTerms && _agreePrivacy,
          smsTransactional: _smsAccount,
          smsMarketing: _smsMarketing,
        ),
      ));

  void _go(_Step step) => setState(() {
        _step = step;
        _error = null;
      });

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final subtitle = switch (_step) {
      _Step.phone => 'Sign in or create your account',
      _Step.code => 'Check your phone',
      _ => null,
    };
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 448),
              child: Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: c.card,
                  borderRadius: BorderRadius.circular(WaygerzRadius.xl),
                  border: Border.all(color: c.border),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Image.asset('assets/images/logo.png', height: 80),
                  const SizedBox(height: 12),
                  Text('Waygerz',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, color: c.primary)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 12),
                    Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                  ],
                  const SizedBox(height: 24),
                  ..._stepBody(c),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _stepBody(WaygerzColors c) {
    final error = _error == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(_error!, style: TextStyle(fontSize: 16, color: c.destructive)),
          );
    const big = Size.fromHeight(56);
    final muted14 = TextStyle(fontSize: 14, height: 1.5, color: c.mutedForeground);

    switch (_step) {
      case _Step.phone:
        return [
          _phoneField(),
          const SizedBox(height: 16),
          error,
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: big, textStyle: const TextStyle(fontSize: 16)),
            onPressed: _busy || _phone.text.trim().isEmpty ? null : _sendCode,
            child: Text(_busy ? 'Continuing…' : 'Continue'),
          ),
          const SizedBox(height: 16),
          const Text(
            'We’ll text you a one-time code to sign in — no password needed. New here? This creates your '
            'account and we’ll confirm your text consent first.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, height: 1.5),
          ),
        ];

      case _Step.consent:
        return [
          const Text('Create your account',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Both boxes start unchecked. You must check the first one to agree to texts before we can '
              'send your sign-in code.', textAlign: TextAlign.center, style: muted14),
          const SizedBox(height: 20),
          _phoneField(),
          const SizedBox(height: 20),
          _checkBox(c, [
            _check(_smsAccount, (v) => setState(() => _smsAccount = v), const Text(smsAccountConsent)),
            _check(_smsMarketing, (v) => setState(() => _smsMarketing = v), const Text(smsMarketingConsent)),
          ]),
          const SizedBox(height: 20),
          Text.rich(
            TextSpan(style: TextStyle(fontSize: 12, height: 1.5, color: c.mutedForeground), children: [
              const TextSpan(text: 'By continuing you also agree to our '),
              legalLink(context, 'Terms', LegalDoc.terms),
              const TextSpan(text: ' and '),
              legalLink(context, 'Privacy Policy', LegalDoc.privacy),
              const TextSpan(text: '.'),
            ]),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          error,
          Row(children: [
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(0, 56)),
              onPressed: () => _go(_Step.phone),
              child: const Text('← Back'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: big, textStyle: const TextStyle(fontSize: 16)),
                onPressed: _busy || !_smsAccount || _phone.text.trim().isEmpty ? null : _agreeConsent,
                child: Text(_busy ? 'Sending…' : 'Agree & text me my code'),
              ),
            ),
          ]),
        ];

      case _Step.code:
        return [
          Text.rich(
            TextSpan(style: TextStyle(fontSize: 14, color: c.mutedForeground), children: [
              const TextSpan(text: 'We sent a 6-digit code to '),
              TextSpan(text: _phone.text, style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground)),
              const TextSpan(text: '.'),
            ]),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 64,
            child: TextField(
              controller: _otp,
              autofocus: true,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(fontSize: 30, letterSpacing: 15),
              decoration: const InputDecoration(hintText: '••••••', counterText: ''),
            ),
          ),
          const SizedBox(height: 16),
          error,
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: big, textStyle: const TextStyle(fontSize: 16)),
            onPressed: _busy || _otp.text.trim().isEmpty ? null : _verify,
            child: Text(_busy ? 'Verifying…' : 'Continue'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () {
              _otp.clear();
              _go(_Step.phone);
            },
            child: const Text('← Use a different number', style: TextStyle(fontSize: 16)),
          ),
        ];

      case _Step.name:
        return [
          const _StepProgress(current: 1),
          const SizedBox(height: 20),
          const Text('What should we call you?',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _name,
            autofocus: true,
            maxLength: 64,
            style: const TextStyle(fontSize: 18),
            decoration: const InputDecoration(hintText: 'Alex', counterText: ''),
          ),
          const SizedBox(height: 8),
          Text('This is the name your leaguemates will see.', textAlign: TextAlign.center, style: muted14),
          const SizedBox(height: 20),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: big, textStyle: const TextStyle(fontSize: 16)),
            onPressed: _name.text.trim().isEmpty ? null : () => _go(_Step.terms),
            child: const Text('Next'),
          ),
        ];

      case _Step.terms:
        return [
          const _StepProgress(current: 2),
          const SizedBox(height: 20),
          const Text('Agree to continue',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Please accept both to create your account.', textAlign: TextAlign.center, style: muted14),
          const SizedBox(height: 20),
          _checkBox(c, [
            _check(_agreeTerms, (v) => setState(() => _agreeTerms = v), Text.rich(TextSpan(children: [
              const TextSpan(text: 'I agree to the '),
              legalLink(context, 'Terms of Service', LegalDoc.terms),
              const TextSpan(text: '.'),
            ]))),
            _check(_agreePrivacy, (v) => setState(() => _agreePrivacy = v), Text.rich(TextSpan(children: [
              const TextSpan(text: 'I agree to the '),
              legalLink(context, 'Privacy Policy', LegalDoc.privacy),
              const TextSpan(text: '.'),
            ]))),
          ]),
          const SizedBox(height: 20),
          error,
          Row(children: [
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(0, 56)),
              onPressed: () => _go(_Step.name),
              child: const Text('← Back'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: big, textStyle: const TextStyle(fontSize: 16)),
                onPressed: _busy || _name.text.trim().isEmpty || !(_agreeTerms && _agreePrivacy) ? null : _create,
                child: Text(_busy ? 'Creating…' : 'Create my account'),
              ),
            ),
          ]),
        ];
    }
  }

  Widget _phoneField() => TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        autofillHints: const [AutofillHints.telephoneNumber],
        inputFormatters: [_UsPhoneFormatter()],
        style: const TextStyle(fontSize: 18),
        decoration: const InputDecoration(hintText: '(904) 555-1234'),
      );

  // A bordered box of checkbox rows separated by a divider (web consent cards).
  Widget _checkBox(WaygerzColors c, List<Widget> rows) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(WaygerzRadius.lg),
          border: Border.all(color: c.input),
        ),
        child: Column(children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) ...[
              const SizedBox(height: 16),
              Divider(color: c.border),
              const SizedBox(height: 16),
            ],
            rows[i],
          ],
        ]),
      );

  // The label is not tappable (it may hold links), matching the web's divs.
  Widget _check(bool value, ValueChanged<bool> onChanged, Widget label) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 24,
            height: 24,
            child: Checkbox(value: value, onChanged: (v) => onChanged(v ?? false)),
          ),
          const SizedBox(width: 12),
          Expanded(child: DefaultTextStyle.merge(style: const TextStyle(fontSize: 14, height: 1.5), child: label)),
        ],
      );
}

/// "STEP 1 OF 2" with the progress dots (web StepProgress).
class _StepProgress extends StatelessWidget {
  const _StepProgress({required this.current});
  final int current;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Column(children: [
      Text('STEP $current OF 2',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: c.mutedForeground)),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (final n in [1, 2])
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: n == current ? 24 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: n == current ? c.primary : (n < current ? c.primary.withValues(alpha: 0.6) : c.muted),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
      ]),
    ]);
  }
}

/// US phone mask: "(904) 555-1234" (web formatUsPhone).
class _UsPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var d = newValue.text.replaceAll(RegExp(r'\D'), '');
    // Tolerate a pasted leading country code ("1" / "+1") — drop it.
    if (d.length == 11 && d.startsWith('1')) d = d.substring(1);
    if (d.length > 10) d = d.substring(0, 10);
    final String out;
    if (d.isEmpty) {
      out = '';
    } else if (d.length < 4) {
      out = '($d';
    } else if (d.length < 7) {
      out = '(${d.substring(0, 3)}) ${d.substring(3)}';
    } else {
      out = '(${d.substring(0, 3)}) ${d.substring(3, 6)}-${d.substring(6)}';
    }
    return TextEditingValue(text: out, selection: TextSelection.collapsed(offset: out.length));
  }
}
