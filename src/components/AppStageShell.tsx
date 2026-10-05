import { type ReactNode, useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Home, Compass, Plus, Bell, User, Wifi, Battery, Signal } from 'lucide-react';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';

interface AppStageShellProps {
  children: ReactNode;
  activeTab?: string;
  onHomeClick?: () => void;
  onCommunityClick?: () => void;
  /** The mobile "+" action; the caller decides between composer and dashboard. */
  onCreateClick?: () => void;
  onProfileClick?: () => void;
  user?: { name?: string; email?: string; avatar?: string } | null;
}

export function AppStageShell({
  children,
  activeTab = 'home',
  onHomeClick,
  onCommunityClick,
  onCreateClick,
  onProfileClick,
  user,
}: AppStageShellProps) {
  const { deviceMode } = useTheme();
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
    <div className="min-h-screen flex flex-col items-center justify-start py-4 px-2 sm:px-4 md:py-6 max-md:!p-0 transition-colors">
      {/* Main Stage */}
      <div className={`device-stage mode-${deviceMode} w-full`}>
        <div className="app-window" id="app-window">
          {/* Mobile Device Bezel & Dynamic Island (Shown in Mobile Mode) */}
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

          {/* Content Inner Scroll Container */}
          <div className="app-inner-scroll" id="app-inner-scroll">
            {children}
          </div>

          {/* Mobile Bottom Navigation Bar */}
          <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'home' ? 'active' : ''}`}
              title="Feed"
              onClick={() => {
                onHomeClick?.();
              }}
            >
              <Home className="size-5" />
              {activeTab === 'home' && <span className="mobile-nav-dot" />}
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
              aria-label="Create Post or Manage"
              onClick={() => {
                onCreateClick?.();
              }}
            >
              <Plus className="size-5 stroke-[2.5]" />
            </button>

            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'community' ? 'active' : ''}`}
              title="Community"
              onClick={() => {
                onCommunityClick?.();
              }}
            >
              <Bell className="size-5" />
              {activeTab === 'community' && <span className="mobile-nav-dot" />}
            </button>

            <button
              type="button"
              className={`mobile-nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
              title="Profile"
              onClick={() => {
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
