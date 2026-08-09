import { HeaderLogo } from './header-logo';
import { HeaderToolbar } from './header-toolbar';
import { Navbar } from './navbar';

export function Header() {
  return (
    <header className="dark fixed start-0 end-0 top-0 z-10 flex h-[calc(var(--header-height-mobile)_+_env(safe-area-inset-top))] shrink-0 flex-col items-stretch overflow-hidden border-b border-border backdrop-blur-sm supports-backdrop-filter:bg-background pt-[env(safe-area-inset-top)] lg:h-(--header-height) lg:pt-0 lg:in-data-[header-sticky=true]:h-(--header-height-sticky) pe-[var(--removed-body-scroll-bar-size,0px)]">
      <div className="container flex min-w-0 grow items-center justify-between gap-2 overflow-hidden">
        <HeaderLogo />
        {/* Desktop top-nav; mobile uses the hamburger sheet in HeaderLogo. */}
        <div className="hidden lg:block">
          <Navbar />
        </div>
        <HeaderToolbar />
      </div>
    </header>
  );
}
