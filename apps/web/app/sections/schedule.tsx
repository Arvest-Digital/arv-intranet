import {
  CalendarDaysIcon,
  CalendarRangeIcon,
  FolderKanbanIcon,
  TreePalmIcon,
  UploadIcon,
  UsersIcon,
} from 'lucide-react';
import { Outlet } from 'react-router';
import {
  canImport,
  canManageEmployeeRecords,
  canReadProjects,
  canViewBoard,
} from '~/features/identity/gate';
import { everyone, type Section, type SectionHandle } from '~/shared/nav/section';
import { PATHS } from '~/shared/paths';

/** Resource scheduling: the board and everything it is planned from. */
export const section: Section = {
  id: 'schedule',
  label: 'Schedule',
  icon: CalendarRangeIcon,
  items: [
    {
      label: 'Schedule',
      to: PATHS.board,
      icon: CalendarRangeIcon,
      end: true,
      visible: canViewBoard,
    },
    // Anyone signed in has an own schedule, or is told how to get one (AC-17, AC-18).
    { label: 'My schedule', to: PATHS.mySchedule, icon: CalendarDaysIcon, visible: everyone },
    { label: 'People', to: PATHS.people, icon: UsersIcon, visible: canManageEmployeeRecords },
    { label: 'Projects', to: PATHS.projects, icon: FolderKanbanIcon, visible: canReadProjects },
    // Anyone signed in reads the holiday list; adding and removing are checked there (AC-28).
    { label: 'Holidays', to: PATHS.holidays, icon: TreePalmIcon, visible: everyone },
    { label: 'Import', to: PATHS.import, icon: UploadIcon, visible: canImport },
  ],
};

export const handle: SectionHandle = { section };

export default function ScheduleSection() {
  return <Outlet />;
}
