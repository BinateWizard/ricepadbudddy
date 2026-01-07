# Header Consistency Guidelines

## Problem Summary
Previously, some pages had duplicate or unused `Banner` component imports that caused rendering issues, particularly an empty green div appearing on the varieties page. This happened because pages had inconsistent header structures.

## Solution
Created standardized, reusable components to ensure consistent headers and menus across all pages.

## Standardized Components

### 1. PageHeader Component
**Location**: `components/PageHeader.tsx`

**Purpose**: Provides the sticky navigation bar at the top of all main pages.

**Features**:
- PadBuddy logo with animated pulse indicator
- Search button
- Notification bell
- Menu hamburger button
- Consistent gradient styling
- Sticky positioning at top

**Usage**:
```tsx
import { PageHeader } from "@/components/PageHeader";

<PageHeader 
  onMenuClick={() => setIsMenuOpen(true)}
  onSearchClick={() => setIsSearchModalOpen(true)}
/>
```

### 2. PageTitleSection Component
**Location**: `components/PageHeader.tsx`

**Purpose**: Provides the scrollable page title section below the navigation bar.

**Features**:
- Icon, title, and description
- Consistent gradient styling matching navigation
- Rounded bottom corners
- Scrolls away while navigation stays sticky

**Usage**:
```tsx
import { PageTitleSection } from "@/components/PageHeader";
import { BookOpen } from "lucide-react";

<PageTitleSection
  icon={<BookOpen className="h-7 w-7 text-white" />}
  title="Rice Varieties"
  description="Explore different rice varieties and their characteristics"
/>
```

### 3. SidebarMenu Component
**Location**: `components/SidebarMenu.tsx`

**Purpose**: Provides the standardized hamburger menu with consistent styling and behavior.

**Features**:
- User profile section with red logout button
- Navigation links (My Fields, Rice Varieties, Help, About)
- Settings button
- Theme toggle (Light, Dark, System)
- Footer with copyright
- Green focus indicators for active page
- Respects page visibility settings

**Usage**:
```tsx
import { SidebarMenu } from "@/components/SidebarMenu";

const [isMenuOpen, setIsMenuOpen] = useState(false);
const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

<SidebarMenu
  isOpen={isMenuOpen}
  onClose={() => setIsMenuOpen(false)}
  onLogout={() => setIsLogoutModalOpen(true)}
/>
```

## Implementation Checklist

When creating a new main page or updating an existing one:

- [ ] **Remove any Banner component imports** - The Banner component is deprecated
- [ ] **Use PageHeader for navigation** - Don't create custom navigation bars
- [ ] **Use PageTitleSection for page titles** - Ensures consistent styling
- [ ] **Use SidebarMenu for hamburger menu** - Don't duplicate menu code
- [ ] **Keep menu and search state in page component** - Use `useState` for `isMenuOpen` and `isSearchModalOpen`
- [ ] **Ensure logout modal is properly wired** - Pass logout handler to SidebarMenu

## Example Page Structure

```tsx
'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { PageHeader, PageTitleSection } from "@/components/PageHeader";
import { SidebarMenu } from "@/components/SidebarMenu";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { MyIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search } from "lucide-react";

export default function MyPage() {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      // Redirect handled by AuthContext
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
        {/* Navigation Bar - Sticky */}
        <PageHeader
          onMenuClick={() => setIsMenuOpen(true)}
          onSearchClick={() => setIsSearchModalOpen(true)}
        />
        
        {/* Page Title Section - Scrollable */}
        <PageTitleSection
          icon={<MyIcon className="h-7 w-7 text-white" />}
          title="My Page Title"
          description="My page description"
        />

        {/* Main Content */}
        <div className="w-full px-2 sm:px-4 lg:px-8 py-8">
          {/* Your content here */}
        </div>

        {/* Search Modal */}
        <Sheet open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Search</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border-0 shadow-md focus:ring-2 focus:ring-green-200 bg-white focus:outline-none"
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sidebar Menu */}
        <SidebarMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onLogout={() => setIsLogoutModalOpen(true)}
        />

        {/* Logout Confirmation Modal */}
        <Dialog open={isLogoutModalOpen} onOpenChange={setIsLogoutModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl bg-white animate-fade-in">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">Sign Out</DialogTitle>
              <DialogDescription className="text-gray-600">
                Are you sure you want to sign out of PadBuddy?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLogoutModalOpen(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleSignOut}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing Out..." : "Sign Out"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
```

## Pages Using Standardized Components

The following pages should eventually be migrated to use these components:

### Already Updated (without components, but consistent):
- ✅ `/app/page.tsx` - Main dashboard (removed unused Banner import)
- ✅ `/app/varieties/page.tsx` - Rice varieties
- ✅ `/app/help/page.tsx` - Help & support
- ✅ `/app/about/page.tsx` - About page

### To Be Migrated:
These pages can optionally be updated to use the standardized components:
- `/app/device/[id]/page.tsx` - Device detail page
- `/app/field/[id]/page.tsx` - Field detail page
- `/app/overview/page.tsx` - Overview page

### Custom Headers (Do Not Change):
These pages have specialized headers and should keep their custom implementations:
- Admin pages (`/app/admin/*`)
- Auth pages (`/app/auth/*`)

## Benefits

1. **Consistency**: All main pages have identical headers and menus
2. **Maintainability**: One place to update header/menu styling
3. **Prevention**: Impossible to have duplicate or conflicting headers
4. **DRY Principle**: No code duplication across pages
5. **Type Safety**: TypeScript ensures correct prop usage
6. **Accessibility**: Consistent keyboard navigation and ARIA labels

## Testing Checklist

After implementing or updating a page:

- [ ] Navigation bar appears at top and stays sticky
- [ ] Page title section appears below navigation and scrolls away
- [ ] Menu opens when hamburger button clicked
- [ ] All navigation links work correctly
- [ ] Active page is highlighted in green
- [ ] Red logout button appears next to profile
- [ ] Logout confirmation modal works
- [ ] Search modal opens when search button clicked
- [ ] No duplicate headers or empty divs appear
- [ ] Theme toggle buttons are visible and functional
- [ ] Page respects visibility settings from Firestore

## Common Mistakes to Avoid

1. ❌ **Don't import Banner component** - It's deprecated
2. ❌ **Don't create custom navigation bars** - Use PageHeader
3. ❌ **Don't duplicate menu code** - Use SidebarMenu
4. ❌ **Don't mix header implementations** - Be consistent
5. ❌ **Don't forget logout handler** - Wire it properly to SidebarMenu

## Migration Guide

To migrate an existing page to use standardized components:

1. Replace custom navigation with `<PageHeader>`
2. Replace custom page title with `<PageTitleSection>`
3. Replace custom sidebar with `<SidebarMenu>`
4. Ensure state variables are properly connected
5. Remove any Banner component imports or usage
6. Test all functionality

## Questions?

If you're unsure about header implementation:
1. Check this document first
2. Look at `/app/page.tsx` as the reference implementation
3. Use the standardized components when possible
4. Maintain consistency across all pages
