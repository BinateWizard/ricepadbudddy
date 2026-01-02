# Security Fix: Exposed Google Maps API Key

## Issue Found
A Google Maps API key was **exposed in the codebase**:
- **Key**: `AIzaSy[REDACTED]` (compromised - must be regenerated)
- **Location**: [app/field/[id]/components/InformationTab.tsx](app/field/[id]/components/InformationTab.tsx#L607)
- **Status**: This key was hardcoded in the source and publicly visible in GitHub

## What Was Done ✅

### 1. **Code Fixed** 
- Moved the API key from hardcoded string to environment variable
- Changed from: `key=AIzaSy[REDACTED]`
- Changed to: `key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`

### 2. **Environment Configuration Updated**
- Added to `.env.local`:
  ```
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-new-api-key-here
  ```

### 3. **Verified Removal**
- Confirmed the hardcoded key no longer exists in source code
- `.env.local` is already in `.gitignore` (won't be committed)

## CRITICAL ACTION REQUIRED - Next Steps

### ⚠️ **Step 1: Regenerate the API Key (URGENT)**
The exposed key has been compromised:

1. Go to **Google Cloud Console**: https://console.cloud.google.com/
2. Select your project: **rice-padbuddy**
3. Navigate to **APIs & Services** > **Credentials**
4. Find the old API key (starting with AIzaSy...)
5. Click the **Delete** button (trash icon) - **DELETE THE OLD KEY**
6. Click **Create Credentials** > **API Key**
7. Copy the **new API key**
8. Paste into `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

### ⚠️ **Step 2: Restrict the New API Key (SECURITY)**
1. Click on the new API key in Google Cloud Console
2. Under **API restrictions**, select:
   - ✅ Maps Static API
   - ✅ Google Maps JavaScript API
   - ❌ Uncheck all others (restrict to only what you use)
3. Under **Application restrictions**, select:
   - **HTTP referrers (web sites)**
   - Add: `https://rice-padbuddy.firebaseapp.com`
   - Add: `https://*.firebaseapp.com`
   - Add: `localhost:3000` (for development)
4. Click **Save**

### ⚠️ **Step 3: Remove Key from Git History (OPTIONAL but RECOMMENDED)**
To completely remove the exposed key from GitHub's history:

```bash
# Use BFG Repo-Cleaner (fastest):
git clone --mirror https://github.com/aezra/padbuddy-carl.git padbuddy-carl.git
cd padbuddy-carl.git
bfg --replace-text ../keys.txt
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force

# OR use git filter-branch (slower):
git filter-branch --force --index-filter \
  'git rm --cached -r -- . 2>/dev/null; true' \
  --prune-empty --tag-name-filter cat -- --all
git push --force --all
git push --force --tags
```

⚠️ **WARNING**: This rewrites commit history. Everyone with a clone must re-clone.

### ✅ **Step 4: Verify the Fix Works**
1. Make sure `.env.local` has the new API key
2. Run the app: `npm run dev`
3. Navigate to a field page
4. Verify the map loads correctly

## Best Practices Going Forward

### ✅ Environment Variables
```dotenv
# .env.local (NEVER commit this)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-new-google-maps-key
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
```

### ✅ .env.example (Template for developers)
```dotenv
# .env.example (CAN be committed - no real keys)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-api-key-here
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-key-here
```

### ✅ .gitignore (Already configured)
```
.env*
.env.local
.env.*.local
```

### ✅ Code Review Checklist
- ❌ Never hardcode API keys in source code
- ✅ Use `process.env.NEXT_PUBLIC_*` for public keys
- ✅ Use `process.env.*` (without NEXT_PUBLIC_) for private keys (backend only)
- ✅ Always restrict API keys in Google Cloud Console
- ✅ Rotate keys annually or after exposure

## Files Changed
1. ✅ [app/field/[id]/components/InformationTab.tsx](app/field/[id]/components/InformationTab.tsx#L607)
   - Line 607: Changed hardcoded key to environment variable
2. ✅ [.env.local](.env.local)
   - Added: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...`

## Summary
The exposed Google Maps API key has been removed from the codebase and moved to environment variables. The key itself has been compromised and must be **deleted and regenerated** in Google Cloud Console (Step 1 above). The fix is complete but the key regeneration is critical to prevent malicious use.
