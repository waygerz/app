---
title: "Waygerz Play-Money Contests — How Balances Work"
subtitle: "A plain-language description of how in-app credits are held, wagered, and settled"
date: "September 2026"
---

# Purpose and scope

This document explains, in plain language, how player balances work in the Waygerz
head-to-head contest product **as it operates today**. It is written for legal and
regulatory readers who need to understand how value is represented and moved inside
the system. It describes the current **play-money** product; a companion document
describes the proposed real-money product.

# Summary

- **Play-money only.** All balances are in-app *credits*. They are not currency,
  cannot be purchased, and cannot be redeemed, withdrawn, or exchanged for anything
  of value.
- **No cash enters or leaves the system.** There is no deposit and no withdrawal.
  Credits are issued inside a contest group and stay inside it.
- **Group-scoped.** Credits exist only within a given league (a private contest
  group) and have no meaning or balance outside it.
- **Closed and balanced.** Within a league, ordinary play never creates or destroys
  credits. The only way credits come into existence is an issuance by the league's
  organizer when a member joins.

# Defined terms

Credit
:   The unit of play-money balance. Held internally as a whole number for accounting
    precision and shown to players as a dollar figure purely for familiarity. **A
    credit has no monetary value** and cannot be bought or cashed out.

League
:   A private group of players who compete against one another. A head-to-head
    league carries a balance for each member; a league organizer (the
    "commissioner") administers it.

League balance (or "account")
:   A member's credit balance within one specific league. A member has a separate
    balance in each league they belong to, and those balances are unrelated to one
    another.

Grant
:   The issuance of a starting balance of credits to a member when they join a
    head-to-head league. This is the **only** event that brings new credits into
    existence.

Wager (or "bet")
:   A head-to-head agreement between two members of the same league that one will
    prevail over the other on the outcome of a sporting event, for an agreed number
    of credits (the "stake"). Zero-stake "bragging rights" wagers are also
    permitted, in which no credits move at all.

Stake
:   The number of credits each side commits to a wager. When a wager is in progress,
    each side's stake is **set aside** from their available balance and cannot be
    used elsewhere until the wager resolves.

Ledger
:   A complete, append-only record of every change to every balance. Each entry
    records the amount, the reason, and the resulting balance, so that the full
    history of any balance can always be reconstructed and audited.

# How credits come into existence

Credits enter the system only by a **grant**. When a member joins a head-to-head
league that has been configured with a starting balance, the league organizer issues
that starting balance to the new member. There is no sign-up bonus, no purchase, and
no other source of credits. Leagues that do not involve balances (for example,
prediction-style "pick'em" leagues) issue no credits at all.

Because grants are the sole source of credits, the total credits within a league are
always equal to the sum of everything the organizer has issued. Ordinary play moves
credits between members but never adds to or subtracts from that total.

# How a wager works

A wager is always between two members of the same league and progresses through a
small number of clearly defined states. The table below states, for each step, what
happens to the players' credits.

| Step | What happens to credits | Resulting state |
|---|---|---|
| **Proposal** | The proposer's stake is set aside from their balance. | Open |
| **Acceptance** | The opponent's stake is also set aside. Both stakes are now committed. | Accepted |
| **Decline** | The opponent declines; the proposer's stake is returned in full. | Declined |
| **Withdrawal / expiry** | The proposer withdraws an unaccepted offer, or the event begins before anyone accepts; the proposer's stake is returned in full. | Cancelled |
| **Mutual cancellation** | Both sides agree to call off an accepted wager; both stakes are returned in full. | Cancelled |
| **Settlement — a winner** | The result determines a winner, who receives both stakes. | Settled |
| **Settlement — a tie ("push")** | The result is a tie against the terms of the wager; both stakes are returned in full. | Refunded |
| **Void** | The event is cancelled or does not produce a usable result; both stakes are returned in full. | Refunded |

Two points follow from the table:

- **Once both sides have accepted, neither can back out alone.** Cancelling an
  accepted wager requires the agreement of both members, at which point both stakes
  are returned.
- **The winner receives exactly the two stakes.** Because the winner had already set
  aside their own stake, the net result is that the winner gains one stake and the
  loser loses one stake. If the wager is tied or voided, each side simply gets its
  own stake back and no one is better or worse off.

A zero-stake wager runs through the same steps but moves no credits at any point.

# How settlement occurs

A wager between two members is decided by the outcome of the sporting event, read
from a sports-data feed. Settlement happens in one of two equivalent ways, both
producing the same result:

- **Automatically.** The system periodically checks finished events, determines the
  winner from the final result, and awards the two stakes to the winner. No human
  action is required.
- **By the winner.** The member the result favors may claim the outcome in the app
  before the automatic process reaches it.

If a result cannot be read, the stakes remain set aside and are never lost: the
wager is held until a usable result arrives, a defined grace period allows it to be
voided (returning both stakes), or the two members mutually cancel.

# How balances are protected

The system is built so that credits behave predictably and can always be accounted
for:

- **Credits cannot be created or destroyed by play.** The only source of new credits
  is a grant. Every stake that is set aside is always either awarded to the winner or
  returned in full — so, at rest, each member's balance reflects exactly the credits
  they were granted plus their net winnings and losses.
- **A balance can never go negative.** A member cannot commit credits they do not
  have; an attempt to do so is refused and nothing is moved.
- **Each movement is recorded once.** Every change to a balance is written to the
  append-only ledger with its amount, cause, and resulting balance. The system
  records each movement a single time and prevents duplicate or conflicting
  processing, so a wager is always either settled or refunded — never both.
- **Full auditability.** Because the ledger is append-only and every entry carries
  its cause, the complete history of any balance can be reconstructed at any time.

# When a member leaves

If a member closes their account, any wager in which their credits are still
committed is resolved first, so that no stake is left stranded: an unaccepted offer
is withdrawn and the stake returned; an accepted-but-undecided wager is voided and
both stakes returned; a decided-but-unclaimed wager is awarded to its winner.
Completed wagers are retained as part of the shared contest history.
