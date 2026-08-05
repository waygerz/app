'use client';

import { useQuery } from '@tanstack/react-query';
import { mediaApi } from './media';

// A stored image is an S3 object key (e.g. "members/leagues/ab/uuid.webp" or
// "members/avatars/..."); resolve it to a short-lived presigned URL. Direct URLs
// (data:, blob:, http) — previews and legacy inline images — pass through.
export function useMediaSrc(value: string | null | undefined): string | null {
  const isKey = !!value && value.startsWith('members/');
  const q = useQuery({
    queryKey: ['media-resolve', value],
    queryFn: () => mediaApi.resolve(value as string),
    enabled: isKey,
    staleTime: 50 * 60_000, // presigned GET lives 60m — refresh before it expires
    gcTime: 55 * 60_000,
    retry: 1,
  });
  if (!value) return null;
  if (!isKey) return value;
  return q.data ?? null;
}
