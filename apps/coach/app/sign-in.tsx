import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SignInScreen, takeReturnTo, useAuth } from '@spotter/ui/platform';

/** Coach sign-in. Coaches join by an owner's invite or by creating a business; both start here. */
export default function CoachSignIn() {
  const { expired } = useLocalSearchParams<{ expired?: string }>();
  const auth = useAuth();
  useEffect(() => {
    if (auth.status !== 'signedIn') return;
    void takeReturnTo().then((back) => router.replace(back ?? '/clients'));
  }, [auth.status]);
  return (
    <SignInScreen
      title={expired ? 'Sign in again' : 'Spotter Coach'}
      intro="Sign in with the email your clients know you by. We’ll send you a link."
      expired={!!expired}
      returnPath="/coach-app/sign-in"
    />
  );
}
