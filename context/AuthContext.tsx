'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  // Mount guard to prevent SSR/CSR mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return; // Don't run on server
    
    // Set a timeout to prevent infinite loading in PWA mode
    const timeout = setTimeout(() => {
      if (loading) {
        console.log('[Auth] Timeout reached, stopping loading state');
        setLoading(false);
      }
    }, 5000); // 5 second max wait for auth

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('[Auth] State changed:', user ? 'logged in' : 'logged out');
      setUser(user);
      setLoading(false);
      clearTimeout(timeout);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [loading, mounted]);

  const signOut = async () => {
    try {
      console.log('[Auth] Starting sign out process...');
      
      // First, clear the user state to trigger cleanup in child components
      setUser(null);
      
      // Wait a brief moment for all Firebase listeners to cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now sign out from Firebase
      await auth.signOut();
      
      console.log('[Auth] Sign out complete, redirecting...');
      router.push('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
      // Even if there's an error, try to redirect
      router.push('/auth');
    }
  };

  // Don't render anything until mounted (prevents SSR/hydration mismatch)
  if (!mounted) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
