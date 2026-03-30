import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { ExpandingSearchDock } from '@/components/ui/expanding-search-dock-shadcnui';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', href: '#', active: true },
    { label: 'Topics', href: '#topics' },
    { label: 'Features', href: '#features' },
    { label: 'Community', href: '#community' },
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
              placeholder="Search newsletters..."
            />
            <button 
              onClick={onManagerClick}
              className="hidden sm:block text-sm font-medium text-[#737373] hover:text-[#171717] transition-colors"
            >
              Manager
            </button>
            {isAuthenticated ? (
              <button
                onClick={onSignOut}
                className="hidden sm:block text-sm font-medium text-[#171717] hover:text-[#D93A3A] transition-colors"
              >
                {authName ? `Sign Out (${authName})` : 'Sign Out'}
              </button>
            ) : (
              <button
                onClick={onSignInClick}
                className="hidden sm:block text-sm font-medium text-[#171717] hover:text-[#D93A3A] transition-colors"
              >
                Sign In
              </button>
            )}

            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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
                href={link.label === 'Home' ? '/' : link.href}
                className={`nav-link whitespace-nowrap ${link.active ? 'active' : ''}`}
                onClick={(event) => {
                  if (link.label === 'Home') {
                    event.preventDefault();
                    onHomeClick();
                  }
                }}
              >
                {link.label}
              </a>
            ))}
            <a href="#workflows" className="nav-link whitespace-nowrap flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#171717]"></span>
              AI Workflows
            </a>
            <a href="#case-studies" className="nav-link whitespace-nowrap flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#D93A3A]"></span>
              Case Studies
            </a>
            <a href="#resources" className="nav-link whitespace-nowrap flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#A3A3A3]"></span>
              Resources
            </a>
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
                href={link.label === 'Home' ? '/' : link.href}
                className="block py-2 text-[#171717] font-medium"
                onClick={(event) => {
                  if (link.label === 'Home') {
                    event.preventDefault();
                    onHomeClick();
                  }
                  setIsMobileMenuOpen(false);
                }}
              >
                {link.label}
              </a>
            ))}
            <button 
              onClick={() => {
                onManagerClick();
                setIsMobileMenuOpen(false);
              }}
              className="block py-2 text-[#737373] font-medium"
            >
              Manager
            </button>
            {isAuthenticated ? (
              <button
                onClick={() => {
                  onSignOut();
                  setIsMobileMenuOpen(false);
                }}
                className="block py-2 text-[#171717] font-medium"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => {
                  onSignInClick();
                  setIsMobileMenuOpen(false);
                }}
                className="block py-2 text-[#171717] font-medium"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
