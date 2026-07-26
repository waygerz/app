// US phone display formatting for input fields. The backend canonicalizes to
// E.164 (US-only) regardless of format, so we only need this for a friendly
// typing experience — users enter 10 digits and see "(904) 555-1234".

export function formatUsPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  // Tolerate a pasted leading country code ("1" / "+1") — drop it.
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  if (digits.length === 0) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
