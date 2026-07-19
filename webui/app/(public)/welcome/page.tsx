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
    chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    ring: 'hover:border-violet-500/50',
  },
  {
    icon: Trophy,
    title: "Weekly Pick'em",
    body: 'Pick winners each week and climb the standings. Bragging rights on the line, no credits needed.',
    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    ring: 'hover:border-amber-500/50',
  },
  {
    icon: Users,
    title: 'Friends only',
    body: 'You play in private leagues with people you invite — never against strangers.',
    chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    ring: 'hover:border-emerald-500/50',
  },
];

const STEPS = [
  {
    n: 1,
    title: 'Sign in with your phone',
    body: 'Enter your number and the code we text you. No passwords, no email.',
    grad: 'from-violet-500 to-fuchsia-500',
  },
  {
    n: 2,
    title: 'Start or join a league',
    body: 'Create a league and invite friends, or join theirs with a code.',
    grad: 'from-sky-500 to-cyan-500',
  },
  {
    n: 3,
    title: 'Make your picks',
    body: 'Bet head-to-head or fill out your weekly card, then watch the standings.',
    grad: 'from-emerald-500 to-teal-500',
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
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-8 w-auto" />
          <span className="text-lg font-bold text-primary">Waygerz</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        {/* Decorative gradient glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/30 via-fuchsia-500/20 to-brand/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-24 -z-10 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-56 -z-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl"
        />

        <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 text-center sm:px-6 sm:pt-16 sm:pb-24">
          <Badge
            variant="secondary"
            appearance="light"
            className="mb-5 border border-brand/30 bg-brand/10 text-brand"
          >
            <ShieldCheck className="size-3.5" /> Private, invite-only leagues
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Sports betting with{' '}
            <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-brand bg-clip-text text-transparent">
              your friends.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Start a private league, challenge your friends head-to-head, or run a weekly
            pick’em pool — and see who comes out on top.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              variant="primary"
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-fuchsia-600 shadow-lg shadow-primary/25 hover:opacity-90 sm:w-auto"
            >
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
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border border-border bg-card p-6 transition-colors ${f.ring}`}
            >
              <div
                className={`flex size-12 items-center justify-center rounded-xl ${f.chip}`}
              >
                <f.icon className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
            Up and running in a couple of minutes.
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div
                  className={`mx-auto flex size-12 items-center justify-center rounded-full bg-gradient-to-br ${s.grad} text-lg font-bold text-white shadow-md`}
                >
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two ways to play */}
      <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Two ways to play</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
          Pick a format when you create your league — or run one of each.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {/* Head-to-Head */}
          <div className="relative mt-6 flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 sm:mt-0">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <Swords className="size-5" />
              </span>
              <h3 className="text-lg font-semibold">Head-to-Head</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">1v1 challenges for credits.</p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm">
              {[
                'Challenge any friend on any game',
                'Both sides stake league credits',
                'Winner takes the pot',
                'Each member starts with the same balance',
              ].map((li) => (
                <li key={li} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-violet-500" />
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Pick'em */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Trophy className="size-5" />
              </span>
              <h3 className="text-lg font-semibold">Weekly Pick&rsquo;em</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Pool play for bragging rights.</p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm">
              {[
                'Everyone picks the same slate each week',
                'Most correct wins the week',
                'Season-long standings',
                'No credits — purely for pride',
              ].map((li) => (
                <li key={li} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-amber-500" />
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
                className="group rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
              >
                <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
                  {f.q}
                  <ArrowRight className="size-4 text-primary transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA — vibrant gradient band */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-fuchsia-600 to-brand px-6 py-16 text-center text-white shadow-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl"
          />
          <Ticket className="mx-auto size-9" />
          <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Ready to make it interesting?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/90">
            Grab your friends, start a league, and let the season sort out who really knows ball.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-6 bg-white text-primary shadow-lg hover:bg-white/90"
          >
            <Link href="/login">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
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
