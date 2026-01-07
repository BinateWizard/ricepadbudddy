'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Menu, Search, BookOpen, Sprout, Calendar, TrendingUp, Info, ChevronRight, X, Home as HomeIcon, HelpCircle, LogOut, Shield } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface RiceVariety {
  name: string;
  aliases: string[];
  breeder: string;
  maturity_days: {
    typical_range: string;
    notes?: string;
  };
  recommended_npk_per_ha: {
    N: string;
    P2O5: string;
    K2O: string;
    application_timing: string[];
  };
  growth_stages_start_days: {
    [key: string]: string;
  };
  agronomic_stats: {
    plant_height_cm?: string;
    yield_potential_t_ha?: string;
    tillering?: string;
    lodging_resistance?: string;
    lodging_wind_resistance?: string;
    notes?: string;
  };
  disease_and_pest_reaction: {
    [key: string]: string;
  };
  notes?: string;
}

interface RiceVarietiesData {
  varieties: RiceVariety[];
}

export default function RiceVarietiesPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [varieties, setVarieties] = useState<RiceVariety[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVariety, setSelectedVariety] = useState<RiceVariety | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loadMessage, setLoadMessage] = useState('');

  useEffect(() => {
    fetchVarieties();
  }, []);

  const fetchVarieties = async () => {
    try {
      const response = await fetch('/variety_information/rice');
      if (!response.ok) {
        throw new Error('Failed to fetch rice varieties');
      }
      const text = await response.text();
      const data: RiceVarietiesData = JSON.parse(text);
      setVarieties(data.varieties || []);
      setLoadMessage(`✓ Successfully loaded ${data.varieties?.length || 0} rice varieties`);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error fetching rice varieties:', error);
      setLoadMessage('✗ Error: Failed to load rice varieties. Please refresh the page.');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } finally {
      setLoading(false);
    }
  };

  const filteredVarieties = varieties.filter(variety => {
    const query = searchQuery.toLowerCase();
    return (
      variety.name.toLowerCase().includes(query) ||
      variety.aliases.some(alias => alias.toLowerCase().includes(query)) ||
      variety.breeder.toLowerCase().includes(query)
    );
  });

  return (
    <ProtectedRoute>
      {/* Skip to Main Content - Accessibility (UI Rule 7) */}
      <a href="#main-content" className="ui-skip-link">
        Skip to main content
      </a>
      
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
        {/* Navigation Bar - Sticky */}
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 sticky top-0 z-50 shadow-lg">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
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
                  className="relative hover:bg-white/20 text-white"
                  onClick={() => setIsSearchModalOpen(true)}
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
                <BookOpen className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1">Rice Varieties</h2>
                <p className="text-white/90 text-sm">Explore different rice varieties and their characteristics for your farming needs</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main id="main-content" className="w-full px-2 sm:px-4 lg:px-8 py-8">

          {/* Success/Error Banner - HCI Rule 3 & 4 */}
          {showSuccess && (
            <div className={`mt-6 p-4 rounded-xl border-2 flex items-center justify-between shadow-md animate-fade-in ${
              loadMessage.startsWith('✓') 
                ? 'bg-green-100 border-green-500' 
                : 'bg-red-100 border-red-500'
            }`}>
              <span className={`font-semibold text-sm ${
                loadMessage.startsWith('✓') ? 'text-green-800' : 'text-red-800'
              }`}>
                {loadMessage}
              </span>
              <button
                onClick={() => setShowSuccess(false)}
                className="text-sm px-2 py-1 hover:bg-white/50 rounded transition-colors"
                title="Dismiss message"
              >
                ✕
              </button>
            </div>
          )}

          {/* Varieties Grid */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <p className="mt-4 text-gray-600">Loading rice varieties...</p>
            </div>
          ) : filteredVarieties.length === 0 ? (
            <Card className="mt-6 border-0 shadow-md">
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No rice varieties found matching your search.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {filteredVarieties.map((variety, index) => (
                <Card
                  key={index}
                  className="hover:shadow-lg transition-all duration-300 cursor-pointer border-0 shadow-md"
                  onClick={() => setSelectedVariety(variety)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-2 text-gray-900 font-bold">{variety.name}</CardTitle>
                        {variety.aliases && variety.aliases.length > 0 && (
                          <CardDescription className="text-sm text-gray-600">
                            {variety.aliases.join(', ')}
                          </CardDescription>
                        )}
                      </div>
                      <Sprout className="h-6 w-6 text-green-600 flex-shrink-0" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Breeder</p>
                        <p className="text-sm text-gray-700">{variety.breeder}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Maturity</p>
                        <Badge variant="outline" className="mt-1 flex items-center gap-1 bg-green-50 border-green-200 text-gray-800">
                          <Calendar className="h-3 w-3 text-green-600" />
                          <span>{variety.maturity_days?.typical_range || 'N/A'} days</span>
                        </Badge>
                      </div>
                      {variety.agronomic_stats?.yield_potential_t_ha && (
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Yield Potential</p>
                          <Badge variant="outline" className="mt-1 flex items-center gap-1 bg-blue-50 border-blue-200 text-gray-800">
                            <TrendingUp className="h-3 w-3 text-blue-600" />
                            <span>{variety.agronomic_stats?.yield_potential_t_ha || 'N/A'}</span>
                          </Badge>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVariety(variety);
                        }}
                      >
                        View Details
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>

        {/* Variety Detail Modal */}
        {selectedVariety && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedVariety(null)}
          >
            <Card
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl mb-2">{selectedVariety.name}</CardTitle>
                    {selectedVariety.aliases && selectedVariety.aliases.length > 0 && (
                      <CardDescription>{selectedVariety.aliases.join(', ')}</CardDescription>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedVariety(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Breeder */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Breeder</h3>
                  <p className="text-gray-700">{selectedVariety.breeder}</p>
                </div>

                {/* Maturity Days */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-600" />
                    Maturity Days
                  </h3>
                  <Badge variant="outline" className="mb-2">
                    <span>{String(selectedVariety.maturity_days.typical_range)} days</span>
                  </Badge>
                  {selectedVariety.maturity_days.notes && (
                    <p className="text-sm text-gray-600 mt-2">{selectedVariety.maturity_days.notes}</p>
                  )}
                </div>

                {/* NPK Recommendations */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">NPK Recommendations (per hectare)</h3>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <Card className="p-3 border-0 shadow-sm bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">Nitrogen (N)</p>
                      <p className="font-medium">{selectedVariety.recommended_npk_per_ha.N}</p>
                    </Card>
                    <Card className="p-3 border-0 shadow-sm bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">Phosphorus (P₂O₅)</p>
                      <p className="font-medium">{selectedVariety.recommended_npk_per_ha.P2O5}</p>
                    </Card>
                    <Card className="p-3 border-0 shadow-sm bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">Potassium (K₂O)</p>
                      <p className="font-medium">{selectedVariety.recommended_npk_per_ha.K2O}</p>
                    </Card>
                  </div>
                  {selectedVariety.recommended_npk_per_ha.application_timing && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Application Timing:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                        {selectedVariety.recommended_npk_per_ha.application_timing.map((timing, idx) => (
                          <li key={idx}>{timing}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Growth Stages */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Growth Stages</h3>
                  <div className="space-y-2">
                    {Object.entries(selectedVariety.growth_stages_start_days).map(([stage, days]) => (
                      <div key={stage} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-700 capitalize">{stage.replace(/_/g, ' ')}</span>
                        <Badge variant="outline"><span>{String(days)}</span></Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agronomic Stats */}
                {selectedVariety.agronomic_stats && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Agronomic Characteristics</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedVariety.agronomic_stats.plant_height_cm && (
                        <Card className="p-3 border-0 shadow-sm bg-gray-50">
                          <p className="text-xs text-gray-500 mb-1">Plant Height</p>
                          <p className="font-medium">{selectedVariety.agronomic_stats.plant_height_cm}</p>
                        </Card>
                      )}
                      {selectedVariety.agronomic_stats.yield_potential_t_ha && (
                        <Card className="p-3 border-0 shadow-sm bg-gray-50">
                          <p className="text-xs text-gray-500 mb-1">Yield Potential</p>
                          <p className="font-medium">{selectedVariety.agronomic_stats.yield_potential_t_ha}</p>
                        </Card>
                      )}
                      {selectedVariety.agronomic_stats.tillering && (
                        <Card className="p-3 border-0 shadow-sm bg-gray-50">
                          <p className="text-xs text-gray-500 mb-1">Tillering</p>
                          <p className="font-medium">{selectedVariety.agronomic_stats.tillering}</p>
                        </Card>
                      )}
                      {(selectedVariety.agronomic_stats.lodging_resistance || selectedVariety.agronomic_stats.lodging_wind_resistance) && (
                        <Card className="p-3 border-0 shadow-sm bg-gray-50">
                          <p className="text-xs text-gray-500 mb-1">Lodging Resistance</p>
                          <p className="font-medium">
                            {selectedVariety.agronomic_stats.lodging_resistance || selectedVariety.agronomic_stats.lodging_wind_resistance}
                          </p>
                        </Card>
                      )}
                    </div>
                    {selectedVariety.agronomic_stats.notes && (
                      <p className="text-sm text-gray-600 mt-3">{selectedVariety.agronomic_stats.notes}</p>
                    )}
                  </div>
                )}

                {/* Disease & Pest Reaction */}
                {selectedVariety.disease_and_pest_reaction && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Disease & Pest Reaction</h3>
                    <div className="space-y-2">
                      {Object.entries(selectedVariety.disease_and_pest_reaction)
                        .filter(([key]) => key !== 'source')
                        .map(([disease, reaction]) => (
                          <div key={disease} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                            <span className="text-sm text-gray-700 capitalize">{disease.replace(/_/g, ' ')}</span>
                            <Badge variant="outline" className="text-xs"><span>{String(reaction)}</span></Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedVariety.notes && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Info className="h-5 w-5 text-green-600" />
                      Notes
                    </h3>
                    <p className="text-sm text-gray-700">{selectedVariety.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search Modal */}
        <Sheet open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Search Rice Varieties</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search rice varieties by name, alias, or breeder... (HCI Rule 8)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-20 py-3 rounded-xl border-0 shadow-md focus:ring-2 focus:ring-green-200 bg-white"
                  title="Type to search across all variety properties"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                    title="Clear search (HCI Rule 2: Quick action)"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-6 space-y-3 max-h-[60vh] overflow-y-auto">
                {filteredVarieties.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No rice varieties found matching your search.</p>
                  </div>
                ) : (
                  filteredVarieties.map((variety, index) => (
                    <Card
                      key={index}
                      className="cursor-pointer hover:shadow-md transition-all"
                      onClick={() => {
                        setSelectedVariety(variety);
                        setIsSearchModalOpen(false);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{variety.name}</h3>
                            <p className="text-sm text-gray-600">{variety.breeder}</p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sidebar */}
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

        {/* Mobile Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 md:hidden safe-area-bottom">
          <div className="flex justify-around items-center h-16 px-2">
            <Button
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
                pathname === '/' ? 'text-green-600' : 'text-gray-600 hover:text-green-600'
              }`}
              onClick={() => router.push('/')}
            >
              <HomeIcon className="h-5 w-5" />
              <span className="text-xs font-medium">Home</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
                pathname === '/varieties' ? 'text-green-600' : 'text-gray-600 hover:text-green-600'
              }`}
              onClick={() => router.push('/varieties')}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-xs font-medium">Varieties</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
                pathname === '/help' ? 'text-green-600' : 'text-gray-600 hover:text-green-600'
              }`}
              onClick={() => router.push('/help')}
            >
              <HelpCircle className="h-5 w-5" />
              <span className="text-xs font-medium">Help</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
                pathname === '/about' ? 'text-green-600' : 'text-gray-600 hover:text-green-600'
              }`}
              onClick={() => router.push('/about')}
            >
              <Info className="h-5 w-5" />
              <span className="text-xs font-medium">About</span>
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

