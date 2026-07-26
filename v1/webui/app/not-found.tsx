import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-4 text-center">
      <div>
        <p className="text-3xl font-bold text-foreground">Page not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          That page doesn’t exist or has moved.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Back to Waygerz</Link>
      </Button>
    </div>
  );
}
