'use client';

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, Search } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

interface PageHeaderProps {
  onMenuClick: () => void;
  onSearchClick: () => void;
}

/**
 * Standardized navigation header for all main pages
 * This component ensures consistent header styling across the app
 * and prevents duplicate header issues
 */
export function PageHeader({ onMenuClick, onSearchClick }: PageHeaderProps) {
  return (
    <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 sticky top-0 z-50 shadow-lg">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Image 
                src="/icons/rice_logo.png" 
                alt="PadBuddy" 
                width={36} 
                height={36} 
                className="rounded-lg shadow-sm" 
              />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse"></div>
            </div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
              PadBuddy
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onSearchClick}
              className="hover:bg-white/20 text-white"
            >
              <Search className="h-5 w-5" />
            </Button>
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="hover:bg-white/20 text-white"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

interface PageTitleSectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

/**
 * Standardized page title section that appears below the navigation bar
 * This scrolls away while the navigation stays sticky
 */
export function PageTitleSection({ icon, title, description }: PageTitleSectionProps) {
  return (
    <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-b-3xl pb-6 shadow-lg">
      <div className="w-full px-6 sm:px-8 lg:px-10 pt-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
            {icon}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-1">{title}</h2>
            <p className="text-white/90 text-sm">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
