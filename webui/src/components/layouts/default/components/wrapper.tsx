import { Outlet } from 'react-router-dom';
import { Header } from './header';

export function Wrapper() {
  return (
    <>
      <Header />

      <main className="flex w-full min-w-0 max-w-full grow flex-col overflow-x-hidden pt-(--header-height-mobile) lg:pt-(--header-height)" role="content">
        <Outlet />
      </main>
    </>
  );
}
