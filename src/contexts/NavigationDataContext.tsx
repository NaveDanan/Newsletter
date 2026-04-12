import React, { createContext, useContext } from 'react';
import { useNavigationDropdowns, type DropdownStorageMode } from '@/hooks/useNavigationDropdowns';
import { useNavigationLinks, type NavigationLinksStorageMode } from '@/hooks/useNavigationLinks';
import type { NavigationDropdown, NavigationDropdownFormData, NavigationLink, NavigationLinkFormData } from '@/types/navigation-link';

interface NavigationDataContextType {
  // Dropdowns
  dropdowns: NavigationDropdown[];
  dropdownsLoading: boolean;
  dropdownStorageMode: DropdownStorageMode;
  addDropdown: (data: NavigationDropdownFormData) => Promise<NavigationDropdown>;
  updateDropdown: (id: string, data: Partial<NavigationDropdownFormData & { hidden: boolean; order: number }>) => Promise<void>;
  removeDropdown: (id: string) => Promise<void>;
  toggleDropdownVisibility: (id: string) => Promise<void>;
  reorderDropdowns: (ids: string[]) => Promise<void>;
  // Links
  links: NavigationLink[];
  linksLoading: boolean;
  linksError: string | null;
  linksStorageMode: NavigationLinksStorageMode;
  addLink: (data: NavigationLinkFormData) => Promise<NavigationLink | null>;
  updateLink: (id: string, data: NavigationLinkFormData) => Promise<NavigationLink | null>;
  deleteLink: (id: string) => Promise<boolean>;
}

const NavigationDataContext = createContext<NavigationDataContextType | undefined>(undefined);

export function NavigationDataProvider({ children }: { children: React.ReactNode }) {
  const {
    dropdowns,
    isLoading: dropdownsLoading,
    storageMode: dropdownStorageMode,
    addDropdown,
    updateDropdown,
    removeDropdown,
    toggleDropdownVisibility,
    reorderDropdowns,
  } = useNavigationDropdowns();

  const {
    links,
    isLoading: linksLoading,
    error: linksError,
    storageMode: linksStorageMode,
    addLink,
    updateLink,
    deleteLink,
  } = useNavigationLinks();

  return (
    <NavigationDataContext.Provider
      value={{
        dropdowns,
        dropdownsLoading,
        dropdownStorageMode,
        addDropdown,
        updateDropdown,
        removeDropdown,
        toggleDropdownVisibility,
        reorderDropdowns,
        links,
        linksLoading,
        linksError,
        linksStorageMode,
        addLink,
        updateLink,
        deleteLink,
      }}
    >
      {children}
    </NavigationDataContext.Provider>
  );
}

export function useNavigationData(): NavigationDataContextType {
  const ctx = useContext(NavigationDataContext);
  if (!ctx) {
    throw new Error('useNavigationData must be used within NavigationDataProvider');
  }
  return ctx;
}
