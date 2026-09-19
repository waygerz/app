'use client';

import type { ReactNode } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function CloseButton({ className }: { className?: string }) {
  return (
    <DrawerPrimitive.Close
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
      aria-label="Close"
    >
      <X className="size-5" />
    </DrawerPrimitive.Close>
  );
}

/**
 * The app's one sheet: slides up from the bottom inside the phone column, with
 * a drag handle (swipe down to close), a header — bold title, optional
 * description, and a close button or `action` — a scrolling body, and an
 * optional pinned `footer` (buttons, a composer). Use it for anything people
 * read or fill in. Short yes/no confirms stay an `AlertDialog`.
 *
 * Mirrors the app's `showWzSheet` (mobile/lib/ui/sheet.dart) — change both
 * together.
 */
export function AppSheet({
  open,
  onOpenChange,
  title,
  description,
  hideHeader = false,
  action,
  footer,
  tall = false,
  bodyClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Keep the title for screen readers only (the body has its own heading). */
  hideHeader?: boolean;
  /** Replaces the close button on the right of the header (e.g. "Post"). */
  action?: ReactNode;
  /** Pinned under the scrolling body. */
  footer?: ReactNode;
  /** A fixed 85% height (lists that load, comments) instead of fitting the content. */
  tall?: boolean;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DrawerPrimitive.Content
          className={cn(
            'app-column fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border border-b-0 border-border bg-background pb-[env(safe-area-inset-bottom)] outline-none',
            tall && 'h-[85dvh]',
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
          <div className={cn('flex shrink-0 items-start gap-3 px-4 pb-3 pt-2', hideHeader && 'sr-only')}>
            <div className="min-w-0 flex-1">
              <DrawerPrimitive.Title className="text-base font-bold text-foreground">{title}</DrawerPrimitive.Title>
              {description ? (
                <DrawerPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                  {description}
                </DrawerPrimitive.Description>
              ) : (
                <DrawerPrimitive.Description className="sr-only">{title}</DrawerPrimitive.Description>
              )}
            </div>
            {!hideHeader && (action ?? <CloseButton className="-me-2 -mt-1" />)}
          </div>
          {/* A hidden header still needs a visible way out for mouse users. */}
          {hideHeader && <CloseButton className="absolute end-2 top-3 z-10" />}
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 pb-4', bodyClassName)}>{children}</div>
          {footer && <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
