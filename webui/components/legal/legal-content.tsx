import type { ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT LEGAL COPY — starting point, NOT reviewed by counsel.
//
// Before launch, a lawyer should review this. Entity (Wagerz, Inc.), governing
// law (Florida), and contact (support@waygerz.com) are filled in; the only
// remaining placeholder is the liability cap in the Terms, still highlighted.
//
// This is the single source of truth for the Terms of Service and Privacy
// Policy. It renders both on the public /terms and /privacy pages and inside
// the in-app <LegalDialog> so the two never drift.
// ─────────────────────────────────────────────────────────────────────────────

// Bump whenever the substance of either policy changes. Recorded alongside each
// user's acceptance so we know which version they agreed to.
export const LEGAL_VERSION = '2026-08-01';
export const LEGAL_EFFECTIVE = 'August 1, 2026';
export const LEGAL_CONTACT = 'support@waygerz.com';

// Consent copy shown at sign-up. Kept here so the wording stays in sync with the
// SMS terms in the documents below and with what we record server-side.
export const SMS_TRANSACTIONAL_CONSENT =
  'I agree to receive account and bet-related text messages from Waygerz (one-time sign-in codes, bet challenges, results, and reminders) at the number provided. Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.';
export const SMS_MARKETING_CONSENT =
  'I agree to receive occasional promotional and marketing text messages from Waygerz. Consent is not a condition of using Waygerz. Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.';

// ── shared typographic pieces ────────────────────────────────────────────────

export function LegalDoc({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

// Highlighted placeholder — replace before launch.
function PH({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1 font-medium text-amber-600 dark:text-amber-400">
      {children}
    </span>
  );
}

// ── Terms of Service ─────────────────────────────────────────────────────────

export function TermsContent() {
  return (
    <LegalDoc>
      <P>
        These Terms of Service (“Terms”) are a binding agreement between you and{' '}
        Wagerz, Inc. (“Waygerz”, “we”, “us”), governing your use
        of the Waygerz apps and website (the “Service”). By creating an account or using the Service, you
        agree to these Terms and to our{' '}
        <a href="/privacy" className="text-primary underline">
          Privacy Policy
        </a>
        . If you don’t agree, don’t use the Service.
      </P>

      <Sec n={1} title="Who can use Waygerz">
        <P>
          You must be at least 18 years old and legally able to enter this agreement. Waygerz is intended
          for use in the United States. You’re responsible for complying with the laws that apply to you.
        </P>
      </Sec>

      <Sec n={2} title="Waygerz is play-money — not gambling">
        <P>
          Waygerz is a social sports pick’em and head-to-head game played with virtual “credits.”{' '}
          <strong className="font-semibold text-foreground">
            Credits have no monetary value, cannot be purchased, and cannot be redeemed, withdrawn, or
            exchanged for cash, prizes, or anything of value.
          </strong>{' '}
          Waygerz is for entertainment among friends only and is not a real-money wagering, betting, or
          gambling service. You may not use the Service to place, broker, or settle real-money bets.
        </P>
      </Sec>

      <Sec n={3} title="Your account">
        <P>
          You sign in with your mobile phone number and a one-time code. Keep your device and number
          secure — you’re responsible for activity under your account. Provide accurate information, keep
          it current, and don’t impersonate anyone or create an account for someone else. One account per
          person.
        </P>
      </Sec>

      <Sec n={4} title="Leagues, picks, and wagers">
        <UL
          items={[
            'Leagues are created and run by their members. A commissioner may set rules, invite or remove members, schedule weeks, and moderate content.',
            'Picks and head-to-head wagers use play-money credits only, and are settled based on real-world sports results.',
            'Sports schedules, odds lines, scores, and results come from third-party data that may be delayed, incomplete, or incorrect. We don’t guarantee its accuracy and aren’t liable for settlement outcomes based on it.',
            'We may correct obvious errors, void picks affected by data problems, or reverse settlements to keep play fair.',
          ]}
        />
      </Sec>

      <Sec n={5} title="Acceptable use">
        <P>You agree not to:</P>
        <UL
          items={[
            'use the Service for any unlawful purpose, including real-money gambling;',
            'harass, threaten, defraud, or abuse other users;',
            'cheat, exploit bugs, manipulate results, or use bots or automated access;',
            'post content that is illegal, infringing, hateful, or obscene; or',
            'interfere with, reverse-engineer, or attempt to gain unauthorized access to the Service.',
          ]}
        />
      </Sec>

      <Sec n={6} title="Text messages (SMS)">
        <P>
          By providing your phone number and agreeing at sign-up, you consent to receive text messages
          from Waygerz. This includes account and service messages (such as one-time sign-in codes, bet
          challenges, results, and reminders), and — only if you separately opt in — promotional messages.
          Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> to opt
          out or <strong>HELP</strong> for help. Carriers are not liable for delayed or undelivered
          messages. Opting out of marketing messages does not stop essential account and security
          messages, including one-time sign-in codes. See the{' '}
          <a href="/privacy" className="text-primary underline">
            Privacy Policy
          </a>{' '}
          for how we handle your number.
        </P>
      </Sec>

      <Sec n={7} title="Your content">
        <P>
          You keep ownership of the content you post (messages, names, images). You grant Waygerz a
          non-exclusive, worldwide, royalty-free license to host, display, and use that content as needed
          to operate the Service. Don’t post content you don’t have the right to share.
        </P>
      </Sec>

      <Sec n={8} title="Termination">
        <P>
          You may stop using Waygerz at any time. We may suspend or terminate your access if you violate
          these Terms or to protect the Service or other users. Sections that by their nature should
          survive termination (including disclaimers, liability limits, and indemnification) will survive.
        </P>
      </Sec>

      <Sec n={9} title="Disclaimers">
        <P>
          The Service is provided “as is” and “as available,” without warranties of any kind, whether
          express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We don’t warrant that the Service will be uninterrupted, secure, or error-free,
          or that sports data will be accurate.
        </P>
      </Sec>

      <Sec n={10} title="Limitation of liability">
        <P>
          To the fullest extent permitted by law, Waygerz and its operators will not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or for any loss arising from
          your use of the Service. Because Waygerz uses no-value play-money credits, our total liability
          for any claim is limited to <PH>[amount, e.g. USD $100]</PH>.
        </P>
      </Sec>

      <Sec n={11} title="Indemnification">
        <P>
          You agree to indemnify and hold Waygerz harmless from claims, losses, and expenses (including
          reasonable legal fees) arising out of your content, your use of the Service, or your violation of
          these Terms.
        </P>
      </Sec>

      <Sec n={12} title="Changes to these Terms">
        <P>
          We may update these Terms from time to time. If we make material changes, we’ll take reasonable
          steps to let you know. Your continued use after changes take effect means you accept the updated
          Terms.
        </P>
      </Sec>

      <Sec n={13} title="Governing law">
        <P>
          These Terms are governed by the laws of the State of Florida, United States, without regard to
          its conflict-of-laws rules. Disputes will be resolved in the state or federal courts located in
          Florida, unless applicable law requires otherwise.
        </P>
      </Sec>

      <Sec n={14} title="Contact">
        <P>
          Questions about these Terms? Contact us at {LEGAL_CONTACT}.
        </P>
      </Sec>
    </LegalDoc>
  );
}

// ── Privacy Policy ───────────────────────────────────────────────────────────

export function PrivacyContent() {
  return (
    <LegalDoc>
      <P>
        This Privacy Policy explains how Wagerz, Inc. (“Waygerz”, “we”, “us”)
        collects, uses, and shares information when you use the Waygerz apps and website (the “Service”).
      </P>

      <Sec n={1} title="Information we collect">
        <UL
          items={[
            <>
              <strong className="text-foreground">Account information</strong> — your mobile phone number
              (used to sign in), display name, and optional profile photo.
            </>,
            <>
              <strong className="text-foreground">Activity</strong> — the leagues you join, your picks and
              head-to-head wagers, play-money credit history, messages, and reactions.
            </>,
            <>
              <strong className="text-foreground">Device &amp; usage data</strong> — app version, device
              type, IP address, and log data we use to operate and secure the Service.
            </>,
          ]}
        />
      </Sec>

      <Sec n={2} title="How we use information">
        <UL
          items={[
            'to provide the Service — run leagues, settle play-money wagers, and show standings;',
            'to authenticate you and secure your account, including sending one-time sign-in codes;',
            'to send account and service text messages, and — only with your separate opt-in — marketing texts;',
            'to keep Waygerz safe, prevent fraud and abuse, and enforce our Terms; and',
            'to fix problems and improve the Service.',
          ]}
        />
      </Sec>

      <Sec n={3} title="Text messages (SMS)">
        <P>
          We use your phone number to send one-time sign-in codes and, based on your consent, account and
          promotional messages. You can opt out of any category by replying <strong>STOP</strong>, or
          manage your preferences in Account settings. Opting out of marketing does not stop essential
          account and security messages, including sign-in codes.{' '}
          <strong className="text-foreground">
            We do not sell your phone number, and we do not share it with third parties for their own
            marketing.
          </strong>
        </P>
      </Sec>

      <Sec n={4} title="How we share information">
        <UL
          items={[
            <>
              <strong className="text-foreground">With other users</strong> — your display name, photo, and
              in-league activity are visible to members of leagues you join.
            </>,
            <>
              <strong className="text-foreground">Service providers</strong> — vendors that help us operate
              Waygerz, such as our SMS provider (Twilio) and cloud hosting (Amazon Web Services), who may
              process data on our behalf.
            </>,
            <>
              <strong className="text-foreground">Legal &amp; safety</strong> — when required by law or to
              protect the rights, safety, and property of Waygerz and its users.
            </>,
            <>
              <strong className="text-foreground">Business transfers</strong> — in connection with a
              merger, acquisition, or sale of assets.
            </>,
          ]}
        />
        <P>We do not sell your personal information.</P>
      </Sec>

      <Sec n={5} title="Data retention">
        <P>
          We keep your information for as long as your account is active and as needed to provide the
          Service, comply with legal obligations, resolve disputes, and enforce our agreements. You can ask
          us to delete your account (see “Your choices”).
        </P>
      </Sec>

      <Sec n={6} title="Security">
        <P>
          We use reasonable technical and organizational measures to protect your information. No method of
          transmission or storage is completely secure, so we can’t guarantee absolute security.
        </P>
      </Sec>

      <Sec n={7} title="Your choices">
        <UL
          items={[
            'Update your display name and photo in Account settings.',
            'Manage which text messages you receive in Account settings, or reply STOP.',
            <>
              Request access to or deletion of your account by contacting {LEGAL_CONTACT}.
            </>,
          ]}
        />
      </Sec>

      <Sec n={8} title="Children">
        <P>
          Waygerz is not directed to anyone under 18, and we don’t knowingly collect information from
          children. If you believe a child has given us information, contact us and we’ll delete it.
        </P>
      </Sec>

      <Sec n={9} title="Changes to this policy">
        <P>
          We may update this Privacy Policy from time to time. If we make material changes, we’ll take
          reasonable steps to notify you. The “effective” date below shows when this version took effect.
        </P>
      </Sec>

      <Sec n={10} title="Contact">
        <P>
          Questions about your privacy? Contact us at {LEGAL_CONTACT}.
        </P>
      </Sec>
    </LegalDoc>
  );
}
