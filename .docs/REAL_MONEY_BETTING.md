---
title: "Waygerz Real-Money Wagering — How Funds Are Held and Settled"
subtitle: "A plain-language description of the proposed real-money product for legal and regulatory review"
date: "September 2026"
---

# Purpose and scope

This document describes the **proposed** real-money version of the Waygerz
head-to-head wagering product. It is written for legal and regulatory readers and
explains, in plain language, how real customer funds would be held, how a wager
moves those funds, how the platform's fee is calculated, and the consumer-protection
framework within which the product is designed to operate.

It is a description of the intended system for review; it is not a representation
that the product has been launched or licensed. A companion document describes the
current play-money product.

# Summary

- **Real funds.** Balances represent real United States dollars that a customer has
  deposited.
- **Held in a wallet with two parts.** Each customer's balance is tracked as
  *available* funds (spendable and withdrawable) and *held* funds (committed to
  wagers in progress and not withdrawable until those wagers resolve).
- **Peer-to-peer.** Customers wager against one another head-to-head. The platform
  is not a counterparty to any wager; it facilitates the wager and takes a fee.
- **The platform fee.** On each wager that is decided, the platform retains **5% of
  the combined stakes, capped at $1.00**. No fee is taken on any wager that is called
  off, tied, or voided.
- **Funds are conserved.** Money enters and leaves only through deposits and
  withdrawals. Within the system, every wager either pays a winner or returns both
  stakes; nothing is created or lost.

# Defined terms

Wallet
:   A customer's real-money balance on the platform, tracked as *available* funds
    and *held* funds.

Available funds
:   The portion of a customer's wallet that is spendable and may be withdrawn at any
    time, subject to the applicable controls described below.

Held funds
:   The portion of a customer's wallet that is committed to one or more wagers in
    progress. Held funds are ring-fenced: they cannot be spent on other wagers or
    withdrawn until the wager they belong to resolves.

Deposit
:   A transfer of real funds from a customer into their wallet, increasing available
    funds.

Withdrawal
:   A transfer of real funds from a customer's available funds back out to the
    customer.

Stake
:   The amount each side commits to a wager. On acceptance, each side's stake moves
    from available funds to held funds.

Pot
:   The combined stakes of both sides of a wager — that is, twice the stake.

Platform fee (or "rake")
:   The amount the platform retains from a decided wager: 5% of the pot, capped at
    $1.00.

Ledger
:   A complete, append-only record of every movement of funds — deposits,
    withdrawals, stakes, payouts, refunds, and platform fees — each entry recording
    its amount, cause, and resulting balance.

# The wallet: available and held funds

Each customer has a single wallet. Its balance is tracked in two parts:

- **Available funds** are spendable and withdrawable.
- **Held funds** are committed to wagers in progress and are ring-fenced until those
  wagers resolve.

Money enters the wallet only by **deposit** (increasing available funds) and leaves
only by **withdrawal** (reducing available funds). A customer may only ever withdraw
available funds; funds committed to a live wager cannot be withdrawn until that wager
resolves. This ensures a wager in progress can never be double-spent or cashed out
from under the other party.

# How a wager works

A wager is between two customers and progresses through a small number of clearly
defined states. The table states, for each step, what happens to the parties' funds.
Throughout, "stake" is the amount each side commits and "pot" is the two stakes
combined.

| Step | What happens to funds | Fee taken? | Resulting state |
|---|---|---|---|
| **Proposal** | The proposer's stake moves from available to held. | No | Open |
| **Acceptance** | The opponent's stake also moves from available to held. | No | Accepted |
| **Decline** | The opponent declines; the proposer's held stake returns to available. | No | Declined |
| **Withdrawal / expiry** | An unaccepted offer is withdrawn, or the event begins first; the proposer's held stake returns to available. | No | Cancelled |
| **Mutual cancellation** | Both sides agree to call off an accepted wager; both held stakes return to available. | No | Cancelled |
| **Settlement — a winner** | The winner receives the pot minus the platform fee; the platform retains the fee. | **Yes** | Settled |
| **Settlement — a tie ("push")** | Both held stakes return to available. | No | Refunded |
| **Void** | The event is cancelled or produces no usable result; both held stakes return to available. | No | Refunded |

Key points:

- **A fee is taken only when there is a winner.** Every outcome in which a wager is
  called off, tied, or voided returns both stakes in full and the platform retains
  nothing.
- **The fee is borne by the winner**, deducted from the pot they receive. Because the
  winner had already committed their own stake, the net effect of a win is that the
  winner gains one stake less the fee, and the loser loses one stake.
- **On a win, the losing side's held stake is not returned** — it forms part of the
  pot paid to the winner. It is returned only where a wager is called off, tied, or
  voided.

# The platform fee

On each wager that is **decided** (has a winner), the platform retains a fee of:

> **5% of the pot, capped at a maximum of $1.00.**

The pot is the two stakes combined. Because 5% of the pot reaches $1.00 when each
side stakes $10 (a $20 pot), the fee is a true 5% on smaller wagers and a flat $1.00
on any wager at or above that size. The following examples show the effect across a
range of stakes:

| Stake (each side) | Pot | 5% of pot | Fee retained | Winner receives | Fee as % of pot |
|---:|---:|---:|---:|---:|---:|
| $1 | $2 | $0.10 | $0.10 | $1.90 | 5.0% |
| $5 | $10 | $0.50 | $0.50 | $9.50 | 5.0% |
| $10 | $20 | $1.00 | $1.00 | $19.00 | 5.0% |
| $25 | $50 | $2.50 | $1.00 | $49.00 | 2.0% |
| $100 | $200 | $10.00 | $1.00 | $199.00 | 0.5% |

The $1.00 cap means the fee never exceeds one dollar, however large the wager, so the
fee as a proportion of the pot falls as the stakes rise.

# Worked example

Two customers each deposit $100. One proposes a $10 wager, the other accepts, and the
first wins. The pot is $20, so the fee is the capped $1.00.

| Step | Winner (available / held) | Loser (available / held) | Platform |
|---|---|---|---|
| Both deposit $100 | $100.00 / $0 | $100.00 / $0 | $0 |
| Proposal ($10 staked) | $90.00 / $10.00 | $100.00 / $0 | $0 |
| Acceptance ($10 staked) | $90.00 / $10.00 | $90.00 / $10.00 | $0 |
| Settlement (winner paid, fee retained) | $109.00 / $0 | $90.00 / $0 | $1.00 |

The winner ends $9 ahead ($10 won, less the $1 fee), the loser ends $10 behind, and
the platform retains $1. The parties collectively part with exactly the fee; had the
wager been tied or voided, both would have returned to $100 and the platform would
have retained nothing.

# How funds are protected

The system is designed so that funds behave predictably and can always be accounted
for:

- **Funds are conserved.** Money enters and leaves only through deposits and
  withdrawals. For any decided wager, the pot is paid out in full as the winner's
  proceeds plus the platform's fee; for any other outcome, both stakes are returned.
  Nothing is created or lost inside the system.
- **Balances cannot go negative.** A customer cannot commit funds they do not have;
  an attempt to do so is refused and nothing moves.
- **Committed funds are ring-fenced.** Only available funds may be withdrawn; funds
  held against a live wager cannot be spent again or withdrawn until the wager
  resolves.
- **Each movement is recorded once.** Every movement is written to the append-only
  ledger with its amount, cause, and resulting balance. The system records each
  movement a single time and prevents duplicate or conflicting processing, so a
  wager is always either settled or refunded — never both, and a winner is never
  paid twice.
- **Full auditability.** Because the ledger is append-only and every entry carries
  its cause, the complete history of any wallet, and of the platform's fee income,
  can be reconstructed at any time.

# Regulatory framework and consumer protections

The real-money product is designed to operate within the applicable regulatory
framework and to incorporate standard consumer protections, including:

- **Eligibility and identity.** Customer identity verification and age eligibility
  checks, and restriction of access to permitted jurisdictions, before any
  real-money activity.
- **Custody of funds.** Customer funds held by a licensed payments and custody
  partner in an account segregated from the platform's operating funds.
- **Anti-money-laundering.** Monitoring and controls consistent with applicable
  anti-money-laundering obligations, including limits and review of unusual activity.
- **Responsible gambling.** Tools such as deposit, loss, and session limits,
  cool-off periods, and self-exclusion.
- **Fee transparency.** Clear disclosure to both parties of the platform fee before
  and after a wager.

The specific implementation of these controls is being determined in consultation
with counsel and the relevant partners and is outside the scope of this document.

# Relationship to the play-money product

The real-money product reuses the same head-to-head wager structure and the same
append-only, single-recording ledger as the existing play-money product. The
material additions for real money are: real deposits and withdrawals; the split of
each wallet into available and held funds; the platform fee; and the regulatory and
consumer-protection framework — the last two both described above.
