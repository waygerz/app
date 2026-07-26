'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Root error boundary for the App Router. Catches render/runtime errors thrown
// by any route segment below root (the root layout itself is not covered).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-4 text-center">
      <div>
        <p className="text-2xl font-bold text-foreground">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">
          An unexpected error occurred. Try again — if it persists, reload the page.
        </p>
      </div>
      <Button variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
