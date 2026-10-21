import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { identify, rememberReturnTo, registerForPush, startAuth, useAuth } from '@spotter/ui/platform';
import { APP_VERSION } from '../env';
import { pull } from './pull';
import { flushUploads } from './messaging';
import { usePulled } from './pulled';

const AUTH_ROUTES = ['/welcome', '/sign-in', '/auth', '/join'];

/**
 * App-wide platform behaviour for the client app (renders nothing):
 *  - restores the session, and on expiry sends the person to sign in, then back to where they were (C-1)
 *  - pulls server changes on start, on reconnect, on foreground and every 2 minutes (GET /sync/pull)
 *  - registers the device for push once signed in
 */
export function Lifecycle() {
  const auth = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    startAuth();
  }, []);

  useEffect(() => {
    if (auth.status !== 'expired') return;
    if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) return;
    void rememberReturnTo(pathname).then(() => router.replace('/sign-in?expired=1'));
  }, [auth.status, pathname]);

  useEffect(() => {
    if (auth.status !== 'signedIn') return;
    if (auth.userId) identify(auth.userId);
    // Offline or server down: keep the cache and the pending uploads, try again later.
    const run = () => {
      void pull().catch(() => {});
      void flushUploads();
    };
    run();
    const tenantId = usePulled.getState().tenantId;
    if (tenantId) void registerForPush(tenantId, APP_VERSION);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    const unNet = NetInfo.addEventListener((s) => s.isConnected && run());
    const timer = setInterval(run, 120_000);
    return () => {
      sub.remove();
      unNet();
      clearInterval(timer);
    };
  }, [auth.status, auth.userId]);

  return null;
}
