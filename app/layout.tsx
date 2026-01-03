import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import PageLoader from "@/components/PageLoader";
import OfflineIndicator from "@/components/OfflineIndicator";
import PushNotificationSetup from "@/components/PushNotificationSetup";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PadBuddy - Rice Farm Management",
  description: "Smart rice farming assistant for Philippine farmers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PadBuddy",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const enableServiceWorker = process.env.NODE_ENV === 'production';

  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/rice_logo.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <NotificationProvider>
            <PushNotificationSetup />
            <OfflineIndicator />
            <PageLoader />
            {children}
          </NotificationProvider>
        </AuthProvider>
        {enableServiceWorker && (
          <script dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/service-worker.js').then(
                    function(registration) {
                      console.log('[PWA] ServiceWorker registration successful');
                      
                      // Check for updates periodically
                      setInterval(function() {
                        registration.update();
                      }, 60000); // Check every minute
                      
                      // Handle updates
                      registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        console.log('[PWA] New service worker found');
                        
                        newWorker.addEventListener('statechange', function() {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New content available, show update prompt
                            console.log('[PWA] New content available');
                            if (confirm('May bagong update ang PadBuddy! I-refresh para makuha ang latest version.')) {
                              newWorker.postMessage({ type: 'SKIP_WAITING' });
                              window.location.reload();
                            }
                          }
                        });
                      });
                    },
                    function(err) {
                      console.log('[PWA] ServiceWorker registration failed: ', err);
                    }
                  );
                  
                  // Handle controller change
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    console.log('[PWA] Controller changed');
                  });
                });
                
                // Log online/offline status
                window.addEventListener('online', function() {
                  console.log('[PWA] Back online');
                  document.body.classList.remove('offline');
                });
                
                window.addEventListener('offline', function() {
                  console.log('[PWA] Gone offline');
                  document.body.classList.add('offline');
                });
              }
            `
          }} />
        )}
      </body>
    </html>
  );
}
