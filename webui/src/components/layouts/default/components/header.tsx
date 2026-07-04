import { HeaderLogo } from './header-logo';
import { HeaderToolbar } from './header-toolbar';

export function Header() {
  return (
    <header className="dark fixed start-0 end-0 top-0 z-10 flex h-(--header-height-mobile) shrink-0 flex-col items-stretch overflow-hidden border-b border-border backdrop-blur-sm supports-backdrop-filter:bg-zinc-950 lg:h-(--header-height) lg:in-data-[header-sticky=true]:h-(--header-height-sticky) pe-[var(--removed-body-scroll-bar-size,0px)]">
      <div className="container flex min-w-0 grow items-center justify-between gap-2 overflow-hidden">
        <HeaderLogo />
        <HeaderToolbar />
      </div>
    </header>
  );
}
