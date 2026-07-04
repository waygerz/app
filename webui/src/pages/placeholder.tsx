export function ComingSoon({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{blurb ?? 'Coming soon.'}</p>
    </div>
  );
}
