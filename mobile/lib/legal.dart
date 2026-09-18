/// Legal copy and version shared with the web
/// (web/components/legal/legal-content.tsx). Keep the text and the version in
/// sync: the backend records `tos_version` with each signup.
library;

const legalVersion = '2026-08-01';
const legalContact = 'support@waygerz.com';

/// Consent card (new numbers): required before the first text — the sign-in
/// code — is sent.
const smsAccountConsent =
    'I agree to receive text messages from Waygerz at this number — including one-time sign-in codes and '
    'account & bet alerts (challenges, results, and reminders). Message frequency varies. Message and data '
    'rates may apply. Reply STOP to opt out, HELP for help, or email $legalContact.';

const smsTransactionalConsent =
    'I agree to receive account and bet-related text messages from Waygerz — bet challenges, results, and '
    'reminders — at the number provided. These alerts are optional and not a condition of using Waygerz. '
    'Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help, or '
    'email $legalContact.';

const smsMarketingConsent =
    'I agree to receive occasional promotional and marketing text messages from Waygerz. Consent is not a '
    'condition of using Waygerz. Message and data rates may apply. Message frequency varies. Reply STOP to '
    'opt out, HELP for help, or email $legalContact.';
