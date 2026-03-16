# Tabi Desktop App — CI/CD Plan (Mac + Shared Infrastructure)

## Overview

This plan covers everything needed for the macOS build pipeline AND all the shared infrastructure your friend will plug into for Windows later. By the end, you'll have: automated Mac builds, signing, notarization, GitHub Releases publishing, auto-update, and website download links — all set up so your friend just adds a Windows job to the existing workflow.

---

## Architecture

```
Push to main
    │
    ▼
GitHub Actions triggers
    │
    └── macOS Runner ──► Build ──► Sign ──► Notarize ──► Publish to GitHub Releases
                                                              │
    ┌─────────────────────────────────────────────────────────┘
    │
    ▼
GitHub Releases (shared hosting for all platforms)
    │
    ├── latest-mac.yml          ← auto-update manifest (Mac)
    ├── latest.yml              ← auto-update manifest (Windows, added later by friend)
    ├── Tabi-x.x.x.dmg         ← Mac download
    ├── Tabi-x.x.x-mac.zip     ← Mac auto-updater file
    └── Tabi-Setup-x.x.x.exe   ← Windows download (added later by friend)
    │
    ▼
Website download link ──► Always points to latest release
    │
    ▼
App checks for updates ──► Downloads from GitHub Releases ──► Installs automatically
```

---

## Part 1: Prerequisites

### 1.1 Fix the package.json Typo (CRITICAL)

In `package.json`, change `"build:"` to `"build"` (remove the trailing colon). Without this, electron-builder ignores all build config including signing and notarization. Everything else depends on this fix.

### 1.2 GitHub Secrets (Your Responsibility)

Add these to the GitHub repo under Settings → Secrets and variables → Actions:

| Secret Name | What It Is | How to Get It |
|---|---|---|
| `GH_TOKEN` | GitHub Personal Access Token with `repo` scope | GitHub → Settings → Developer Settings → Personal Access Tokens → Generate new token (classic) → check `repo` scope |
| `CSC_LINK` | Base64-encoded `.p12` certificate for Mac signing | You already exported "Developer ID Application: Ayham Dwairy" from Keychain. Run `base64 -i "/path/to/certificate.p12" \| pbcopy` and paste into the secret |
| `CSC_KEY_PASSWORD` | Password you set when exporting the `.p12` | The password you chose during Keychain export |
| `APPLE_API_KEY` | Base64-encoded `.p8` file for notarization | App Store Connect → Users and Access → Integrations → App Store Connect API → Generate key → Download `.p8` → `base64 -i AuthKey_XXXX.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | Key ID from App Store Connect | Shown next to the key after generating it |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect | Shown at the top of the API Keys page in App Store Connect |

**Note for your friend:** When they're ready for Windows, they only need to add `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` to the same secrets. Everything else (GH_TOKEN, repo config, workflow structure) is already done by you.

### 1.3 Version Bumping Strategy (Shared)

Every release needs a unique version in `package.json`. The GitHub Actions workflow will handle this automatically:

1. On push to main, the workflow reads the current version
2. Auto-bumps the patch number (e.g., 0.0.1 → 0.0.2)
3. Commits and tags the new version
4. Builds using the new version

This is shared infrastructure — works the same for Mac and Windows builds.

---

## Part 2: macOS Signing

### 2.1 What Happens Automatically

When electron-builder runs with the right environment variables, it handles all signing automatically. No more manual `codesign` commands. Here's what it does internally:

1. Decodes the `.p12` certificate
2. Imports it into a temporary keychain
3. Signs every internal binary: `.node` files, `.dylib` files, helper apps, frameworks
4. Uses `--timestamp` flag (required for notarization)
5. Enables hardened runtime
6. Signs the main `.app` bundle last

### 2.2 Environment Variables That Trigger Signing

```
CSC_LINK=./certificate.p12        ← path to decoded .p12 file
CSC_KEY_PASSWORD=your_password     ← the certificate password
```

When electron-builder detects these, it signs automatically. If they're missing, it skips signing.

### 2.3 Entitlements File (Must Create)

Create `build/entitlements.mac.plist` in the project root. Electron apps need these entitlements to run with hardened runtime:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

Without this file, the signed app will crash on launch because hardened runtime blocks Electron's JIT compilation.

### 2.4 Build Config for Mac (package.json)

Replace the broken `"build:"` section with:

```json
"build": {
  "appId": "com.tabitrack.tabi",
  "productName": "Tabi",
  "generateUpdatesFilesForAllChannels": true,
  "mac": {
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist",
    "target": ["dmg", "zip"],
    "notarize": false,
    "artifactName": "Tabi-${version}.${ext}"
  },
  "afterSign": "./scripts/notarize.js",
  "publish": {
    "provider": "github",
    "owner": "GITHUB_USERNAME_OR_ORG",
    "repo": "REPO_NAME",
    "releaseType": "release"
  }
}
```

Key settings explained:

- `hardenedRuntime: true` — required for notarization
- `gatekeeperAssess: false` — skip local Gatekeeper check (CI doesn't need it)
- `entitlements` and `entitlementsInherit` — apply to main app and all helpers
- `target: ["dmg", "zip"]` — dmg for website download, zip for auto-updater
- `notarize: false` — disables electron-builder's built-in notarization (we use custom script instead because it's more reliable)
- `afterSign` — runs our custom notarization script after signing
- `publish` — tells electron-builder to publish to GitHub Releases

**Note for your friend:** They just add a `"win"` section and `"nsis"` section to this same `"build"` config. The `"publish"` config is shared.

---

## Part 3: macOS Notarization

### 3.1 Custom Notarize Script (Must Create)

Create `scripts/notarize.js` in the project:

```javascript
const { notarize } = require("@electron/notarize");

const notarizeMacos = async (context) => {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on Mac
  if (electronPlatformName !== "darwin") return;

  // Only notarize in CI
  if (process.env.CI !== "true") {
    console.warn("Skipping notarization — not running in CI");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  await notarize({
    tool: "notarytool",
    appPath: appPath,
    appleApiKey: process.env.APPLE_API_KEY_PATH,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
  });

  console.log("Notarization complete!");
};

exports.default = notarizeMacos;
```

### 3.2 What This Script Does

1. Checks if it's running on Mac (skips on Windows)
2. Checks if it's running in CI (skips local dev builds)
3. Submits the signed `.app` to Apple's notarization service
4. Waits for Apple to return "Accepted" (2-10 minutes normally)
5. electron-builder then staples the notarization ticket to the app

### 3.3 Install @electron/notarize

Make sure it's in devDependencies:

```bash
npm install --save-dev @electron/notarize
```

### 3.4 First-Time Account Note

You already went through the painful 19+ hour first-time wait. Now that the account is approved, all future notarizations (including from CI) will take just a few minutes.

---

## Part 4: GitHub Actions Workflow (Shared Structure)

### 4.1 File Location

Create `.github/workflows/build-and-release.yml`

### 4.2 Workflow Design

```yaml
name: Build and Release

on:
  push:
    branches: [main]

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      # 1. Checkout code
      # 2. Setup Node.js
      # 3. Install dependencies (npm ci)
      # 4. Bump version + commit + tag
      # 5. Decode .p12 certificate from secret → save as file
      # 6. Decode .p8 API key from secret → save as file
      # 7. Build + sign + notarize + publish
      #    Environment variables:
      #      CSC_LINK: path to .p12
      #      CSC_KEY_PASSWORD: from secret
      #      APPLE_API_KEY_PATH: path to .p8
      #      APPLE_API_KEY_ID: from secret
      #      APPLE_API_ISSUER: from secret
      #      GH_TOKEN: from secret (for publishing to GitHub Releases)
      # 8. Cleanup (delete decoded certificate files)
```

### 4.3 How Your Friend Adds Windows Later

They add a second job to the same file:

```yaml
  build-windows:
    runs-on: windows-latest
    steps:
      # Same structure but with WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD
      # No notarization step needed for Windows
```

Both jobs run in parallel. Both publish to the same GitHub Release. The shared `"publish"` config in `package.json` ensures they target the same place.

### 4.4 Trigger: Only Main Branch

The `on: push: branches: [main]` config means:

- Push to `feature/xyz` → nothing happens
- Push to `dev` → nothing happens
- Push/merge to `main` → build triggers
- Your friend merges Windows changes to main → both Mac and Windows build

---

## Part 5: Auto-Update System (Shared)

### 5.1 How It Works

`electron-updater` (already in your dependencies) handles everything:

1. App launches → checks GitHub Releases for `latest-mac.yml`
2. Compares version in the manifest with current app version
3. If newer version exists → downloads the `.zip` update file
4. Installs on next restart

This works identically on Mac and Windows. The only difference is the manifest file name (`latest-mac.yml` vs `latest.yml`). electron-updater detects the platform automatically.

### 5.2 Code to Add (Main Process)

In the main Electron file (probably `src/main/index.ts` or similar), add:

```typescript
import { autoUpdater } from "electron-updater";
import log from "electron-log";

// Log update events
autoUpdater.logger = log;

// Check for updates when app is ready
app.whenReady().then(() => {
  // Wait 10 seconds after launch, then check
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 10000);
});

// Check every 4 hours while app is running
setInterval(() => {
  autoUpdater.checkForUpdatesAndNotify();
}, 4 * 60 * 60 * 1000);
```

### 5.3 Update Behavior

`checkForUpdatesAndNotify()` does:
- Downloads update silently in background
- Shows a system notification when download is complete
- Installs the update when the user quits the app

This is the simplest and least intrusive approach. Works on both Mac and Windows.

### 5.4 Auto-Update Config

The `"publish"` block in `package.json` (from Part 2) is all electron-updater needs. It reads the same config to know where to check for updates. No additional configuration needed.

### 5.5 Testing Auto-Updates

1. Build version 0.0.1, install it on your Mac
2. Push a change to main, let CI build version 0.0.2
3. Open the 0.0.1 app
4. Wait ~10 seconds, it should detect and download 0.0.2
5. Quit the app, reopen — should now be 0.0.2

---

## Part 6: Website Download Link (Shared)

### 6.1 Fixed Download URLs

To make download links that always serve the latest version, use fixed artifact names.

In `package.json` build config:
```json
"mac": {
  "artifactName": "Tabi.${ext}"
}
```

Then the permanent download URL is:
```
https://github.com/OWNER/REPO/releases/latest/download/Tabi.dmg
```

Your friend does the same for Windows:
```json
"win": {
  "artifactName": "Tabi-Setup.${ext}"
}
```

Permanent URL:
```
https://github.com/OWNER/REPO/releases/latest/download/Tabi-Setup.exe
```

### 6.2 Website Download Page

Your website should:
1. Detect the user's OS via browser user agent
2. Show the right download button (Mac → `.dmg`, Windows → `.exe`)
3. Show the other platform as a secondary link
4. Both links point to the GitHub Releases "latest" URLs above

This is something you set up once and never touch again. The URLs always redirect to the newest release.

---

## Part 7: Files You Need to Create or Modify

### Files to CREATE:

| File | Purpose |
|---|---|
| `build/entitlements.mac.plist` | macOS permissions for hardened runtime |
| `scripts/notarize.js` | Custom notarization script for CI |
| `.github/workflows/build-and-release.yml` | The CI/CD workflow |

### Files to MODIFY:

| File | Change |
|---|---|
| `package.json` | Fix `"build:"` → `"build"`, add full build config with mac + publish sections |
| Main Electron file | Add auto-update code using `electron-updater` |

### Dependencies to INSTALL:

```bash
npm install --save-dev @electron/notarize
```

(`electron-updater` and `electron-builder` are already in your `package.json`)

---

## Part 8: Implementation Order

### Step 1: Fix and Configure (30 minutes)

- [ ] Fix `"build:"` → `"build"` in `package.json`
- [ ] Add complete Mac build config to `package.json`
- [ ] Create `build/entitlements.mac.plist`
- [ ] Create `scripts/notarize.js`
- [ ] Run `npm install --save-dev @electron/notarize`

### Step 2: Set Up Secrets (15 minutes)

- [ ] Create GitHub Personal Access Token, add as `GH_TOKEN`
- [ ] Base64-encode `.p12` certificate, add as `CSC_LINK`
- [ ] Add `.p12` password as `CSC_KEY_PASSWORD`
- [ ] Generate App Store Connect API key
- [ ] Base64-encode `.p8` file, add as `APPLE_API_KEY`
- [ ] Add Key ID as `APPLE_API_KEY_ID`
- [ ] Add Issuer ID as `APPLE_API_ISSUER`

### Step 3: Create Workflow (30 minutes)

- [ ] Create `.github/workflows/build-and-release.yml`
- [ ] Test by pushing to main
- [ ] Verify GitHub Release is created with `.dmg` and `.zip`
- [ ] Download the `.dmg` and test on a Mac that has never had the app installed

### Step 4: Add Auto-Update (15 minutes)

- [ ] Add auto-update code to main Electron process
- [ ] Push to main, let CI build
- [ ] Test update detection from an older installed version

### Step 5: Website Links (15 minutes)

- [ ] Update website download link to GitHub Releases latest URL
- [ ] Test download flow end-to-end

### Total estimated time: ~2 hours (not counting CI build time)

---

## Part 9: What Your Friend Needs to Do for Windows

When they're ready, they need to:

1. Purchase a Windows code signing certificate (SSL.com, DigiCert, etc.)
2. Add `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` to GitHub Secrets
3. Add `"win"` and `"nsis"` sections to the `"build"` config in `package.json`
4. Add a `build-windows` job to the existing `.github/workflows/build-and-release.yml`

Everything else — GitHub Releases, auto-update, website links, version bumping — is already handled by the shared infrastructure you set up.

---

## Part 10: Gotchas & Things to Watch

- **Notarization in CI takes 2-10 minutes.** This is normal. The workflow will wait for it.
- **If notarization fails in CI**, check the log. The workflow should output the submission ID. Use `xcrun notarytool log SUBMISSION_ID` to see details.
- **The entitlements file is critical.** Without it, the app will crash on launch after signing with hardened runtime.
- **`notarize: false` in the mac config is intentional.** We disable electron-builder's built-in notarization and use our custom script instead because it's more reliable and gives better error messages.
- **GitHub Releases has a 2GB limit per file.** Your 247MB app is well within this.
- **Always test on a clean Mac.** A machine that has never had Tabi installed. This is the only way to truly verify signing and notarization work.
- **Version must increase for auto-update to work.** electron-updater compares semver. If the version doesn't change, it won't detect an update.
- **The `.p8` API key can only be downloaded once** from App Store Connect. If you lose it, you have to revoke and create a new one.

---

## Summary Checklist

- [ ] Fix `"build:"` typo in `package.json`
- [ ] Add Mac build config with publish section
- [ ] Create `build/entitlements.mac.plist`
- [ ] Create `scripts/notarize.js`
- [ ] Install `@electron/notarize`
- [ ] Add all 7 secrets to GitHub
- [ ] Create `.github/workflows/build-and-release.yml`
- [ ] Add auto-update code to main Electron process
- [ ] Update website download link
- [ ] Test full flow: push → build → sign → notarize → release → download → auto-update
- [ ] Hand off to friend: they add Windows job + secrets