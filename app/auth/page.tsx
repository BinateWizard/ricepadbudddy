'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Redirect if already logged in
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // User will be redirected by the useEffect above
    } catch (err: any) {
      console.error('Error signing in:', err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-400 via-green-500 to-green-600 px-4">
      <div className="text-center mb-12 animate-fade-in">
        <div className="flex justify-center">
          <div className="relative transform hover:scale-105 transition-transform duration-300">
            <div className="absolute -inset-8 bg-white/20 rounded-full blur-3xl"></div>
            <Image 
              src="/icons/rice_logo.png" 
              alt="PadBuddy Logo" 
              width={300} 
              height={300}
              className="relative drop-shadow-2xl"
            />
          </div>
        </div>
        <h1 className="text-7xl font-black text-white mb-4 tracking-tight drop-shadow-lg">
          Padbuddy
        </h1>
        <p className="text-white/90 text-2xl font-light tracking-wide">Your Smart Rice Farming Companion</p>
      </div>

      <div className="w-full max-w-md">
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-4 bg-white text-green-700 px-8 py-5 rounded-2xl font-bold text-lg hover:bg-green-50 transition-all shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
        >
          {loading ? (
            <span className="animate-pulse">Signing in...</span>
          ) : (
            <>
              <svg className="w-7 h-7" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-white/95 backdrop-blur-sm border-2 border-red-300 rounded-2xl shadow-lg">
            <p className="text-sm text-red-700 font-semibold">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
