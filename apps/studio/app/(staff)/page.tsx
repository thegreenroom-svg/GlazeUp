import { redirect } from 'next/navigation';

// The app opens on the day, not on a tile dashboard you pass through on
// the way to the day. Per Daisy: everyone in the studio already reads the
// Square Appointments calendar fluently, so the calendar is the home
// screen and the whole shift hangs off tapping a session.
export default function StaffHome() {
  redirect('/schedule');
}
