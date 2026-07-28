import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';

enum _Step { phone, otp, name }

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
  String? _ticket;
  String? _devOtp;
  bool _busy = false;
  String? _error;

  AuthController get _auth => context.read<AuthController>();

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      setState(() => _error = _humanize(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() => _run(() async {
        final dev = await _auth.startOtp(_phone.text.trim());
        setState(() {
          _devOtp = dev;
          _step = _Step.otp;
        });
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

  Future<void> _complete() =>
      _run(() => _auth.completeSignup(_ticket!, _name.text.trim()));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Waygerz',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 32),
                  ..._stepFields(),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _stepFields() {
    switch (_step) {
      case _Step.phone:
        return [
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Phone number', hintText: '(555) 123-4567'),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _sendCode, child: _label('Send code')),
        ];
      case _Step.otp:
        return [
          if (_devOtp != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Dev code: $_devOtp',
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          TextField(
            controller: _otp,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Verification code'),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _verify, child: _label('Verify')),
        ];
      case _Step.name:
        return [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Your name'),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _complete, child: _label('Create account')),
        ];
    }
  }

  Widget _label(String text) => _busy
      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
      : Text(text);

  String _humanize(Object e) {
    final s = e.toString();
    final i = s.indexOf('): ');
    return i >= 0 ? s.substring(i + 3) : s;
  }

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    _name.dispose();
    super.dispose();
  }
}
