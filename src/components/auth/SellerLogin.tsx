/** Seller portal sign-in. */
import { RoleLoginForm } from './RoleLoginForm';

export function SellerLogin({ next, verified }: { next?: string; verified?: boolean }) {
  return <RoleLoginForm portal="seller" next={next} verified={verified} />;
}
