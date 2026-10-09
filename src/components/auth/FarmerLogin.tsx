/** Farmer portal sign-in. */
import { RoleLoginForm } from './RoleLoginForm';

export function FarmerLogin({ next, verified }: { next?: string; verified?: boolean }) {
  return <RoleLoginForm portal="farmer" next={next} verified={verified} />;
}
