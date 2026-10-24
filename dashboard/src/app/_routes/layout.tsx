import { Outlet, type LayoutComponent } from 'rasengan';
import { SessionProvider } from '@/lib/session';

const AppLayout: LayoutComponent = () => {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
};

export default AppLayout;
