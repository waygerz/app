import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Users,
  Swords,
  ShieldCheck,
  Smartphone,
  Ticket,
  Check,
  ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Waygerz — Play-money sports betting with friends',
  description:
    'Private sports leagues with your friends. Challenge each other head-to-head or run a weekly pick’em pool. Play money only — all bragging rights, no cash.',
};

const FEATURES = [
  {
    icon: Swords,
    title: 'Head-to-Head',
    body: 'Challenge a friend 1-on-1 on any real game. Both stake league credits, winner takes the pot.',
  },
  {
    icon: Trophy,
    title: "Weekly Pick'em",
    body: 'Pick winners each week and climb the standings. Bragging rights on the line, no credits needed.',
  },
  {
    icon: Users,
    title: 'Friends only',
    body: 'You play in private leagues with people you invite — never against strangers.',
  },
];

const STEPS = [
  {
    n: 1,
    title: 'Sign in with your phone',
    body: 'Enter your number and the code we text you. No passwords, no email.',
  },
  {
    n: 2,
    title: 'Start or join a league',
    body: 'Create a league and invite friends, or join theirs with a code.',
  },
  {
    n: 3,
    title: 'Make your picks',
    body: 'Bet head-to-head or fill out your weekly card, then watch the standings.',
  },
];

const FAQ = [
  {
    q: 'Is this real-money gambling?',
    a: 'No. Waygerz is play-money only. Leagues run on credits that have no cash value — it’s all for bragging rights.',
  },
  {
    q: 'How do I sign in?',
    a: 'With your phone number. We text you a one-time code — there’s no password to remember.',
  },
  {
    q: 'Can anyone join my league?',
    a: 'Only people you invite. Leagues are private; you share a join code or invite link with friends.',
  },
  {
    q: 'What can I bet on?',
    a: 'Real games across the sports your league picks. The commissioner chooses which sports and leagues are in play.',
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-8 w-auto" />
          <span className="text-lg font-bold text-primary">Waygerz</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-14 text-center sm:px-6 sm:pt-16 sm:pb-20">
        <Badge variant="secondary" appearance="light" className="mb-5">
          <ShieldCheck className="size-3.5" /> Play money · all bragging rights
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
          Sports betting with your friends.{' '}
          <span className="text-primary">No real money.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Start a private league, challenge your friends head-to-head, or run a weekly
          pick’em pool. It’s all credits and bragging rights — never cash.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
            <Link href="/login">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          <Smartphone className="mr-1 inline size-3.5 align-[-2px]" />
          Sign in with your phone — we text you a code, no password.
        </p>
      </section>

      {/* Feature cards */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
            Up and running in a couple of minutes.
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* H2H vs Pick'em comparison */}
      <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Two ways to play</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
          Pick a format when you create your league — or run one of each.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {/* Head-to-Head */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Swords className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Head-to-Head</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">1v1 challenges for credits.</p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm">
              {[
                'Challenge any friend on any game',
                'Both sides stake league credits',
                'Winner takes the pot',
                'Each member starts with the same balance',
              ].map((li) => (
                <li key={li} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Pick'em */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Weekly Pick&rsquo;em</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Pool play for bragging rights.</p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm">
              {[
                'Everyone picks the same slate each week',
                'Most correct wins the week',
                'Season-long standings',
                'No credits — purely for pride',
              ].map((li) => (
                <li key={li} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Good to know</h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-border bg-card px-5 py-4"
              >
                <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
                  {f.q}
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
        <Ticket className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Ready to make it interesting?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Grab your friends, start a league, and let the season sort out who really knows ball.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-6">
          <Link href="/login">
            Get started <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-5 w-auto" />
            <span>© {new Date().getFullYear()} Waygerz</span>
          </div>
          <p>Play money only. No real-money wagering. For entertainment among friends.</p>
        </div>
      </footer>
    </div>
  );
}
