import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatReleaseDate, formatSize, RELEASES, releaseUrl } from '@/lib/releases';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Android app',
  description: 'Download the Waygerz Android app (APK).',
};

export default function ReleasePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10">
      <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Waygerz
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Waygerz for Android</h1>
        <p className="text-sm text-muted-foreground">
          Download the APK and open it on your phone. Android may ask you to allow installs from your browser
          the first time.
        </p>
      </header>

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">Version</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="pe-4 text-end">
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RELEASES.map((r, i) => (
              <TableRow key={r.file}>
                <TableCell className="ps-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">v{r.version}</span>
                    {i === 0 && (
                      <Badge variant="primary" appearance="light" size="sm">
                        Latest
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-muted-foreground">
                  {formatReleaseDate(r.date)}
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-muted-foreground">{formatSize(r.sizeBytes)}</TableCell>
                <TableCell className="pe-4 py-3 text-end">
                  <a
                    href={releaseUrl(r)}
                    download
                    className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}
                    aria-label={`Download Waygerz ${r.version} APK`}
                  >
                    <Download className="size-4" />
                    Download
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
