/** Buyer portal sign-in. */
import { RoleLoginForm } from './RoleLoginForm';

export function BuyerLogin({ next, verified }: { next?: string; verified?: boolean }) {
  return <RoleLoginForm portal="buyer" next={next} verified={verified} />;
}
