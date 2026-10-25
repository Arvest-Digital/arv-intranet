import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useFetcher } from 'react-router';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';
import { parseTheme, type Theme } from './theme';
import { THEME_FETCHER_KEY, useTheme } from './use-theme';

const OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

export function ThemeToggle() {
  const theme = useTheme();
  const fetcher = useFetcher({ key: THEME_FETCHER_KEY });
  const Icon = OPTIONS.find((o) => o.value === theme)?.icon ?? MonitorIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Change theme" />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) =>
            fetcher.submit({ theme: parseTheme(value) }, { method: 'post', action: '/theme' })
          }
        >
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <ItemIcon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
