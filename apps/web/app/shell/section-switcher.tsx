import type { Me } from '@arv/contracts/identity';
import { CheckIcon, ChevronDownIcon, LayoutGridIcon } from 'lucide-react';
import { Link } from 'react-router';
import { SECTIONS } from '~/sections';
import { type Section, sectionHome, visibleSections } from '~/shared/nav/section';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';

/** The top bar's switch between the app's sections; each opens on its first page the user may see. */
export function SectionSwitcher({ me, current }: { me: Me; current: Section | undefined }) {
  const sections = visibleSections(SECTIONS, me);
  if (sections.length === 0) return null;
  const Icon = current?.icon ?? LayoutGridIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 px-2" />}>
        <Icon aria-hidden="true" />
        <span className="max-sm:sr-only">{current?.label ?? 'Sections'}</span>
        <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sections.map((section) => {
          const isCurrent = section.id === current?.id;
          const ItemIcon = section.icon;
          return (
            <DropdownMenuLinkItem
              key={section.id}
              closeOnClick
              aria-current={isCurrent ? 'page' : undefined}
              render={<Link to={sectionHome(section, me) ?? '/'} />}
            >
              <ItemIcon aria-hidden="true" />
              <span className="flex-1">{section.label}</span>
              {isCurrent ? <CheckIcon aria-hidden="true" /> : null}
            </DropdownMenuLinkItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
