import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { identify, registerForPush, rememberReturnTo, startAuth, useAuth } from '@spotter/ui/platform';
import { tenant } from '../env';
import { loadCoachData } from './serverData';
import { useInbox } from './inbox';

const AUTH_ROUTES = ['/sign-in', '/auth'];

/** Coach app platform behaviour (renders nothing): session restore and expiry, data refresh, push registration. */
export function Lifecycle() {
  const auth = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    startAuth();
  }, []);

  useEffect(() => {
    if (auth.status === 'signedOut' && !AUTH_ROUTES.some((r) => pathname.startsWith(r))) router.replace('/sign-in');
    if (auth.status === 'expired' && !AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
      void rememberReturnTo(pathname).then(() => router.replace('/sign-in?expired=1'));
    }
  }, [auth.status, pathname]);

  useEffect(() => {
    if (auth.status !== 'signedIn') return;
    if (auth.userId) identify(auth.userId);
    const run = () => {
      void loadCoachData().catch(() => {});
      void useInbox.getState().loadReplies();
    };
    run();
    void registerForPush(tenant.id, '0.1.0');
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [auth.status, auth.userId]);

  return null;
}
