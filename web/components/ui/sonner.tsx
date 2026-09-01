'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    // Each toast is filled from the semantic status palette (styles/globals.css):
    // success=green, error=red, warning=amber, info=blue — fixed across light and
    // dark, readable, and brand-exact (no sonner richColors). icon/title/description
    // inherit the toast's foreground so they stay visible on the filled surface.
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          success: 'group-[.toaster]:bg-success group-[.toaster]:text-success-foreground group-[.toaster]:border-success',
          error: 'group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive',
          warning: 'group-[.toaster]:bg-warning group-[.toaster]:text-warning-foreground group-[.toaster]:border-warning',
          info: 'group-[.toaster]:bg-info group-[.toaster]:text-info-foreground group-[.toaster]:border-info',
          icon: 'group-[.toast]:text-current',
          title: 'group-[.toast]:text-current',
          description: 'group-[.toast]:text-current group-[.toast]:opacity-90',
          actionButton: 'group-[.toast]:rounded-md! group-[.toast]:bg-primary group-[.toast]:text-primary-foreground!',
          cancelButton:
            'group-[.toast]:rounded-md! group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground!',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
