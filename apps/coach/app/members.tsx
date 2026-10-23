import { Redirect } from 'expo-router';

/**
 * The old "Members to talk to" screen. Who to check in with is now Clients → Check in, logging
 * a check-in is on client detail, and who stayed is on Me → Your business. Old links land on the list.
 */
export default function MembersRedirect() {
  return <Redirect href="/clients?filter=attention" />;
}
