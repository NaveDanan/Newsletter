import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
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
  /** Which edge of its trigger a panel lines up with; `end` opens it toward inline-start. */
  align?: 'start' | 'end';
}

const PANEL_EDGE_GAP_PX = 8;

/** The horizontal span a panel may use: its nearest sideways-clipping ancestor, else the viewport. */
function horizontalBounds(element: HTMLElement): { left: number; right: number } {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowX !== 'visible') {
      const left = node.getBoundingClientRect().left + node.clientLeft;
      return { left, right: left + node.clientWidth };
    }
  }
  return { left: 0, right: document.documentElement.clientWidth };
}

/** The visible panel box. It narrows and shifts sideways so no ancestor clips it. */
function DropdownPanel({ children }: { children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }

    const fit = () => {
      panel.style.translate = '';
      const bounds = horizontalBounds(panel);
      const start = bounds.left + PANEL_EDGE_GAP_PX;
      const end = bounds.right - PANEL_EDGE_GAP_PX;
      panel.style.maxWidth = `${Math.max(0, end - start)}px`;

      const rect = panel.getBoundingClientRect();
      const shift = rect.right > end ? end - rect.right : rect.left < start ? start - rect.left : 0;
      panel.style.translate = shift ? `${shift}px 0` : '';
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div
      ref={panelRef}
      className="w-max rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] backdrop-blur-xl"
    >
      {children}
    </div>
  );
}

export function DropdownNavigation({ navItems, className, align = 'start' }: DropdownNavigationProps) {
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
                  <span
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
                  <span
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
                  <span
                    className="absolute inset-0 -z-10 rounded-full bg-primary/10"
                  />
                ) : null}
              </button>
            )}

              {isOpen && navItem.subMenus ? (
                <div
                  className="absolute top-full z-50 pt-3"
                  style={align === 'end' ? { insetInlineEnd: 0 } : { insetInlineStart: 0 }}
                >
                  <DropdownPanel>
                    <div className="flex flex-wrap gap-8">
                      {navItem.subMenus.map((subMenu) => (
                        <div key={subMenu.title} className="min-w-64 max-w-72">
                          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
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
                                    className="group flex items-start gap-3 rounded-xl p-2 transition-colors duration-200 hover:bg-[var(--bg-card-hover)]"
                                    onClick={(event) => handleLeafItemClick(event, item.onSelect)}
                                  >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200 group-hover:border-[var(--primary-accent)] group-hover:text-[var(--primary-accent)]">
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
                                      <span className="block text-sm font-semibold text-[var(--text-primary)]">
                                        {item.label}
                                      </span>
                                      <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)] transition-colors duration-200 group-hover:text-[var(--text-primary)]">
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
                  </DropdownPanel>
                </div>
              ) : null}
          </li>
        );
      })}
    </ul>
  );
}
