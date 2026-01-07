'use client';

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Home as HomeIcon, BookOpen, HelpCircle, Info, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePageVisibility } from "@/lib/hooks/usePageVisibility";

interface SidebarMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

/**
 * Standardized sidebar menu for all main pages
 * This component ensures consistent menu styling and behavior
 * preventing duplicate code and inconsistencies
 */
export function SidebarMenu({ isOpen, onClose, onLogout }: SidebarMenuProps) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { visibility } = usePageVisibility();

  const handleNavigation = (path: string) => {
    router.push(path);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[280px] sm:w-[320px] bg-gradient-to-br from-green-50 via-white to-emerald-50 border-l border-green-200/50 p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-green-200/50">
          <SheetTitle className="text-xl font-bold text-gray-800 ui-heading-mono">
            Menu
          </SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 flex flex-col min-h-0 px-5 py-4">
          {/* User Profile */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-green-200/50">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || user.email || "User"}
                className="w-11 h-11 rounded-full object-cover ring-2 ring-primary/20 shadow-md"
              />
            ) : (
              <div className="w-11 h-11 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center ring-2 ring-primary/20 shadow-md">
                <span className="text-primary-foreground font-semibold text-base">
                  {user?.displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-gray-800">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-600">Rice Farmer</p>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLogout();
              }}
              className="p-2 rounded-lg hover:bg-red-100 transition-colors group"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5 text-red-500 group-hover:text-red-700 transition-colors" />
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 py-4 space-y-1.5 overflow-y-auto min-h-0">
            <Button
              variant={pathname === '/' ? "default" : "ghost"}
              className={`w-full justify-start transition-all duration-200 relative ${
                pathname === '/' 
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                  : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
              }`}
              onClick={() => handleNavigation('/')}
            >
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                pathname === '/' ? 'bg-green-300' : 'bg-transparent'
              }`} />
              <HomeIcon className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                pathname === '/' ? 'scale-110' : 'group-hover:scale-110'
              }`} />
              <span className="font-medium">My Fields</span>
            </Button>
            
            <Button
              variant={pathname === '/varieties' ? "default" : "ghost"}
              className={`w-full justify-start transition-all duration-200 relative ${
                pathname === '/varieties' 
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                  : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
              }`}
              onClick={() => handleNavigation('/varieties')}
            >
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                pathname === '/varieties' ? 'bg-green-300' : 'bg-transparent'
              }`} />
              <BookOpen className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                pathname === '/varieties' ? 'scale-110' : 'group-hover:scale-110'
              }`} />
              <span className="font-medium">Rice Varieties</span>
            </Button>
            
            {visibility.helpPageVisible && (
              <Button
                variant={pathname === '/help' ? "default" : "ghost"}
                className={`w-full justify-start transition-all duration-200 relative ${
                  pathname === '/help' 
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                    : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                }`}
                onClick={() => handleNavigation('/help')}
              >
                <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                  pathname === '/help' ? 'bg-green-300' : 'bg-transparent'
                }`} />
                <HelpCircle className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                  pathname === '/help' ? 'scale-110' : 'group-hover:scale-110'
                }`} />
                <span className="font-medium">Help & Support</span>
              </Button>
            )}
            
            {visibility.aboutPageVisible && (
              <Button
                variant={pathname === '/about' ? "default" : "ghost"}
                className={`w-full justify-start transition-all duration-200 relative ${
                  pathname === '/about' 
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                    : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                }`}
                onClick={() => handleNavigation('/about')}
              >
                <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                  pathname === '/about' ? 'bg-green-300' : 'bg-transparent'
                }`} />
                <Info className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                  pathname === '/about' ? 'scale-110' : 'group-hover:scale-110'
                }`} />
                <span className="font-medium">About PadBuddy</span>
              </Button>
            )}
            
            {/* Divider */}
            <div className="my-3 border-t border-green-200/50" />
            
            {/* Settings */}
            <Button
              variant="ghost"
              className="w-full justify-start transition-all duration-200 relative hover:bg-white/60 hover:text-gray-900 text-gray-700"
              onClick={() => {
                // Settings page navigation - to be implemented
                onClose();
              }}
            >
              <Shield className="mr-3 h-5 w-5" />
              <span className="font-medium">Settings</span>
            </Button>
            
            {/* Theme Toggle Section */}
            <div className="mt-4 pt-3 border-t border-green-200/50">
              <p className="text-xs font-medium text-gray-500 mb-2 px-3">Theme</p>
              <div className="flex items-center justify-center gap-2 px-2">
                <button
                  className="flex-1 p-2.5 rounded-lg hover:bg-white/60 transition-colors group"
                  aria-label="Light mode"
                  title="Light mode"
                >
                  <svg className="w-5 h-5 mx-auto text-gray-600 group-hover:text-yellow-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </button>
                <button
                  className="flex-1 p-2.5 rounded-lg hover:bg-white/60 transition-colors group"
                  aria-label="Dark mode"
                  title="Dark mode"
                >
                  <svg className="w-5 h-5 mx-auto text-gray-600 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                </button>
                <button
                  className="flex-1 p-2.5 rounded-lg hover:bg-white/60 transition-colors group"
                  aria-label="System theme"
                  title="System theme"
                >
                  <svg className="w-5 h-5 mx-auto text-gray-600 group-hover:text-green-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div className="pt-4 pb-2 border-t border-green-200/50 flex-shrink-0">
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-gray-800">PadBuddy</p>
              <p className="text-xs text-gray-500">Smart Rice Farm Management</p>
              <p className="text-xs text-gray-400 mt-2">© 2026 All rights reserved</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
