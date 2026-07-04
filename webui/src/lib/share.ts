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
  const body = text ? `${text}\n${url}` : url;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: body, url });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(body);
    return 'copied';
  }

  throw new Error('Sharing is not supported on this device');
}