# PadBuddy PWA Installation Guide

## 📱 Installing PadBuddy as a Progressive Web App

PadBuddy can be installed on your device for a native app-like experience without needing an app store or hosting.

### On Mobile Devices (Android/iOS)

#### Android (Chrome/Edge)
1. Open Chrome or Edge browser
2. Navigate to your PadBuddy URL (e.g., `http://192.168.1.100:3000`)
3. Tap the **menu icon** (⋮) in the top right
4. Select **"Add to Home screen"** or **"Install app"**
5. Tap **"Install"** in the popup
6. The app icon will appear on your home screen

#### iOS (Safari)
1. Open Safari browser
2. Navigate to your PadBuddy URL
3. Tap the **Share button** (□↑) at the bottom
4. Scroll down and tap **"Add to Home Screen"**
5. Tap **"Add"** in the top right
6. The app icon will appear on your home screen

### On Desktop (Windows/Mac/Linux)

#### Chrome/Edge
1. Open Chrome or Edge browser
2. Navigate to your PadBuddy URL
3. Look for the **install icon** (⊕) in the address bar
4. Click **"Install"** or use the menu (⋮) → **"Install PadBuddy"**
5. Click **"Install"** in the popup
6. The app will open in a standalone window

### Running Locally on Your Network

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Find your local IP address:**
   - Windows: Open Command Prompt and type `ipconfig`
   - Mac/Linux: Open Terminal and type `ifconfig` or `ip addr`
   - Look for your IPv4 address (e.g., 192.168.1.100)

3. **Access from other devices:**
   - On the same WiFi network, open a browser
   - Navigate to `http://YOUR_IP_ADDRESS:3000`
   - Example: `http://192.168.1.100:3000`

4. **Install the PWA** using the instructions above

### Features Available Offline

✅ View cached pages and data
✅ Basic navigation
✅ Cached images and assets
✅ Native app-like experience

### For Production

To deploy permanently:

1. **Build the app:**
   ```bash
   npm run build
   npm start
   ```

2. **Deploy to a hosting service:**
   - Vercel (Recommended for Next.js)
   - Netlify
   - Firebase Hosting
   - Your own server

### Troubleshooting

**PWA Install Button Not Showing?**
- Make sure you're using HTTPS (or localhost/local network)
- Check if the manifest.json is loading properly
- Ensure service worker registered successfully (check browser console)

**App Not Working Offline?**
- The first visit requires internet connection
- Service worker caches resources on first load
- Some features (Firebase) require internet connection

### Updating the PWA

When you make changes:
1. Update the `CACHE_NAME` version in `/public/service-worker.js`
2. Rebuild and restart the server
3. Users will get the update on next app launch
