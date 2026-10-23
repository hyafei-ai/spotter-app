import { redirect } from 'next/navigation';

/** The old "Members to talk to" page, merged into Keeping clients. Old links and bookmarks land there. */
export default function MembersPage() {
  redirect('/dashboard/retention');
}
