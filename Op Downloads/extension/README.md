# op.downloads - Advanced Universal Video & Image Downloader (v3.2.0)

A high-performance, secure, and privacy-first Chrome Extension (Manifest V3) engineered to download accessible videos and images in **1-Click** across the web, parse and merge HLS multi-segment streams (.m3u8), extract media past transparent click overlays, and control playback speed up to 10x.

---

## 🚀 Key Features

### 1. 🎯 1-Click Top-Right Corner Hover Download Badge
- **Instant Media Access:** Whenever you hover your cursor over accessible videos or images on websites where downloading is permitted, a floating download badge automatically appears in the top-right corner.
- **Videos:** Displays `[ ⬇ MP4 ]` — initiates a direct download of the detected media stream to PC Downloads.
- **Images:** Displays `[ ⬇ PNG ]` and `[ ⬇ JPG ]` — converts and saves the image directly.
- **Z-Index Layering:** Placed at high elevation (`z-index: 2147483647`) to float cleanly above custom player overlays without interfering with controls.

### 2. 📡 HLS (.m3u8) Stream Sniffer & Binary Segment Merger
- **Multi-Channel Sniffing:** Background service worker monitors media network requests to identify `.m3u8` playlists and direct video streams.
- **Automated Segment Assembly:** Resolves master playlists to the highest-bandwidth video variant, fetches transport chunks in parallel batches (concurrency: 8), and merges them into a contiguous `.mp4` file.
- **Blob Stream Downloading:** Uses `URL.createObjectURL` with automatic resource revocation to avoid high memory spikes.

### 3. 🔓 Restricted Overlay Inspection
- **Transparent Overlay Penetration:** Uses deep DOM inspection (`elementsFromPoint`) to reach behind transparent shield `<div>` elements that prevent standard browser right-click saving.
- **Highest-Resolution srcset Parser:** Inspects `srcset` and picture elements to retrieve full-resolution originals rather than low-resolution thumbnail previews.
- **Canvas & Background Media Extraction:** Converts HTML5 `<canvas>` elements and CSS background images to PNG or JPG downloads.

### 4. ⚡ Universal Video Speed Controller (1x to 10x)
- Controls playback speed for HTML5 videos across the browser.
- Preset buttons: **1x**, **1.5x**, **2x**, **3x**, **5x**, and **10x**.
- Continuous range slider from **0.25x to 10.0x**.
- Mutation observer ensures new dynamically injected video players respect user speed preferences.

### 5. 🖼 Universal Image Converter (PNG & JPG)
- Converts images (including WebP, AVIF, and canvas) to **PNG** or **JPG** format using `OffscreenCanvas`.
- Preserves natural dimensions and aspect ratios.
- Provides an in-popup gallery with batch **Download All Images** capability.

---

## 🔒 Security, Privacy & Web Store Policies

### 1. Permissions Justifications (Least Privilege)
| Permission | Justification |
| :--- | :--- |
| `storage` | Stores user settings (playback speed, hover toggle) and caches active tab streams across service-worker restarts. |
| `downloads` | Saves detected media files and merged video streams directly to the local PC Downloads directory. |
| `contextMenus` | Adds quick right-click actions for saving images as PNG/JPG and videos as MP4. |
| `activeTab` | Grants temporary script execution and DOM access on the current active tab when the extension popup is opened. |
| `webRequest` | Sniffs media URLs (`.m3u8`, `.mpd`, `.mp4`) from network headers to identify downloadable stream resources. |
| `*://*/*` (host) | Required to inspect video manifests and media streams across permitted websites. |

### 2. Privacy & Data Handling
- **Local Processing:** All segment fetching, binary merging, canvas conversions, and stream parsing occur strictly locally within your browser.
- **Zero Tracking:** No analytics, advertising, remote telemetry, third-party user identifiers, or external tracking servers.
- **No Browsing History Stored:** Tab stream caches are maintained in temporary session memory and purged immediately when tabs are closed.

### 3. Limitations & Policy Compliance
- **DRM & Access Controls:** The extension does **not** bypass DRM encryption (e.g. Widevine, FairPlay, PlayReady), encrypted streams, paid subscriber gates, or authenticated access controls.
- **Platform Terms of Service:** Users are responsible for complying with the terms of service and intellectual property rights of websites they visit.

---

## 📦 Installation & Developer Setup

### Load Unpacked in Google Chrome:
1. Open Google Chrome and visit `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension` folder located inside this project directory:
   ```
   c:\Users\INDIA TECHNOLOGY\Downloads\op.downloads\extension
   ```
5. The **op.downloads** extension is now active. Pin it to your Chrome toolbar for quick access.

### Reloading After Updates:
1. Navigate to `chrome://extensions/`.
2. Locate the **op.downloads** card and click the **↻ (Reload)** icon.
3. Refresh any open webpages (`F5`) to load updated content scripts.

---

## 🧪 Testing & Verification

### Running Automated Test Suite:
Run the comprehensive 20-point automated test suite:
```bash
python scripts/test_extension.py -v
```
Tests verify:
- Manifest V3 configuration and icon assets.
- Filename sanitization against Windows reserved devices (`CON`, `PRN`, `AUX`, `NUL`) and path traversal.
- URL protocol validation (`http:`, `https:`, `blob:`, `data:`).
- HLS playlist bandwidth parsing and segment resolution.
- XSS prevention and safe DOM node creation.
- Repository file parity between root, `extension/`, and `src/extensionData.ts`.

### Running Asset Synchronization:
To mirror any edits between root files and the `extension/` directory:
```bash
python scripts/sync_extension_data.py
```

### Running Asset Syntax Validator:
```bash
python scripts/validate_extension.py
```

---

## 📋 Chrome Manual Testing Checklist

1. **Hover Download Button:**
   - Open a webpage with ordinary images (e.g., Unsplash, Wikipedia).
   - Hover cursor over any image -> Verify top-right `[ PNG ]` and `[ JPG ]` buttons appear.
   - Click `[ PNG ]` -> Verify image downloads as a valid `.png` file.
2. **Video Playback & Speed:**
   - Open any HTML5 video player.
   - Open the popup, navigate to the **⚡ Speed** tab, and select **2x** or move the slider.
   - Verify video playback rate changes immediately.
3. **HLS Stream Sniffing:**
   - Open a website streaming `.m3u8` video.
   - Open popup -> Verify sniffed streams section displays the detected stream.
   - Click `⬇ MP4` -> Verify progress notifications and file saving to Downloads.
4. **Keyboard Accessibility:**
   - Open popup and press `Tab` to reach navigation tabs.
   - Use `ArrowRight` and `ArrowLeft` to switch tabs.
   - Verify focus outlines are clearly visible.
5. **System Page Safety:**
   - Open popup on `chrome://extensions` or Chrome Web Store.
   - Verify popup displays a friendly informational status without errors or crashes.
