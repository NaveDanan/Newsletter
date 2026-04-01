import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  LogOut,
  Newspaper,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { DropdownNavigation, type DropdownNavigationItem } from '@/components/ui/dropdown-navigation';
import { ExpandingSearchDock } from '@/components/ui/expanding-search-dock-shadcnui';
import { useLocale } from '@/contexts/LocaleContext';
import { useNavigationLinks } from '@/hooks/useNavigationLinks';

interface NavigationProps {
  onManagerClick: () => void;
  onHomeClick: () => void;
  onSignInClick: () => void;
  onSignOut: () => void;
  onSearch?: (query: string) => void;
  onSearchChange?: (query: string) => void;
  isAuthenticated: boolean;
  authName?: string;
}

export function Navigation({
  onManagerClick,
  onHomeClick,
  onSignInClick,
  onSignOut,
  onSearch,
  onSearchChange,
  isAuthenticated,
  authName,
}: NavigationProps) {
  const { t } = useLocale();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { links: navigationLinks } = useNavigationLinks();
  const accountMenuItem = isAuthenticated
    ? {
        label: authName ? `${t('nav.signOut')} (${authName})` : t('navDropdown.resources.accountLabelSignedIn'),
        description: t('navDropdown.resources.accountDescriptionSignedIn'),
        icon: LogOut,
        onSelect: onSignOut,
      }
    : {
        label: t('navDropdown.resources.accountLabelSignedOut'),
        description: t('navDropdown.resources.accountDescriptionSignedOut'),
        icon: LogIn,
        onSelect: onSignInClick,
      };
  const managedResourceItems = navigationLinks.map((link) => ({
    label: link.name,
    description: link.description,
    href: link.url,
    imageSrc: link.iconUrl,
    imageAlt: link.name,
  }));

  const navLinks = [
    { id: 'home', label: t('nav.home'), href: '#', active: true },
    { id: 'topics', label: t('nav.topics'), href: '#topics' },
    { id: 'features', label: t('nav.features'), href: '#features' },
    { id: 'community', label: t('nav.community'), href: '#community' },
  ];
  const dropdownNavItems: DropdownNavigationItem[] = [
    {
      id: 1,
      label: t('nav.aiWorkflows'),
      link: '#workflows',
      dotClassName: 'bg-[#171717]',
      subMenus: [
        {
          title: t('navDropdown.aiWorkflows.groupCoverage'),
          items: [
            {
              label: t('navDropdown.aiWorkflows.latestLabel'),
              description: t('navDropdown.aiWorkflows.latestDescription'),
              icon: Newspaper,
              href: '#workflows',
            },
            {
              label: t('navDropdown.aiWorkflows.featuredLabel'),
              description: t('navDropdown.aiWorkflows.featuredDescription'),
              icon: Sparkles,
              href: '#features',
            },
            {
              label: t('navDropdown.aiWorkflows.popularLabel'),
              description: t('navDropdown.aiWorkflows.popularDescription'),
              icon: BarChart3,
              href: '#case-studies',
            },
          ],
        },
        {
          title: t('navDropdown.aiWorkflows.groupExplore'),
          items: [
            {
              label: t('navDropdown.aiWorkflows.topicsLabel'),
              description: t('navDropdown.aiWorkflows.topicsDescription'),
              icon: LayoutGrid,
              href: '#topics',
            },
            {
              label: t('navDropdown.aiWorkflows.communityLabel'),
              description: t('navDropdown.aiWorkflows.communityDescription'),
              icon: Users,
              href: '#community',
            },
          ],
        },
      ],
    },
    {
      id: 2,
      label: t('nav.caseStudies'),
      link: '#case-studies',
      dotClassName: 'bg-[#D93A3A]',
      subMenus: [
        {
          title: t('navDropdown.caseStudies.groupInsights'),
          items: [
            {
              label: t('navDropdown.caseStudies.featuredLabel'),
              description: t('navDropdown.caseStudies.featuredDescription'),
              icon: Sparkles,
              href: '#features',
            },
            {
              label: t('navDropdown.caseStudies.popularLabel'),
              description: t('navDropdown.caseStudies.popularDescription'),
              icon: Newspaper,
              href: '#case-studies',
            },
          ],
        },
        {
          title: t('navDropdown.caseStudies.groupCommunity'),
          items: [
            {
              label: t('navDropdown.caseStudies.communityLabel'),
              description: t('navDropdown.caseStudies.communityDescription'),
              icon: Users,
              href: '#community',
            },
            {
              label: t('navDropdown.caseStudies.signInLabel'),
              description: t('navDropdown.caseStudies.signInDescription'),
              icon: LogIn,
              onSelect: onSignInClick,
            },
          ],
        },
      ],
    },
    {
      id: 3,
      label: t('nav.resources'),
      link: '#resources',
      dotClassName: 'bg-[#A3A3A3]',
      subMenus: [
        ...(managedResourceItems.length > 0 ? [
          {
            title: t('navDropdown.resources.groupLinks'),
            items: managedResourceItems,
          },
        ] : []),
        {
          title: t('navDropdown.resources.groupReader'),
          items: [
            {
              label: t('navDropdown.resources.topicsLabel'),
              description: t('navDropdown.resources.topicsDescription'),
              icon: LayoutGrid,
              href: '#topics',
            },
            {
              label: t('navDropdown.resources.subscribeLabel'),
              description: t('navDropdown.resources.subscribeDescription'),
              icon: BookOpen,
              href: '#resources',
            },
          ],
        },
        {
          title: t('navDropdown.resources.groupWorkspace'),
          items: [
            {
              label: t('navDropdown.resources.managerLabel'),
              description: t('navDropdown.resources.managerDescription'),
              icon: LayoutDashboard,
              onSelect: onManagerClick,
            },
            accountMenuItem,
          ],
        },
      ],
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E5E5E5]">
      {/* Top bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo with GIF */}
          <button 
            onClick={onHomeClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img 
              src="/logo.gif" 
              alt="AI Maor Break" 
              className="w-16 h-16 object-contain"
            />
            <span className="font-bold text-lg text-[#171717] mt-3">AI-BREAK</span>
          </button>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <ExpandingSearchDock
              onSearch={onSearch}
              onQueryChange={onSearchChange}
              placeholder={t('nav.searchPlaceholder')}
            />
            <LanguageToggleButton className="hidden sm:inline-flex" compact />
            <button 
              onClick={onManagerClick}
              className="hidden sm:block text-sm font-medium text-[#737373] hover:text-[#171717] transition-colors"
            >
              {t('nav.manager')}
            </button>
            {isAuthenticated ? (
              <button
                onClick={onSignOut}
                className="hidden sm:block text-sm font-medium text-[#171717] hover:text-[#D93A3A] transition-colors"
              >
                {authName ? `${t('nav.signOut')} (${authName})` : t('nav.signOut')}
              </button>
            ) : (
              <button
                onClick={onSignInClick}
                className="hidden sm:block text-sm font-medium text-[#171717] hover:text-[#D93A3A] transition-colors"
              >
                {t('nav.signIn')}
              </button>
            )}

            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              className="lg:hidden p-2 text-[#737373]"
            >
              {isMobileMenuOpen ? <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" /> : <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation bar */}
      <nav className="border-t border-[#E5E5E5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6 h-12 overflow-x-auto scrollbar-hide">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.id === 'home' ? '/' : link.href}
                className={`nav-link whitespace-nowrap ${link.active ? 'active' : ''}`}
                onClick={(event) => {
                  if (link.id === 'home') {
                    event.preventDefault();
                    onHomeClick();
                  }
                }}
              >
                {link.label}
              </a>
            ))}
            <DropdownNavigation navItems={dropdownNavItems} />
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E5E5E5] bg-white">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.id === 'home' ? '/' : link.href}
                className="block py-2 text-[#171717] font-medium"
                onClick={(event) => {
                  if (link.id === 'home') {
                    event.preventDefault();
                    onHomeClick();
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
                className="block py-2 text-[#171717] font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2">
              <LanguageToggleButton />
            </div>
            <button 
              onClick={() => {
                onManagerClick();
                setIsMobileMenuOpen(false);
              }}
              className="block py-2 text-[#737373] font-medium"
            >
              {t('nav.manager')}
            </button>
            {isAuthenticated ? (
              <button
                onClick={() => {
                  onSignOut();
                  setIsMobileMenuOpen(false);
                }}
                className="block py-2 text-[#171717] font-medium"
              >
                {t('nav.signOut')}
              </button>
            ) : (
              <button
                onClick={() => {
                  onSignInClick();
                  setIsMobileMenuOpen(false);
                }}
                className="block py-2 text-[#171717] font-medium"
              >
                {t('nav.signIn')}
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
