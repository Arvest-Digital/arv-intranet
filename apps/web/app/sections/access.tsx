import { KeyRoundIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import { Outlet } from 'react-router';
import { canManageAccess } from '~/features/identity/gate';
import type { Section, SectionHandle } from '~/shared/nav/section';
import { PATHS } from '~/shared/paths';

/** Who may sign in and what they may do (AC-08). */
export const section: Section = {
  id: 'access',
  label: 'Access & users',
  icon: ShieldCheckIcon,
  items: [
    { label: 'Users', to: PATHS.accessUsers, icon: UsersIcon, visible: canManageAccess },
    { label: 'Roles', to: PATHS.accessRoles, icon: KeyRoundIcon, visible: canManageAccess },
  ],
};

export const handle: SectionHandle = { section };

export default function AccessSection() {
  return <Outlet />;
}
