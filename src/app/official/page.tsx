import { permanentRedirect } from 'next/navigation';

/**
 * KashRoot's official contacts now live inside Help & support (its "Official
 * contacts" section, the one place on the site with the email address). This
 * old address keeps working and goes there.
 */
export default function OfficialPage() {
  permanentRedirect('/support#official');
}
