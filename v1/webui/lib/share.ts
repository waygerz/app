/** Native share sheet (SMS, social apps) with clipboard fallback. */
export async function shareLink({
  url,
  title = 'Waygerz',
  text,
}: {
  url: string;
  title?: string;
  text?: string;
}): Promise<'shared' | 'copied'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      // Keep text and url as SEPARATE fields. Share targets compose them
      // themselves, so handing over a text that already ends in the url makes
      // the link show up twice in the message.
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
    }
  }

  // The clipboard has no separate url field, so compose one string here.
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text ? `${text}\n${url}` : url);
    return 'copied';
  }

  throw new Error('Sharing is not supported on this device');
}