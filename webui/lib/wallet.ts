// Client for the Waygerz wallet service (cookie session).
import { API } from './api-paths';
import { apiJson } from './http';

const WALLET_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface Wallet {
  account: string;
  user_id: string;
  balance_cents: number;
  updated_at: string;
}

export interface WalletTxn {
  id: string;
  account: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  ref?: string;
  created_at: string;
}

function req<T = any>(path: string): Promise<T> {
  return apiJson<T>(`${WALLET_URL}${path}`);
}

// Balances are league-scoped: account is `league:{leagueId}`.
export async function fetchWallet(account: string): Promise<Wallet> {
  return (await req<{ wallet: Wallet }>(`${API.wallet}/me?account=${encodeURIComponent(account)}`)).wallet;
}

export async function fetchTransactions(account: string): Promise<WalletTxn[]> {
  return (
    await req<{ transactions: WalletTxn[] }>(
      `${API.wallet}/me/transactions?account=${encodeURIComponent(account)}`,
    )
  ).transactions ?? [];
}

// Play-money amounts render with a $ sign (whole dollars drop the cents):
// $10, $10.50, $1,000. Still no cash value — it's league play-money.
export function formatCredits(cents: number): string {
  const whole = cents % 100 === 0;
  return (
    '$' +
    (cents / 100).toLocaleString(undefined, {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
