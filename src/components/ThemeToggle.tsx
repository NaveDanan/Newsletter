import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, MoonIcon, Sun01Icon } from "@hugeicons/core-free-icons";
import { useTheme } from '../context/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <HugeiconsIcon icon={Sun01Icon} className="w-4 h-4 text-amber-500" />;
      case 'dark':
        return <HugeiconsIcon icon={MoonIcon} className="w-4 h-4 text-[#00F0FF]" />;
      case 'system':
        return <HugeiconsIcon icon={ComputerIcon} className="w-4 h-4 text-[#A7B0C8]" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Toggle theme"
        >
          {getIcon()}
          <span className="text-xs text-[#64748b] dark:text-[#A7B0C8] hidden sm:inline">
            {getLabel()}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="min-w-[140px] bg-white dark:bg-[#111318] border border-[#e2e8f0] dark:border-white/10"
      >
        <DropdownMenuItem 
          onClick={() => setTheme('light')}
          className={`flex items-center gap-2 cursor-pointer ${
            theme === 'light' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : ''
          }`}
        >
          <HugeiconsIcon icon={Sun01Icon} className="w-4 h-4" />
          <span>Light</span>
          {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-2 cursor-pointer ${
            theme === 'dark' ? 'bg-[#00F0FF]/10 text-[#00F0FF]' : ''
          }`}
        >
          <HugeiconsIcon icon={MoonIcon} className="w-4 h-4" />
          <span>Dark</span>
          {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme('system')}
          className={`flex items-center gap-2 cursor-pointer ${
            theme === 'system' ? 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#F5F7FF]' : ''
          }`}
        >
          <HugeiconsIcon icon={ComputerIcon} className="w-4 h-4" />
          <span>System</span>
          {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
