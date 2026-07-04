import { Helmet } from 'react-helmet-async';
import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function AppLayout() {
  return (
    <>
      <Helmet>
        <title>Waygerz</title>
      </Helmet>

      <LayoutProvider
        headerStickyOffset={100}
        style={{
          '--header-height': '90px',
          '--header-height-sticky': '70px',
          '--header-height-mobile': '70px',
        } as React.CSSProperties}
      >
        <Wrapper />
      </LayoutProvider>
    </>
  );
}
