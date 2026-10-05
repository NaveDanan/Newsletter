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
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AccountMenu } from '@/components/AccountMenu';
import { DropdownNavigation, type DropdownNavigationItem } from '@/components/ui/dropdown-navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useNavigationData } from '@/contexts/NavigationDataContext';
import { useCollapsingLabels } from '@/hooks/useCollapsingLabels';
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

// The order in which header labels fold away as the bar narrows.
const FOLD = { search: 1, community: 2, account: 3, brand: 4 } as const;

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
  // The side menu and the account menu share the header, so only one is open.
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const { dropdowns, links: navigationLinks } = useNavigationData();
  const isCommunityRoute = activeTab === 'community';
  const barRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);

  useCollapsingLabels(barRef, FOLD.brand, (level) => {
    // Once the inline field has room again the extra row is redundant.
    if (level < FOLD.search) {
      setIsSearchPanelOpen(false);
    }
  });

  const updateSearch = (value: string) => {
    setSearchQuery(value);
    onSearchChange?.(value);
  };

  const toggleMobileMenu = () => {
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen((open) => !open);
  };

  const handleAccountMenuOpenChange = (open: boolean) => {
    setIsAccountMenuOpen(open);
    if (open) {
      setIsMobileMenuOpen(false);
    }
  };

  const handleSearchToggle = () => {
    if (Number(barRef.current?.dataset.collapse ?? 0) >= FOLD.search) {
      setIsSearchPanelOpen((open) => !open);
      return;
    }
    searchInputRef.current?.focus();
  };

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
      {/* Top bar: labels fold to icons as it narrows, see useCollapsingLabels */}
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div ref={barRef} className="nav-bar flex h-16 items-center gap-3 sm:gap-4">
          {/* Left: Brand Logo & Title */}
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onHomeClick}
              className="flex items-center group text-start"
              aria-label="AI-BREAK Home"
            >
              <div className="brand-logo group-hover:scale-105 transition-transform">
                <img
                  src="/logo.gif"
                  alt="AI-BREAK Logo"
                  className="w-7 h-7 object-contain rounded-lg"
                />
              </div>
              <span className="nav-label" data-collapse-order={FOLD.brand}>
                <span>
                  <span className="flex flex-col ps-3">
                    <span className="font-extrabold text-lg text-[var(--text-primary)] tracking-tight leading-none group-hover:text-[var(--primary-accent)] transition-colors">
                      AI-BREAK
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase mt-1">
                      Newsletter & Community
                    </span>
                  </span>
                </span>
              </span>
            </button>

            <div className="hidden xl:flex items-center gap-5 ms-2">
              {navLinks.filter((link) => link.id !== 'community').map((link) => (
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

          <div data-collapse-slack className="min-w-0 flex-1" />

          {/* Center: Search (folds first) */}
          {!isCommunityRoute ? (
            <div className="nav-search">
              <button
                ref={searchToggleRef}
                type="button"
                className="nav-search-toggle"
                aria-label={t('nav.openSearch')}
                aria-expanded={isSearchPanelOpen}
                onClick={handleSearchToggle}
              >
                <Search className="size-4" aria-hidden="true" />
              </button>
              <span className="nav-label" data-collapse-order={FOLD.search}>
                <span>
                  <span className="block pe-4">
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      placeholder={t('nav.searchPlaceholder')}
                      aria-label={t('nav.searchPlaceholder')}
                      onChange={(event) => updateSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          onSearch?.(searchQuery);
                        }
                      }}
                      className="h-9 w-40 bg-transparent text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
                    />
                  </span>
                </span>
              </span>
            </div>
          ) : null}

          <div data-collapse-slack className="min-w-0 flex-1" />

          {/* Right side controls */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden lg:flex shrink-0 items-center">
              {/* Opens toward the bar's centre so panels never pass its outer edge. */}
              <DropdownNavigation navItems={dropdownNavItems} align="end" />
            </div>

            <button
              type="button"
              onClick={onCommunityClick}
              aria-label={t('nav.community')}
              title={t('nav.community')}
              aria-current={isCommunityRoute ? 'page' : undefined}
              className="nav-pill"
            >
              <Users className="size-4 shrink-0" aria-hidden="true" />
              <span className="nav-label" data-collapse-order={FOLD.community}>
                <span>
                  <span className="block ps-2 pe-0.5">{t('nav.community')}</span>
                </span>
              </span>
            </button>

            <AccountMenu
              onProfileClick={onProfileClick}
              onManagerClick={onManagerClick}
              onSignInClick={onSignInClick}
              onSignOut={onSignOut}
              foldOrder={FOLD.account}
              open={isAccountMenuOpen}
              onOpenChange={handleAccountMenuOpenChange}
            />

            {/* Mobile Hamburger Menu button */}
            <button
              type="button"
              onClick={toggleMobileMenu}
              aria-label={isMobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              className="lg:hidden p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] transition-colors"
            >
              {isMobileMenuOpen ? <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" /> : <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Folded search opens as a row under the bar */}
      {isSearchPanelOpen && !isCommunityRoute ? (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3 animate-in slide-in-from-top-2 duration-200">
          <div className="nav-search w-full">
            <Search className="ms-3 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={searchQuery}
              placeholder={t('nav.searchPlaceholder')}
              aria-label={t('nav.searchPlaceholder')}
              onChange={(event) => updateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSearch?.(searchQuery);
                  setIsSearchPanelOpen(false);
                } else if (event.key === 'Escape') {
                  setIsSearchPanelOpen(false);
                  searchToggleRef.current?.focus();
                }
              }}
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
            />
          </div>
        </div>
      ) : null}

      {/* Mobile dropdown menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden rounded-b-[inherit] border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-4 space-y-3 shadow-2xl animate-in slide-in-from-top-2 duration-200">
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
        </div>
      )}
    </header>
  );
}
