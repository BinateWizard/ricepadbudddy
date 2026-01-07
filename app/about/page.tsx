'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Menu, Search, HelpCircle, Info, LogOut, Home as HomeIcon, BookOpen, X, Sprout, TrendingUp, Smartphone, BarChart3 } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePageVisibility } from "@/lib/hooks/usePageVisibility";
import { useAboutContent } from "@/lib/hooks/usePageContent";

// Icon mapping for features
const iconMap: { [key: string]: any } = {
  'Field Management': Sprout,
  'Device Monitoring': Smartphone,
  'Growth Tracking': BarChart3,
  'Data Analytics': TrendingUp,
};

export default function AboutPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { visibility, loading: visibilityLoading } = usePageVisibility();
  const { content: aboutContent, loading: contentLoading } = useAboutContent();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Redirect if page is hidden
  useEffect(() => {
    if (!visibilityLoading && !visibility.aboutPageVisible) {
      router.push('/');
    }
  }, [visibility.aboutPageVisible, visibilityLoading, router]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
        {/* Navigation Bar - Sticky */}
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 sticky top-0 z-50 shadow-lg">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Image src="/icons/rice_logo.png" alt="PadBuddy" width={36} height={36} className="rounded-lg shadow-sm" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse"></div>
                </div>
                <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>PadBuddy</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSearchModalOpen(true)}
                  className="hover:bg-white/20 text-white"
                >
                  <Search className="h-5 w-5" />
                </Button>
                <NotificationBell />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(true)}
                  className="hover:bg-white/20 text-white"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </nav>
        
        {/* Page Title Section - Scrollable */}
        <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-b-3xl pb-6 shadow-lg">
          <div className="w-full px-6 sm:px-8 lg:px-10 pt-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <Info className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1">About PadBuddy</h2>
                <p className="text-white/90 text-sm">Smart rice farming assistant designed for Philippine farmers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full px-2 sm:px-4 lg:px-8 py-8">

          {/* Mission Statement */}
          <Card className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 border-0 shadow-md">
            <CardHeader>
              <CardTitle className="text-2xl">Our Mission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 leading-relaxed text-lg">
                {aboutContent.mission}
              </p>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {aboutContent.features.map((feature, index) => {
                const IconComponent = iconMap[feature.title] || Sprout;
                return (
                  <Card key={index} className="hover:shadow-lg transition-all border-0 shadow-md">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                          <IconComponent className="h-6 w-6 text-green-600" />
                        </div>
                        <CardTitle className="text-xl">{feature.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 leading-relaxed">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Benefits */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Choose PadBuddy?</h2>
            <Card>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aboutContent.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="h-2 w-2 rounded-full bg-green-600"></div>
                      </div>
                      <p className="text-gray-700">{benefit}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Team Section - Dynamic */}
          {aboutContent.team && aboutContent.team.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Team</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {aboutContent.team.map((member, index) => (
                  <Card key={index} className="hover:shadow-lg transition-all text-center border-0 shadow-md">
                    <CardContent className="p-6">
                      <div className="flex justify-center mb-4">
                        <div className="relative h-32 w-32 rounded-full overflow-hidden border-4 border-green-100 shadow-md">
                          {member.image ? (
                            <Image
                              src={member.image}
                              alt={member.name}
                              width={128}
                              height={128}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                              <span className="text-4xl font-bold text-green-600">
                                {member.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{member.name}</h3>
                      <p className="text-sm text-green-600 font-medium">{member.role}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Technology */}
          <div className="mt-12">
            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-2xl">Built with Modern Technology</CardTitle>
                <CardDescription>PadBuddy leverages cutting-edge technology for the best user experience</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">Flutter</div>
                    <p className="text-sm text-gray-600 mt-1">Cross-Platform Framework</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">IoT</div>
                    <p className="text-sm text-gray-600 mt-1">Device Integration</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600">Real-time</div>
                    <p className="text-sm text-gray-600 mt-1">Live Monitoring</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-teal-600">Offline</div>
                    <p className="text-sm text-gray-600 mt-1">Works Offline</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Version Info */}
          <div className="mt-12 text-center">
            <Card className="bg-muted/50 border-0 shadow-md">
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">
                  PadBuddy v{aboutContent.version} | Made with ❤️ for Filipino Rice Farmers
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  © 2025 PadBuddy. All rights reserved.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Search Modal */}
        <Sheet open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Search Fields</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search fields..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border-0 shadow-md focus:ring-2 focus:ring-green-200 bg-white focus:outline-none"
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sidebar Menu */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
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
                    setIsLogoutModalOpen(true);
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
                  onClick={() => {
                    router.push('/');
                    setIsMenuOpen(false);
                  }}
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
                  onClick={() => {
                    router.push('/varieties');
                    setIsMenuOpen(false);
                  }}
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
                    onClick={() => {
                      router.push('/help');
                      setIsMenuOpen(false);
                    }}
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
                    onClick={() => {
                      router.push('/about');
                      setIsMenuOpen(false);
                    }}
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
                    setIsMenuOpen(false);
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

        {/* Logout Confirmation Modal */}
        <Dialog open={isLogoutModalOpen} onOpenChange={setIsLogoutModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl bg-white animate-fade-in">
            <DialogHeader className="text-center pb-4">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center shadow-md">
                <LogOut className="h-8 w-8 text-red-600" />
              </div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                Sign Out?
              </DialogTitle>
              <DialogDescription className="text-base text-gray-600 pt-2 px-2">
                Are you sure you want to sign out? You'll need to sign in again to access your fields.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-row gap-3 pt-4 pb-2">
              <Button
                variant="ghost"
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 font-medium py-3 rounded-xl transition-all active:scale-[0.98] border-0"
                disabled={isLoggingOut}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setIsLoggingOut(true);
                  try {
                    setIsMenuOpen(false);
                    setIsLogoutModalOpen(false);
                    await signOut();
                    router.push('/auth');
                  } catch (error) {
                    console.error('Sign out error:', error);
                    setIsLoggingOut(false);
                    setIsLogoutModalOpen(false);
                    alert('Failed to sign out. Please try again.');
                  }
                }}
                disabled={isLoggingOut}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-3 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
              >
                {isLoggingOut ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing out...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </span>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}

