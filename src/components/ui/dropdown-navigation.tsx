import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownNavigationLinkItem {
  label: string;
  description: string;
  icon?: LucideIcon;
  imageSrc?: string;
  imageAlt?: string;
  href?: string;
  onSelect?: () => void;
}

export interface DropdownNavigationMenuGroup {
  title: string;
  items: DropdownNavigationLinkItem[];
}

export interface DropdownNavigationItem {
  id: number;
  label: string;
  link?: string;
  dotClassName?: string;
  dotStyle?: React.CSSProperties;
  subMenus?: DropdownNavigationMenuGroup[];
  onSelect?: () => void;
}

interface DropdownNavigationProps {
  navItems: DropdownNavigationItem[];
  className?: string;
}

export function DropdownNavigation({ navItems, className }: DropdownNavigationProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);

  const handleLeafItemClick = (
    event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    onSelect?: () => void,
  ) => {
    if (onSelect) {
      event.preventDefault();
      onSelect();
    }

    setOpenMenu(null);
    setHoveredItem(null);
  };

  return (
    <ul className={cn('relative flex items-center gap-2', className)}>
      {navItems.map((navItem) => {
        const isOpen = openMenu === navItem.id;
        const hasSubMenus = Boolean(navItem.subMenus?.length);

        return (
          <li
            key={navItem.id}
            className="relative"
            onMouseEnter={() => {
              setHoveredItem(navItem.id);
              if (hasSubMenus) {
                setOpenMenu(navItem.id);
              }
            }}
            onMouseLeave={() => {
              setHoveredItem(null);
              if (hasSubMenus) {
                setOpenMenu(null);
              }
            }}
            onFocus={() => {
              if (hasSubMenus) {
                setOpenMenu(navItem.id);
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setHoveredItem(null);
                setOpenMenu(null);
              }
            }}
          >
            {hasSubMenus ? (
              <button
                type="button"
                className="nav-link group relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenMenu(isOpen ? null : navItem.id);
                  setHoveredItem(isOpen ? null : navItem.id);
                }}
              >
                {(navItem.dotClassName || navItem.dotStyle) ? (
                  <span className={cn('h-2 w-2 rounded-full', navItem.dotClassName)} style={navItem.dotStyle} aria-hidden="true" />
                ) : null}
                <span>{navItem.label}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                />
                {(hoveredItem === navItem.id || isOpen) ? (
                  <motion.span
                    layoutId="dropdown-navigation-hover"
                    className="absolute inset-0 -z-10 rounded-full bg-primary/10"
                  />
                ) : null}
              </button>
            ) : navItem.link ? (
              <a
                href={navItem.link}
                className="nav-link group relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3"
                onClick={(event) => handleLeafItemClick(event, navItem.onSelect)}
              >
                {(navItem.dotClassName || navItem.dotStyle) ? (
                  <span className={cn('h-2 w-2 rounded-full', navItem.dotClassName)} style={navItem.dotStyle} aria-hidden="true" />
                ) : null}
                <span>{navItem.label}</span>
                {hoveredItem === navItem.id ? (
                  <motion.span
                    layoutId="dropdown-navigation-hover"
                    className="absolute inset-0 -z-10 rounded-full bg-primary/10"
                  />
                ) : null}
              </a>
            ) : (
              <button
                type="button"
                className="nav-link group relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3"
                onClick={(event) => handleLeafItemClick(event, navItem.onSelect)}
              >
                <span>{navItem.label}</span>
                {hoveredItem === navItem.id ? (
                  <motion.span
                    layoutId="dropdown-navigation-hover"
                    className="absolute inset-0 -z-10 rounded-full bg-primary/10"
                  />
                ) : null}
              </button>
            )}

            <AnimatePresence>
              {isOpen && navItem.subMenus ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute top-full z-50 pt-3"
                  style={{ insetInlineStart: 0 }}
                >
                  <div className="w-max rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-[0_18px_40px_rgba(23,23,23,0.08)]">
                    <div className="flex flex-wrap gap-8">
                      {navItem.subMenus.map((subMenu) => (
                        <div key={subMenu.title} className="min-w-64 max-w-72">
                          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#A3A3A3]">
                            {subMenu.title}
                          </h3>
                          <ul className="space-y-3">
                            {subMenu.items.map((item) => {
                              const Icon = item.icon;
                              const fallbackInitial = item.label.trim().charAt(0).toUpperCase() || '?';

                              return (
                                <li key={item.label}>
                                  <a
                                    href={item.href ?? '#'}
                                    className="group flex items-start gap-3 rounded-xl p-2 transition-colors duration-200 hover:bg-[#FAFAFA]"
                                    onClick={(event) => handleLeafItemClick(event, item.onSelect)}
                                  >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E5E5] text-[#171717] transition-colors duration-200 group-hover:border-[#D93A3A] group-hover:bg-[#FFF5F5] group-hover:text-[#D93A3A]">
                                      {item.imageSrc ? (
                                        <img
                                          src={item.imageSrc}
                                          alt={item.imageAlt ?? item.label}
                                          className="h-8 w-8 rounded-lg object-cover"
                                        />
                                      ) : Icon ? (
                                        <Icon className="h-4 w-4" />
                                      ) : (
                                        <span className="text-xs font-semibold">{fallbackInitial}</span>
                                      )}
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold text-[#171717]">
                                        {item.label}
                                      </span>
                                      <span className="mt-1 block text-xs leading-5 text-[#737373] transition-colors duration-200 group-hover:text-[#171717]">
                                        {item.description}
                                      </span>
                                    </span>
                                  </a>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}