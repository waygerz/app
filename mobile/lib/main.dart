import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth/auth_controller.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Push (optional): once `flutterfire configure` has been run, add
  //   await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // here, then call PushService(...).register() after sign-in.
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthController()..bootstrap(),
      child: const WaygerzApp(),
    ),
  );
}

class WaygerzApp extends StatelessWidget {
  const WaygerzApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Waygerz',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFF97316)), // brand orange
        useMaterial3: true,
      ),
      home: const _Root(),
    );
  }
}

/// Routes between login and the app shell based on auth status.
class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    switch (auth.status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.signedOut:
        return const LoginScreen();
      case AuthStatus.signedIn:
        return const HomeScreen();
    }
  }
}
