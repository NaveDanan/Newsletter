import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  UserRound,
  Newspaper,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccountMenu } from '@/components/AccountMenu';
import { DropdownNavigation, type DropdownNavigationItem } from '@/components/ui/dropdown-navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useNavigationData } from '@/contexts/NavigationDataContext';
import { DEFAULT_DROPDOWN_IDS, SEED_DROPDOWNS } from '@/types/navigation-link';

interface NavigationProps {
  onManagerClick: () => void;
  onHomeClick: () => void;
  onCommunityClick: () => void;
  onSignInClick: () => void;
  onProfileClick: () => void;
  onSignOut: () => void;
  onSearch?: (query: string) => void;
  onSearchChange?: (query: string) => void;
  isAuthenticated: boolean;
  authName?: string;
  activeTab?: 'home' | 'topics' | 'bookmarks' | 'community' | string;
}

function normalizeDropdownLabel(value: string): string {
  return value.trim().toLowerCase();
}

function resolveBuiltinDropdownId(id: string, label: string): string | null {
  if (Object.values(DEFAULT_DROPDOWN_IDS).includes(id as (typeof DEFAULT_DROPDOWN_IDS)[keyof typeof DEFAULT_DROPDOWN_IDS])) {
    return id;
  }

  const normalizedLabel = normalizeDropdownLabel(label);
  const seed = SEED_DROPDOWNS.find((entry) => normalizeDropdownLabel(entry.label) === normalizedLabel);
  return seed?.id ?? null;
}

export function Navigation({
  onManagerClick,
  onHomeClick,
  onCommunityClick,
  onSignInClick,
  onProfileClick,
  onSignOut,
  onSearch,
  onSearchChange,
  isAuthenticated,
  authName,
  activeTab = 'home',
}: NavigationProps) {
  const { t } = useLocale();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { dropdowns, links: navigationLinks } = useNavigationData();
  const isCommunityRoute = activeTab === 'community';

  const resolvedDropdowns = useMemo(() => {
    const items = [...dropdowns];
    const itemIds = new Set(items.map((dd) => dd.id));
    const itemLabels = new Set(items.map((dd) => normalizeDropdownLabel(dd.label)));

    for (const seed of SEED_DROPDOWNS) {
      if (!itemIds.has(seed.id) && !itemLabels.has(normalizeDropdownLabel(seed.label))) {
        items.push(seed);
      }
    }

    return items.sort((a, b) => a.order - b.order);
  }, [dropdowns]);

  const visibleDropdowns = useMemo(
    () => resolvedDropdowns.filter((dropdown) => !dropdown.hidden),
    [resolvedDropdowns],
  );

  const fallbackDropdownId = visibleDropdowns.find((dd) => dd.id === DEFAULT_DROPDOWN_IDS.resources)?.id
    ?? visibleDropdowns[0]?.id
    ?? DEFAULT_DROPDOWN_IDS.resources;

  const resolvedLinksByDropdownId = useMemo(() => {
    const resolvedDropdownsById = new Map(resolvedDropdowns.map((dropdown) => [dropdown.id, dropdown]));
    const builtinDropdownTargets = new Map<string, { id: string; hidden: boolean }>();
    const groupedLinks = new Map<string, typeof navigationLinks>();

    for (const dropdown of visibleDropdowns) {
      groupedLinks.set(dropdown.id, []);
    }

    for (const dropdown of resolvedDropdowns) {
      const builtinId = resolveBuiltinDropdownId(dropdown.id, dropdown.label);
      if (builtinId && !builtinDropdownTargets.has(builtinId)) {
        builtinDropdownTargets.set(builtinId, { id: dropdown.id, hidden: dropdown.hidden });
      }
    }

    for (const link of navigationLinks) {
      if (link.hidden) {
        continue;
      }

      const directDropdown = resolvedDropdownsById.get(link.dropdownId);
      if (directDropdown) {
        if (directDropdown.hidden) {
          continue;
        }

        const bucket = groupedLinks.get(directDropdown.id);
        if (bucket) {
          bucket.push(link);
        }

        continue;
      }

      const builtinTarget = builtinDropdownTargets.get(link.dropdownId);
      if (builtinTarget) {
        if (builtinTarget.hidden) {
          continue;
        }

        const bucket = groupedLinks.get(builtinTarget.id);
        if (bucket) {
          bucket.push(link);
        }

        continue;
      }

      const resolvedDropdownId = fallbackDropdownId;
      const bucket = groupedLinks.get(resolvedDropdownId);
      if (!bucket) {
        groupedLinks.set(resolvedDropdownId, [link]);
        continue;
      }

      bucket.push(link);
    }

    for (const bucket of groupedLinks.values()) {
      bucket.sort((a, b) => a.order - b.order);
    }

    return groupedLinks;
  }, [fallbackDropdownId, navigationLinks, resolvedDropdowns, visibleDropdowns]);

  const accountMenuItem = isAuthenticated
    ? {
        label: authName ?? t('navDropdown.resources.accountLabelSignedIn'),
        description: t('navDropdown.resources.accountDescriptionSignedIn'),
        icon: UserRound,
        onSelect: onProfileClick,
      }
    : {
        label: t('navDropdown.resources.accountLabelSignedOut'),
        description: t('navDropdown.resources.accountDescriptionSignedOut'),
        icon: LogIn,
        onSelect: onSignInClick,
      };

  // Build hardcoded structural items for the 3 default dropdown IDs
  const builtinSubMenus: Record<string, { title: string; items: { label: string; description: string; icon?: typeof Newspaper; imageSrc?: string; imageAlt?: string; href?: string; onSelect?: () => void }[] }[]> = {
    [DEFAULT_DROPDOWN_IDS.aiWorkflows]: [
      {
        title: t('navDropdown.aiWorkflows.groupCoverage'),
        items: [
          { label: t('navDropdown.aiWorkflows.latestLabel'), description: t('navDropdown.aiWorkflows.latestDescription'), icon: Newspaper, href: '#workflows' },
          { label: t('navDropdown.aiWorkflows.featuredLabel'), description: t('navDropdown.aiWorkflows.featuredDescription'), icon: Sparkles, href: '#features' },
          { label: t('navDropdown.aiWorkflows.popularLabel'), description: t('navDropdown.aiWorkflows.popularDescription'), icon: BarChart3, href: '#case-studies' },
        ],
      },
      {
        title: t('navDropdown.aiWorkflows.groupExplore'),
        items: [
          { label: t('navDropdown.aiWorkflows.topicsLabel'), description: t('navDropdown.aiWorkflows.topicsDescription'), icon: LayoutGrid, href: '#topics' },
          { label: t('navDropdown.aiWorkflows.communityLabel'), description: t('navDropdown.aiWorkflows.communityDescription'), icon: Users, href: '/community', onSelect: onCommunityClick },
        ],
      },
    ],
    [DEFAULT_DROPDOWN_IDS.caseStudies]: [
      {
        title: t('navDropdown.caseStudies.groupInsights'),
        items: [
          { label: t('navDropdown.caseStudies.featuredLabel'), description: t('navDropdown.caseStudies.featuredDescription'), icon: Sparkles, href: '#features' },
          { label: t('navDropdown.caseStudies.popularLabel'), description: t('navDropdown.caseStudies.popularDescription'), icon: Newspaper, href: '#case-studies' },
        ],
      },
      {
        title: t('navDropdown.caseStudies.groupCommunity'),
        items: [
          { label: t('navDropdown.caseStudies.communityLabel'), description: t('navDropdown.caseStudies.communityDescription'), icon: Users, href: '/community', onSelect: onCommunityClick },
          { label: t('navDropdown.caseStudies.signInLabel'), description: t('navDropdown.caseStudies.signInDescription'), icon: LogIn, onSelect: onSignInClick },
        ],
      },
    ],
    [DEFAULT_DROPDOWN_IDS.resources]: [
      {
        title: t('navDropdown.resources.groupReader'),
        items: [
          { label: t('navDropdown.resources.topicsLabel'), description: t('navDropdown.resources.topicsDescription'), icon: LayoutGrid, href: '#topics' },
          { label: t('navDropdown.resources.subscribeLabel'), description: t('navDropdown.resources.subscribeDescription'), icon: BookOpen, href: '#resources' },
        ],
      },
      {
        title: t('navDropdown.resources.groupWorkspace'),
        items: [
          { label: t('navDropdown.resources.managerLabel'), description: t('navDropdown.resources.managerDescription'), icon: LayoutDashboard, onSelect: onManagerClick },
          accountMenuItem,
        ],
      },
    ],
  };

  // Build dynamic dropdown items from managed dropdowns + links
  const dropdownNavItems: DropdownNavigationItem[] = visibleDropdowns.map((dd, idx) => {
    const ddLinks = resolvedLinksByDropdownId.get(dd.id) ?? [];

    const managedItems = ddLinks.map((link) => ({
      label: link.name,
      description: link.description,
      href: link.url,
      imageSrc: link.iconUrl,
      imageAlt: link.name,
    }));

    const builtin = builtinSubMenus[resolveBuiltinDropdownId(dd.id, dd.label) ?? ''] ?? [];
    const subMenus = [
      ...(managedItems.length > 0 ? [{ title: t('navDropdown.resources.groupLinks'), items: managedItems }] : []),
      ...builtin,
    ];

    return {
      id: idx + 1,
      label: dd.label,
      link: '#',
      dotStyle: { backgroundColor: dd.dotColor },
      subMenus,
    };
  });

  const navLinks = [
    { id: 'home', label: t('nav.home'), href: '/', active: activeTab === 'home' },
    { id: 'topics', label: t('nav.topics'), href: '/#topics', active: activeTab === 'topics' },
    { id: 'bookmarks', label: t('nav.bookmarks'), href: '/#workflows', active: activeTab === 'bookmarks' },
    { id: 'community', label: t('nav.community'), href: '/community', active: activeTab === 'community' },
  ];

  return (
    <header className="app-floating-header">
      {/* Top bar */}
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Brand Logo & Title */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={onHomeClick}
              className="flex items-center gap-3 group text-start"
              aria-label="AI-BREAK Home"
            >
              <div className="brand-logo group-hover:scale-105 transition-transform">
                <img 
                  src="/logo.gif" 
                  alt="AI-BREAK Logo" 
                  className="w-7 h-7 object-contain rounded-lg"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg text-[var(--text-primary)] tracking-tight leading-none group-hover:text-[var(--primary-accent)] transition-colors">
                  AI-BREAK
                </span>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase mt-1">
                  Newsletter & Community
                </span>
              </div>
            </button>

            <div className="hidden xl:flex items-center gap-5 ms-2">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className={`nav-link whitespace-nowrap text-xs sm:text-sm ${link.active ? 'active' : ''}`}
                  onClick={(event) => {
                    if (link.id === 'home') {
                      event.preventDefault();
                      onHomeClick();
                      return;
                    }

                    if (link.id === 'community') {
                      event.preventDefault();
                      onCommunityClick();
                      return;
                    }

                    if (link.id === 'topics' || link.id === 'bookmarks') {
                      if (activeTab !== 'home') {
                        event.preventDefault();
                        onHomeClick();
                        window.location.hash = link.href.replace('/#', '#');
                      }
                    }
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden md:flex items-center justify-center flex-1 mx-4">
            {!isCommunityRoute && (
              <div className="relative w-full max-w-[260px]">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-bold text-sm pointer-events-none">
                  #
                </span>
                <input
                  type="text"
                  placeholder={t('nav.searchPlaceholder') || 'Search newsletters, topics...'}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSearch?.(e.currentTarget.value);
                    }
                  }}
                  className="w-full h-10 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-full ps-8 pe-10 text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary-accent)] focus:ring-2 focus:ring-[var(--primary-accent-glow)] transition-all"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-pill)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] pointer-events-none">
                  /
                </span>
              </div>
            )}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden lg:flex shrink-0 items-center">
              <DropdownNavigation navItems={dropdownNavItems} />
            </div>

            {/* Account / User Menu */}
            <AccountMenu
              onProfileClick={onProfileClick}
              onManagerClick={onManagerClick}
              onSignInClick={onSignInClick}
              onSignOut={onSignOut}
              className="hidden sm:flex"
            />

            {/* Mobile Hamburger Menu button */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              className="lg:hidden p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] transition-colors"
            >
              {isMobileMenuOpen ? <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" /> : <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-4 space-y-3 shadow-2xl animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="block py-2.5 px-3 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] transition-colors"
                onClick={(event) => {
                  if (link.id === 'home') {
                    event.preventDefault();
                    onHomeClick();
                  } else if (link.id === 'community') {
                    event.preventDefault();
                    onCommunityClick();
                  } else if (link.id === 'topics' || link.id === 'bookmarks') {
                    if (activeTab !== 'home') {
                      event.preventDefault();
                      onHomeClick();
                      window.location.hash = link.href.replace('/#', '#');
                    }
                  }

                  setIsMobileMenuOpen(false);
                }}
              >
                {link.label}
              </a>
            ))}
            {dropdownNavItems.map((link) => (
              <a
                key={link.id}
                href={link.link}
                className="block py-2.5 px-3 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)]">
            <AccountMenu
              variant="mobile"
              onProfileClick={() => {
                onProfileClick();
                setIsMobileMenuOpen(false);
              }}
              onManagerClick={() => {
                onManagerClick();
                setIsMobileMenuOpen(false);
              }}
              onSignInClick={() => {
                onSignInClick();
                setIsMobileMenuOpen(false);
              }}
              onSignOut={() => {
                onSignOut();
                setIsMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
