'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';
import { Sprout, Smartphone, BarChart3, TrendingUp, Shield, Zap, CheckCircle2, LogIn, X } from 'lucide-react';
import PWAInstallButton from '@/components/PWAInstallButton';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
      // Add email and profile scopes
      provider.addScope('email');
      provider.addScope('profile');
      // Set custom parameters for better UX
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      console.log('Sign-in successful:', result.user.email);
      // User will be redirected by the useEffect above
    } catch (err: any) {
      console.error('Error signing in:', err);
      
      // Provide user-friendly error messages
      let errorMessage = 'Failed to sign in with Google';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled. Please try again.';
      } else if (err.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked. Please allow popups for this site and try again.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (err.code === 'auth/unauthorized-domain') {
        errorMessage = 'This domain is not authorized. Please contact support.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  const features = [
    { icon: Sprout, text: 'Field Management' },
    { icon: Smartphone, text: 'IoT Monitoring' },
    { icon: BarChart3, text: 'Growth Tracking' },
    { icon: TrendingUp, text: 'Data Analytics' },
  ];

  const benefits = [
    'Real-time field monitoring',
    'Automated growth stage tracking',
    'NPK level monitoring',
    'Device status alerts',
    'Offline PWA support',
  ];

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 px-4 py-4 lg:py-8 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-center">
          {/* Left Side - Branding & Features */}
          <div className="text-center lg:text-left space-y-4 lg:space-y-8 animate-fade-in">
            <div className="flex justify-center lg:justify-start">
              <div className="relative transform hover:scale-105 transition-transform duration-300">
                <div className="absolute -inset-8 bg-white/20 rounded-full blur-3xl animate-pulse"></div>
                <Image 
                  src="/icons/rice_logo.png" 
                  alt="PadBuddy Logo" 
                  width={200} 
                  height={200}
                  className="relative drop-shadow-2xl w-28 h-28 lg:w-[200px] lg:h-[200px]"
                />
              </div>
            </div>
            
            <div>
              <h1 className="text-4xl lg:text-7xl font-black text-white mb-2 lg:mb-4 tracking-tight drop-shadow-lg" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                PadBuddy
              </h1>
              <p className="text-white/95 text-base lg:text-2xl font-light tracking-wide mb-3 lg:mb-6" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                Your Smart Rice Farming Companion
              </p>
              <p className="text-white/90 text-sm lg:text-lg leading-relaxed max-w-lg mx-auto lg:mx-0 hidden lg:block">
                Empowering Filipino rice farmers with smart technology solutions for better yields and efficient field management.
              </p>
            </div>

            {/* Feature Icons - Hidden on mobile */}
            <div className="hidden lg:flex flex-wrap justify-center lg:justify-start gap-4 pt-4">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/30 hover:bg-white/30 transition-all"
                >
                  <feature.icon className="h-5 w-5 text-white" />
                  <span className="text-white text-sm font-medium">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* Benefits List - Hidden on mobile */}
            <div className="hidden lg:block bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-yellow-300" />
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                  Key Benefits
                </h3>
              </div>
              <ul className="space-y-2">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3 text-white/95">
                    <CheckCircle2 className="h-5 w-5 text-green-300 flex-shrink-0" />
                    <span className="text-sm lg:text-base">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Side - Login Card (Hidden on Mobile) */}
          <div className="hidden lg:flex flex-col items-center justify-center animate-fade-in">
            <div className="w-full max-w-md bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/30">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-4 shadow-lg">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                  Welcome Back
                </h2>
                <p className="text-gray-600 text-sm">
                  Sign in to access your fields and manage your rice farming operations
                </p>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-4 bg-white text-gray-700 px-6 py-4 rounded-xl font-semibold text-base hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none border-2 border-gray-200 hover:border-green-300"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  <>
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
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
                <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl shadow-sm animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-red-800 font-semibold mb-1">Sign in failed</p>
                      <p className="text-xs text-red-700" style={{ fontFamily: "'Courier New', Courier, monospace" }}>{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs text-center text-gray-500">
                  By signing in, you agree to our Terms of Service and Privacy Policy
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Login Button - Fixed on Right Side */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="lg:hidden fixed right-4 bottom-8 z-50 flex items-center gap-2 bg-white text-green-600 px-6 py-4 rounded-full font-bold text-base shadow-2xl hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all border-2 border-green-200 animate-float"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        <LogIn className="h-5 w-5" />
        Sign In
      </button>

      {/* Mobile Login Modal */}
      {isModalOpen && (
        <>
          {/* Backdrop with fade animation */}
          <div 
            className="lg:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-backdrop-fade"
            onClick={() => setIsModalOpen(false)}
          />
          
          {/* Modal - Centered with popup animation */}
          <div className="lg:hidden fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="relative bg-white rounded-3xl shadow-2xl p-6 border border-gray-100 w-full max-w-sm animate-modal-popup">
              {/* Close Button */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute -top-3 -right-3 p-2 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-all hover:scale-110 border border-gray-200"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>

              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-4 shadow-lg animate-bounce-in">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                  Welcome Back
                </h2>
                <p className="text-gray-600 text-sm">
                  Sign in to access your fields and manage your rice farming operations
                </p>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 px-5 py-4 rounded-xl font-semibold text-base hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none border-2 border-gray-200 hover:border-green-300"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  <>
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
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
                <div className="mt-4 p-3 bg-red-50 border-2 border-red-200 rounded-xl shadow-sm animate-shake">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-red-800 font-semibold mb-1">Sign in failed</p>
                      <p className="text-xs text-red-700" style={{ fontFamily: "'Courier New', Courier, monospace" }}>{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-gray-200">
                <p className="text-xs text-center text-gray-500">
                  By signing in, you agree to our Terms of Service and Privacy Policy
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* PWA Install Prompt - Only shows on auth page */}
      <PWAInstallButton />
    </div>
  );
}
