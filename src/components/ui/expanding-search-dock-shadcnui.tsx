import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

type ExpandingSearchDockProps = {
  onSearch?: (query: string) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  expandedWidth?: number | string;
};

export function ExpandingSearchDock({
  onSearch,
  onQueryChange,
  placeholder = 'Search...',
  expandedWidth = 'min(20rem, calc(100vw - 7rem))',
}: ExpandingSearchDockProps) {
  const { isRTL, t } = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    setQuery('');
    onQueryChange?.('');
    onSearch?.('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (onSearch) {
      onSearch(trimmedQuery);
    }
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    onQueryChange?.(nextQuery);
  };

  return (
    <div className="relative">
      <AnimatePresence mode="wait" initial={false}>
        {!isExpanded ? (
          <motion.button
            key="icon"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={handleExpand}
            aria-label={t('nav.openSearch')}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
          >
            <HugeiconsIcon icon={Search01Icon} className="h-5 w-5" />
          </motion.button>
        ) : (
          <motion.form
            key="input"
            initial={{ width: 48, opacity: 0 }}
            animate={{ width: expandedWidth, opacity: 1 }}
            exit={{ width: 48, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
            onSubmit={handleSubmit}
            className="relative max-w-full"
          >
            <motion.div
              initial={{ backdropFilter: 'blur(0px)' }}
              animate={{ backdropFilter: 'blur(12px)' }}
              className="relative flex items-center gap-2 overflow-hidden rounded-full border border-border bg-card/90 backdrop-blur-md"
            >
              <div className={cn('shrink-0', isRTL ? 'mr-4' : 'ml-4')}>
                <HugeiconsIcon icon={Search01Icon} className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    handleCollapse();
                  }
                }}
                placeholder={placeholder}
                autoFocus
                dir={isRTL ? 'rtl' : 'ltr'}
                className={cn(
                  'h-12 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-0 focus:ring-0',
                  isRTL ? 'pl-4 text-right' : 'pr-4 text-left',
                )}
              />
              <motion.button
                type="button"
                onClick={handleCollapse}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                aria-label={t('nav.closeSearch')}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted',
                  isRTL ? 'ml-2' : 'mr-2',
                )}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
              </motion.button>
            </motion.div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
