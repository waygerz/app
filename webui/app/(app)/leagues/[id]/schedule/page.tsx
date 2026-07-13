'use client';

// Schedule is now combined into the Play page — keep this path working for old
// links by redirecting.
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/leagues/${id}/play`);
  }, [id, router]);
  return null;
}
