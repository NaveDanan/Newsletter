import { type ReactNode, useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';
import { DeviceToggleBar } from './DeviceToggleBar';
import { Home, Compass, Plus, Bell, User, Wifi, Battery, Signal, SlidersHorizontal, ChevronUp } from 'lucide-react';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';

interface AppStageShellProps {
  children: ReactNode;
  activeTab?: string;
  onHomeClick?: () => void;
  onCommunityClick?: () => void;
  onManagerClick?: () => void;
  onProfileClick?: () => void;
  user?: { name?: string; email?: string; avatar?: string } | null;
}

export function AppStageShell({
  children,
  activeTab = 'home',
  onHomeClick,
  onCommunityClick,
  onManagerClick,
  onProfileClick,
  user,
}: AppStageShellProps) {
  const { deviceMode, resolvedTheme } = useTheme();
  const { t } = useLocale();
  const [mobileTab, setMobileTab] = useState<'feed' | 'activity' | 'profile'>('feed');
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState('9:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-4 px-2 sm:px-4 md:py-6 transition-colors">
      {/* Device & Theme Selector Bar — collapsed by default */}
      <button
        type="button"
        onClick={() => setShowControls((open) => !open)}
        aria-expanded={showControls}
        aria-label={showControls ? 'Hide display controls' : 'Show display controls'}
        title={showControls ? 'Hide display controls' : 'Show display controls'}
        className="mb-2 flex size-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 text-[var(--text-secondary)] shadow-[var(--shadow-card)] backdrop-blur-xl transition-colors hover:text-[var(--primary-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)]"
      >
        {showControls ? <ChevronUp className="size-4" /> : <SlidersHorizontal className="size-4" />}
      </button>
      {showControls ? <DeviceToggleBar /> : null}

      {/* Main Stage */}
      <div className={`device-stage mode-${deviceMode} w-full`} data-tab={mobileTab}>
        <div className="app-window" id="app-window">
          {/* 1. Desktop Window Frame (macOS Titlebar) */}
          <div className="desktop-titlebar">
            <div className="window-controls">
              <span className="win-btn win-close" title="Close" />
              <span className="win-btn win-min" title="Minimize" />
              <span className="win-btn win-max" title="Zoom" />
            </div>
            <div className="window-title">
              AI-BREAK — {user?.name || 'Community & Newsletter'} (Desktop App)
            </div>
            <div className="window-badge">1200 × 860px</div>
          </div>

          {/* 2. Mobile Device Bezel & Dynamic Island (Shown in Mobile Mode) */}
          <div className="mobile-top-bezel">
            <span className="mobile-status-time">{currentTime}</span>
            <div className="dynamic-island-notch">
              <div className="island-camera" />
            </div>
            <div className="mobile-status-icons flex items-center gap-1.5 opacity-90">
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <Battery className="size-3.5" />
            </div>
          </div>

          {/* Mobile Segmented Navigation Tabs */}
          <div className="mobile-tabs-bar">
            <button
              type="button"
              className={`mobile-tab-btn ${mobileTab === 'feed' ? 'active' : ''}`}
              onClick={() => {
                setMobileTab('feed');
                onHomeClick?.();
              }}
            >
              Feed
            </button>
            <button
              type="button"
              className={`mobile-tab-btn ${mobileTab === 'activity' ? 'active' : ''}`}
              onClick={() => {
                setMobileTab('activity');
                onCommunityClick?.();
              }}
            >
              Community
            </button>
            <button
              type="button"
              className={`mobile-tab-btn ${mobileTab === 'profile' ? 'active' : ''}`}
              onClick={() => {
                setMobileTab('profile');
                onProfileClick?.();
              }}
            >
              Profile
            </button>
          </div>

          {/* Content Inner Scroll Container */}
          <div className="app-inner-scroll" id="app-inner-scroll">
            {children}
          </div>

          {/* Mobile Bottom Navigation Bar */}
          <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'home' || mobileTab === 'feed' ? 'active' : ''}`}
              title="Feed"
              onClick={() => {
                setMobileTab('feed');
                onHomeClick?.();
              }}
            >
              <Home className="size-5" />
              {(activeTab === 'home' || mobileTab === 'feed') && <span className="mobile-nav-dot" />}
            </button>

            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'topics' ? 'active' : ''}`}
              title="Explore Topics"
              onClick={() => {
                if (window.location.pathname !== '/') {
                  onHomeClick?.();
                }
                window.location.hash = '#topics';
              }}
            >
              <Compass className="size-5" />
              {activeTab === 'topics' && <span className="mobile-nav-dot" />}
            </button>

            {/* Center Floating Action Circle */}
            <button
              type="button"
              className="mobile-create-circle shadow-lg hover:scale-105 active:scale-95 transition-transform"
              title="Create Post or Manage"
              onClick={() => {
                if (onManagerClick) onManagerClick();
              }}
            >
              <Plus className="size-5 stroke-[2.5]" />
            </button>

            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'community' || mobileTab === 'activity' ? 'active' : ''}`}
              title="Community"
              onClick={() => {
                setMobileTab('activity');
                onCommunityClick?.();
              }}
            >
              <Bell className="size-5" />
              {(activeTab === 'community' || mobileTab === 'activity') && <span className="mobile-nav-dot" />}
            </button>

            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'profile' || mobileTab === 'profile' ? 'active' : ''}`}
              title="Profile"
              onClick={() => {
                setMobileTab('profile');
                onProfileClick?.();
              }}
            >
              {user ? (
                <UserAvatarCircle name={user.name} email={user.email} src={user.avatar} size={24} />
              ) : (
                <User className="size-5" />
              )}
            </button>
          </nav>

          {/* Mobile Home Bar Indicator */}
          <div className="mobile-home-indicator" />
        </div>
      </div>
    </div>
  );
}
