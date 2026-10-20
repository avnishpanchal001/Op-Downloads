/**
 * Complete Chrome Extension Source Code & Definitions for "op.downloads" (v3.2.0)
 */

export interface ExtensionFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const MANIFEST_JSON = `{
  "manifest_version": 3,
  "name": "op.downloads",
  "version": "3.2.0",
  "description": "op.downloads - Advanced Universal Video & Image Downloader with Hover Buttons, HLS/m3u8 Stream Sniffer, Restricted Media Unlocker & 1x-10x Speed Controller.",
  "permissions": [
    "storage",
    "downloads",
    "contextMenus",
    "activeTab",
    "webRequest"
  ],
  "host_permissions": [
    "*://*/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "<all_urls>"
      ],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true
    },
    {
      "matches": [
        "<all_urls>"
      ],
      "js": ["injected.js"],
      "world": "MAIN",
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "op.downloads",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
`;

export const BACKGROUND_JS = `/**
 * op.downloads - Background Service Worker (Manifest V3 - v3.2.0)
 * 
 * - Multi-Channel Network Stream Sniffer (onBeforeRequest + onHeadersReceived)
 * - Persistent Stream Cache safe for Service Worker suspension & restarts
 * - High-speed parallel HLS Segment Fetcher & Binary Merger (.ts / fMP4 to MP4)
 * - Pure Binary Image Converter & Downloader (OffscreenCanvas JPG/PNG with resource cleanup)
 * - Authoritative Download State Tracking via chrome.downloads.onChanged
 * - Universal MP4 Video Downloader with Windows-safe filename sanitization & URL validation
 */

/* ==========================================================================
   0. SECURITY, SANITIZATION & URL UTILITIES
   ========================================================================== */

/**
 * Sanitizes filenames against Windows reserved device names, path traversal,
 * control characters, illegal filesystem characters, and excessive lengths.
 */
function sanitizeFileName(name, defaultName = 'media-file') {
  if (!name || typeof name !== 'string') return defaultName;

  const illegalCharsRegex = new RegExp('[<>:"/\\\\\\\\|?*\\\\x00-\\\\x1F\\\\x7F-\\\\x9F]', 'g');
  const trimDotsRegex = new RegExp('^[.\\\\s]+|[.\\\\s]+$', 'g');
  const reservedRegex = new RegExp('^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\\\..*)?$', 'i');

  let clean = name
    .replace(illegalCharsRegex, '_')
    .replace(/\\s+/g, ' ')
    .trim();

  // Strip leading and trailing periods and spaces (Windows restriction)
  clean = clean.replace(trimDotsRegex, '');

  // If filename consists entirely of underscores or invalid chars, fallback
  if (clean.replace(/_/g, '').trim().length === 0) {
    clean = defaultName;
  }

  // Check for Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (reservedRegex.test(clean) || clean.length === 0) {
    clean = defaultName;
  }

  // Bound length to 80 chars
  return clean.substring(0, 80) || defaultName;
}

/**
 * Validates that a URL uses a permitted scheme (http:, https:, data:, blob:)
 */
function isValidMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'data:' ||
      parsed.protocol === 'blob:'
    );
  } catch (e) {
    return false;
  }
}

/**
 * Safely resolves relative URLs against a base URL
 */
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch (e) {
    return relative;
  }
}

/**
 * Converts Chrome download interrupt reasons into actionable, user-friendly messages
 */
function formatDownloadError(reason) {
  if (!reason) return 'Download was interrupted.';
  const normalized = String(reason).toUpperCase();
  if (normalized.includes('FILE_ACCESS_DENIED') || normalized.includes('FILE_BLOCKED')) {
    return 'Permission denied: Cannot write file to selected location.';
  }
  if (normalized.includes('FILE_NO_SPACE')) {
    return 'Disk full: Not enough storage space to save the file.';
  }
  if (normalized.includes('NETWORK_FAILED') || normalized.includes('NETWORK_TIMEOUT')) {
    return 'Network connection failed during download.';
  }
  if (normalized.includes('SERVER_FORBIDDEN') || normalized.includes('SERVER_UNAUTHORIZED')) {
    return 'Access expired or forbidden by server.';
  }
  if (normalized.includes('SERVER_BAD_CONTENT')) {
    return 'Server returned corrupt or invalid media content.';
  }
  if (normalized.includes('USER_CANCELED')) {
    return 'Download was canceled.';
  }
  return \`Download stopped (\${reason}).\`;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ArrayToBase64(bytes) {
  let result = '';
  const len = bytes.length;
  const extra = len % 3;
  const mainLen = len - extra;
  const CHUNK = 49152;
  for (let offset = 0; offset < mainLen; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, mainLen);
    let chunkStr = '';
    for (let i = offset; i < end; i += 3) {
      const b0 = bytes[i];
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      chunkStr += B64_CHARS[b0 >> 2] +
                  B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)] +
                  B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] +
                  B64_CHARS[b2 & 63];
    }
    result += chunkStr;
  }
  if (extra === 1) {
    const b0 = bytes[mainLen];
    result += B64_CHARS[b0 >> 2] + B64_CHARS[(b0 & 3) << 4] + '==';
  } else if (extra === 2) {
    const b0 = bytes[mainLen];
    const b1 = bytes[mainLen + 1];
    result += B64_CHARS[b0 >> 2] + B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)] + B64_CHARS[(b1 & 15) << 2] + '=';
  }
  return result;
}

function uint8ArrayToDataUrl(uint8, mime = 'video/mp4') {
  return \`data:\${mime};base64,\${uint8ArrayToBase64(uint8)}\`;
}

/* ==========================================================================
   1. AUTHORITATIVE DOWNLOAD TRACKING (chrome.downloads.onChanged)
   ========================================================================== */

// Tracks active downloads: downloadId -> { filename, blobUrl, startTime }
const activeDownloads = new Map();

if (chrome.downloads && chrome.downloads.onChanged) {
  chrome.downloads.onChanged.addListener(async (delta) => {
    if (!delta || !delta.id) return;
    const downloadId = delta.id;
    const active = activeDownloads.get(downloadId);
    if (!active) return;

    if (delta.state) {
      if (delta.state.current === 'complete') {
        activeDownloads.delete(downloadId);
        await chrome.storage.local.set({
          downloadState: {
            status: 'success',
            text: \`✓ Saved \${active.filename} directly to PC Downloads!\`,
            pct: 100,
            filename: active.filename,
            timestamp: Date.now()
          }
        });
        if (active.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(active.blobUrl); } catch (e) {}
        }
      } else if (delta.state.current === 'interrupted') {
        activeDownloads.delete(downloadId);
        const errReason = delta.error ? delta.error.current : 'Unknown';
        await chrome.storage.local.set({
          downloadState: {
            status: 'error',
            text: formatDownloadError(errReason),
            pct: 0,
            timestamp: Date.now()
          }
        });
        if (active.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(active.blobUrl); } catch (e) {}
        }
      }
    }
  });
}

/* ==========================================================================
   2. CONTEXT MENUS SETUP & ACTIONS
   ========================================================================== */

function setupContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'op_download_img_png',
      title: '🖼 op.downloads: Save Image as PNG',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      id: 'op_download_img_jpg',
      title: '🖼 op.downloads: Save Image as JPG',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      id: 'op_download_video_mp4',
      title: '🎬 op.downloads: Save Video as MP4',
      contexts: ['video']
    });
    chrome.contextMenus.create({
      id: 'op_speed_sep',
      type: 'separator',
      contexts: ['video', 'page']
    });
    chrome.contextMenus.create({
      id: 'op_speed_2x',
      title: '⚡ Play at 2x Speed',
      contexts: ['video', 'page']
    });
    chrome.contextMenus.create({
      id: 'op_speed_3x',
      title: '⚡ Play at 3x Speed',
      contexts: ['video', 'page']
    });
    chrome.contextMenus.create({
      id: 'op_speed_5x',
      title: '⚡ Play at 5x Speed',
      contexts: ['video', 'page']
    });
    chrome.contextMenus.create({
      id: 'op_speed_10x',
      title: '⚡ Play at 10x Speed',
      contexts: ['video', 'page']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  restoreTabStreams();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
  restoreTabStreams();
});

if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const pageTitle = (tab && tab.title ? tab.title : 'download').replace('- YouTube', '').trim();

    if (info.menuItemId === 'op_download_img_png' && info.srcUrl) {
      if (isValidMediaUrl(info.srcUrl)) {
        convertAndDownloadImage(info.srcUrl, 'png', pageTitle);
      }
    } else if (info.menuItemId === 'op_download_img_jpg' && info.srcUrl) {
      if (isValidMediaUrl(info.srcUrl)) {
        convertAndDownloadImage(info.srcUrl, 'jpg', pageTitle);
      }
    } else if (info.menuItemId === 'op_download_video_mp4' && (info.srcUrl || info.linkUrl)) {
      const videoUrl = info.srcUrl || info.linkUrl;
      if (isValidMediaUrl(videoUrl)) {
        downloadVideoDirect(videoUrl, pageTitle, '.mp4');
      }
    }

    const speedMap = {
      op_speed_2x: 2.0,
      op_speed_3x: 3.0,
      op_speed_5x: 5.0,
      op_speed_10x: 10.0
    };

    if (speedMap[info.menuItemId] && tab && tab.id) {
      const speed = speedMap[info.menuItemId];
      chrome.tabs.sendMessage(tab.id, {
        type: 'SET_PLAYBACK_SPEED',
        speed: speed
      }).catch(() => {});
      chrome.storage.local.set({ preferredSpeed: speed });
    }
  });
}

/* ==========================================================================
   3. MULTI-CHANNEL NETWORK STREAM SNIFFER (PERSISTENT & SUSPEND-SAFE)
   ========================================================================== */

// tabStreams: tabId -> Array of { url, type, formatLabel, contentLength, timestamp }
const tabStreams = new Map();
let persistDebounceTimer = null;

async function getStorageForStreams() {
  if (chrome.storage && chrome.storage.session) {
    return chrome.storage.session;
  }
  return chrome.storage.local;
}

async function restoreTabStreams() {
  try {
    const storage = await getStorageForStreams();
    const data = await storage.get('tabStreamsCache');
    if (data && data.tabStreamsCache) {
      for (const [tabIdStr, list] of Object.entries(data.tabStreamsCache)) {
        const tabId = parseInt(tabIdStr, 10);
        if (!isNaN(tabId) && Array.isArray(list)) {
          tabStreams.set(tabId, list);
        }
      }
    }
  } catch (e) {
    console.warn('[op.downloads] Could not restore tab streams cache:', e);
  }
}

function schedulePersistTabStreams() {
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
  persistDebounceTimer = setTimeout(async () => {
    try {
      const storage = await getStorageForStreams();
      const serialized = {};
      for (const [tabId, list] of tabStreams.entries()) {
        serialized[tabId.toString()] = list;
      }
      await storage.set({ tabStreamsCache: serialized });
    } catch (e) {}
  }, 200);
}

function registerStream(tabId, streamData) {
  if (!tabId || tabId <= 0 || !streamData || !streamData.url) return;
  if (!isValidMediaUrl(streamData.url)) return;

  if (!tabStreams.has(tabId)) {
    tabStreams.set(tabId, []);
  }

  const list = tabStreams.get(tabId);
  const existingIndex = list.findIndex((s) => s.url === streamData.url);
  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...streamData, timestamp: Date.now() };
  } else {
    list.unshift({
      ...streamData,
      timestamp: Date.now()
    });
    if (list.length > 30) {
      list.pop();
    }
  }
  schedulePersistTabStreams();
}

// Channel A: Request URL Pattern Sniffer
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  try {
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (!details.url || details.tabId <= 0) return;
        const url = details.url;
        const cleanUrl = url.split('?')[0].toLowerCase();

        // 1. Detect HLS (.m3u8) Playlists
        if (
          cleanUrl.endsWith('.m3u8') ||
          url.includes('.m3u8') ||
          url.includes('/hls/') ||
          url.includes('playlist.m3u8') ||
          url.includes('master.m3u8')
        ) {
          registerStream(details.tabId, {
            url: url,
            type: 'hls',
            ext: '.m3u8',
            formatLabel: 'HLS Stream (m3u8)'
          });
          return;
        }

        // 2. Detect MPEG-DASH (.mpd) Manifests
        if (cleanUrl.endsWith('.mpd') || url.includes('.mpd') || url.includes('/dash/')) {
          registerStream(details.tabId, {
            url: url,
            type: 'dash',
            ext: '.mpd',
            formatLabel: 'DASH Stream (mpd)'
          });
          return;
        }

        // 3. Detect Direct Video URLs (MP4, WebM, etc.) & Social/CDN Video Streams
        if (
          cleanUrl.endsWith('.mp4') ||
          cleanUrl.endsWith('.webm') ||
          cleanUrl.endsWith('.m4v') ||
          cleanUrl.endsWith('.mov') ||
          cleanUrl.endsWith('.flv') ||
          url.includes('.mp4?') ||
          url.includes('/video/tos/') ||
          url.includes('mime=video') ||
          url.includes('mime_type=video') ||
          url.includes('video.twimg.com') ||
          url.includes('v.redd.it') ||
          url.includes('vimeocdn.com') ||
          url.includes('player.vimeo.com/video') ||
          url.includes('master.json') ||
          (url.includes('videoplayback') && !url.includes('.m3u8'))
        ) {
          if (!url.includes('googlevideo.com/videoplayback?itag=251')) {
            registerStream(details.tabId, {
              url: url,
              type: 'direct',
              ext: cleanUrl.endsWith('.webm') ? '.webm' : '.mp4',
              formatLabel: cleanUrl.endsWith('.webm') ? 'WebM Video' : 'MP4 Video'
            });
          }
        }
      },
      { urls: ['<all_urls>'] }
    );
  } catch (err) {
    console.warn('[op.downloads] onBeforeRequest listener error:', err);
  }
}

// Channel B: Response Headers Content-Type Sniffer
if (chrome.webRequest && chrome.webRequest.onHeadersReceived) {
  try {
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        if (!details.url || details.tabId <= 0 || !details.responseHeaders) return;
        let contentType = '';
        let contentLength = 0;

        for (let i = 0; i < details.responseHeaders.length; i++) {
          const h = details.responseHeaders[i];
          const name = h.name.toLowerCase();
          if (name === 'content-type') contentType = (h.value || '').toLowerCase();
          if (name === 'content-length') contentLength = parseInt(h.value, 10) || 0;
        }

        // HLS Manifest response
        if (contentType.includes('application/x-mpegurl') || contentType.includes('application/vnd.apple.mpegurl')) {
          registerStream(details.tabId, {
            url: details.url,
            type: 'hls',
            ext: '.m3u8',
            formatLabel: 'HLS Stream (m3u8)'
          });
          return;
        }

        // DASH Manifest response
        if (contentType.includes('application/dash+xml')) {
          registerStream(details.tabId, {
            url: details.url,
            type: 'dash',
            ext: '.mpd',
            formatLabel: 'DASH Stream (mpd)'
          });
          return;
        }

        // Direct Video MIME response
        if (contentType.startsWith('video/')) {
          if (contentLength > 0 && contentLength < 80000) return;
          const isWebM = contentType.includes('webm');
          registerStream(details.tabId, {
            url: details.url,
            type: 'direct',
            ext: isWebM ? '.webm' : '.mp4',
            formatLabel: isWebM ? 'WebM Video' : 'MP4 Video',
            contentLength: contentLength
          });
          return;
        }

        // Binary streams with video URLs disguised as application/octet-stream
        if (contentType.includes('octet-stream') && contentLength > 100000) {
          const urlLower = details.url.toLowerCase();
          if (urlLower.includes('.mp4') || urlLower.includes('mime=video') || urlLower.includes('/video/')) {
            registerStream(details.tabId, {
              url: details.url,
              type: 'direct',
              ext: '.mp4',
              formatLabel: 'MP4 Video',
              contentLength: contentLength
            });
          }
        }
      },
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );
  } catch (err) {
    console.warn('[op.downloads] onHeadersReceived listener warning:', err);
  }
}

// Clean up memory and persistent cache when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreams.delete(tabId);
  schedulePersistTabStreams();
});

/* ==========================================================================
   4. HIGH-SPEED HLS (.m3u8) STREAM PARSER & PARALLEL MERGER
   ========================================================================== */

async function downloadHlsStream(m3u8Url, title, sendResponse) {
  if (!isValidMediaUrl(m3u8Url)) {
    const err = 'Invalid media stream URL.';
    await chrome.storage.local.set({ downloadState: { status: 'error', text: err, pct: 0 } });
    if (sendResponse) sendResponse({ ok: false, error: err });
    return;
  }

  const cleanTitle = sanitizeFileName(title || 'Stream_Video', 'Stream_Video');
  const filename = \`\${cleanTitle}_\${Date.now()}.mp4\`;

  try {
    await chrome.storage.local.set({
      downloadState: {
        status: 'connecting',
        text: '⏳ Fast-connecting to stream playlist...',
        pct: 5
      }
    });

    // 1. Fetch Playlist Text with timeout
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 15000);
    const m3u8Res = await fetch(m3u8Url, { signal: controller.signal });
    clearTimeout(fetchTimeout);

    if (!m3u8Res.ok) throw new Error(\`Stream fetch failed: HTTP \${m3u8Res.status}\`);
    const m3u8Text = await m3u8Res.text();

    let targetPlaylistUrl = m3u8Url;
    let playlistContent = m3u8Text;

    // 2. Resolve Master Playlist to Best Quality Variant (Highest bandwidth)
    if (m3u8Text.includes('#EXT-X-STREAM-INF')) {
      const lines = m3u8Text.split('\\n');
      let bestBandwidth = -1;
      let bestVariantUri = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          let bw = 0;
          const matchBw = line.match(/BANDWIDTH=(\\d+)/);
          if (matchBw) bw = parseInt(matchBw[1], 10);

          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine && !nextLine.startsWith('#')) {
              if (bw > bestBandwidth || !bestVariantUri) {
                bestBandwidth = bw;
                bestVariantUri = nextLine;
              }
              break;
            }
          }
        }
      }

      if (bestVariantUri) {
        targetPlaylistUrl = resolveUrl(m3u8Url, bestVariantUri);
        const subController = new AbortController();
        const subTimeout = setTimeout(() => subController.abort(), 15000);
        const subRes = await fetch(targetPlaylistUrl, { signal: subController.signal });
        clearTimeout(subTimeout);
        if (subRes.ok) {
          playlistContent = await subRes.text();
        }
      }
    }

    // 3. Extract Segments and CMAF / fMP4 Initialization Header
    const mediaLines = playlistContent.split('\\n');
    const segmentUrls = [];
    let initSegmentUrl = null;

    for (let i = 0; i < mediaLines.length; i++) {
      const line = mediaLines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXT-X-MAP:')) {
        const matchUri = line.match(/URI=["']([^"']+)["']/);
        if (matchUri) {
          initSegmentUrl = resolveUrl(targetPlaylistUrl, matchUri[1]);
        }
      } else if (!line.startsWith('#')) {
        segmentUrls.push(resolveUrl(targetPlaylistUrl, line));
      }
    }

    if (segmentUrls.length === 0) {
      throw new Error('No video chunks found in playlist.');
    }

    await chrome.storage.local.set({
      downloadState: {
        status: 'processing',
        text: \`⏳ Downloading 0/\${segmentUrls.length} stream chunks...\`,
        pct: 10
      }
    });

    // 4. Download Segments in High-Speed Parallel Batches (Concurrency: 8)
    const downloadedBuffers = new Array(segmentUrls.length);
    let completedCount = 0;
    const concurrency = 8;
    let nextIndex = 0;

    async function downloadWorker() {
      while (nextIndex < segmentUrls.length) {
        const idx = nextIndex++;
        const segUrl = segmentUrls[idx];
        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
          try {
            attempts++;
            const segController = new AbortController();
            const segTimeout = setTimeout(() => segController.abort(), 20000);
            const sRes = await fetch(segUrl, { signal: segController.signal });
            clearTimeout(segTimeout);

            if (sRes.ok) {
              const ab = await sRes.arrayBuffer();
              downloadedBuffers[idx] = new Uint8Array(ab);
              success = true;
            }
          } catch (e) {
            if (attempts >= 3) {
              downloadedBuffers[idx] = new Uint8Array(0);
            } else {
              await new Promise((r) => setTimeout(r, 200 * attempts));
            }
          }
        }

        completedCount++;
        const pct = Math.min(95, Math.round(10 + (completedCount / segmentUrls.length) * 85));
        await chrome.storage.local.set({
          downloadState: {
            status: 'processing',
            text: \`⏳ Downloading chunks: \${completedCount}/\${segmentUrls.length} (\${pct}%)...\`,
            pct: pct
          }
        });
      }
    }

    // Fetch CMAF init segment if present
    let initBuffer = null;
    if (initSegmentUrl) {
      try {
        const initController = new AbortController();
        const initTimeout = setTimeout(() => initController.abort(), 15000);
        const initRes = await fetch(initSegmentUrl, { signal: initController.signal });
        clearTimeout(initTimeout);
        if (initRes.ok) {
          initBuffer = new Uint8Array(await initRes.arrayBuffer());
        }
      } catch (e) {}
    }

    // Launch parallel download workers
    const workers = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(downloadWorker());
    }
    await Promise.all(workers);

    // 5. Merge all segments into contiguous buffer
    let totalBytes = initBuffer ? initBuffer.byteLength : 0;
    for (let i = 0; i < downloadedBuffers.length; i++) {
      if (downloadedBuffers[i]) {
        totalBytes += downloadedBuffers[i].byteLength;
      }
    }

    if (totalBytes === 0) {
      throw new Error('Downloaded stream data was empty.');
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    if (initBuffer) {
      merged.set(initBuffer, offset);
      offset += initBuffer.byteLength;
    }

    for (let i = 0; i < downloadedBuffers.length; i++) {
      if (downloadedBuffers[i]) {
        merged.set(downloadedBuffers[i], offset);
        offset += downloadedBuffers[i].byteLength;
        // Free segment buffer to reduce peak memory pressure
        downloadedBuffers[i] = null;
      }
    }

    await chrome.storage.local.set({
      downloadState: {
        status: 'saving',
        text: '⏳ Saving complete MP4 to PC Downloads...',
        pct: 99
      }
    });

    // 6. Direct PC Download via Blob URL (with safe fallback for small buffers)
    let downloadUrl = '';
    let isBlobUrl = false;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = new Blob([merged], { type: 'video/mp4' });
        downloadUrl = URL.createObjectURL(blob);
        isBlobUrl = true;
      } catch (blobErr) {
        console.warn('[op.downloads] Blob URL creation failed, using fallback:', blobErr);
      }
    }

    if (!downloadUrl) {
      // Memory safeguard: data URL string explosion only permitted under 45MB
      if (merged.byteLength > 45 * 1024 * 1024) {
        throw new Error('Stream size exceeds browser single-string memory limits. Please download via the direct stream link.');
      }
      downloadUrl = uint8ArrayToDataUrl(merged, 'video/mp4');
    }

    chrome.downloads.download({
      url: downloadUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        // Fallback with saveAs dialog if silent download fails
        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          saveAs: true,
          conflictAction: 'uniquify'
        }, (retryId) => {
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message;
            if (isBlobUrl && typeof URL.revokeObjectURL === 'function') {
              try { URL.revokeObjectURL(downloadUrl); } catch (e) {}
            }
            chrome.storage.local.set({
              downloadState: { status: 'error', text: \`Download error: \${err}\`, pct: 0 }
            });
            if (sendResponse) sendResponse({ ok: false, error: err });
          } else {
            activeDownloads.set(retryId, { filename, blobUrl: isBlobUrl ? downloadUrl : null, startTime: Date.now() });
            if (sendResponse) sendResponse({ ok: true, filename: filename });
          }
        });
      } else {
        activeDownloads.set(downloadId, { filename, blobUrl: isBlobUrl ? downloadUrl : null, startTime: Date.now() });
        if (sendResponse) sendResponse({ ok: true, filename: filename });
      }
    });

  } catch (err) {
    console.error('[op.downloads] HLS download error:', err);
    await chrome.storage.local.set({
      downloadState: { status: 'error', text: \`Download error: \${err.message || 'Stream processing failed'}\`, pct: 0 }
    });
    if (sendResponse) sendResponse({ ok: false, error: err.message || 'Stream processing failed' });
  }
}

/* ==========================================================================
   5. PURE BINARY IMAGE CONVERTER & DOWNLOADER (JPG / PNG)
   ========================================================================== */

async function convertAndDownloadImage(imageUrl, format, baseTitle) {
  if (!isValidMediaUrl(imageUrl)) {
    console.warn('[op.downloads] Refusing to download invalid image URL:', imageUrl);
    return;
  }

  const targetExt = (format === 'jpg' || format === 'jpeg') ? '.jpg' : '.png';
  const cleanTitle = sanitizeFileName(baseTitle || 'image', 'image');
  const filename = \`\${cleanTitle}_\${Date.now()}\${targetExt}\`;

  // Data URLs can be passed directly to downloads API
  if (imageUrl.startsWith('data:')) {
    chrome.downloads.download({
      url: imageUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (dlId) => {
      if (dlId) {
        activeDownloads.set(dlId, { filename, blobUrl: null, startTime: Date.now() });
      }
    });
    return;
  }

  let bmp = null;
  let blobUrl = null;

  try {
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(fetchTimeout);

    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    const blob = await res.blob();

    bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');

    if (targetExt === '.jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, bmp.width, bmp.height);
    }
    ctx.drawImage(bmp, 0, 0);

    const mime = targetExt === '.jpg' ? 'image/jpeg' : 'image/png';
    const convertedBlob = await canvas.convertToBlob({ type: mime, quality: 0.95 });

    let finalDownloadUrl = '';
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        blobUrl = URL.createObjectURL(convertedBlob);
        finalDownloadUrl = blobUrl;
      } catch (e) {}
    }

    if (!finalDownloadUrl) {
      const buffer = await convertedBlob.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      finalDownloadUrl = uint8ArrayToDataUrl(uint8, mime);
    }

    chrome.downloads.download({
      url: finalDownloadUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (dlId) => {
      if (chrome.runtime.lastError) {
        chrome.downloads.download({
          url: imageUrl,
          filename: filename,
          saveAs: false,
          conflictAction: 'uniquify'
        });
      } else if (dlId) {
        activeDownloads.set(dlId, { filename, blobUrl, startTime: Date.now() });
      }
    });

  } catch (err) {
    // Graceful fallback to original image URL
    chrome.downloads.download({
      url: imageUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (dlId) => {
      if (dlId) {
        activeDownloads.set(dlId, { filename, blobUrl: null, startTime: Date.now() });
      }
    });
  } finally {
    if (bmp && typeof bmp.close === 'function') {
      try { bmp.close(); } catch (e) {}
    }
  }
}

/* ==========================================================================
   6. UNIVERSAL MP4 VIDEO DOWNLOADER
   ========================================================================== */

function downloadVideoDirect(url, title, ext) {
  if (!isValidMediaUrl(url)) {
    console.warn('[op.downloads] Refusing to download invalid video URL:', url);
    return;
  }

  const cleanTitle = sanitizeFileName(title || 'video', 'video');
  const targetExt = ext || '.mp4';
  const filename = \`\${cleanTitle}_\${Date.now()}\${targetExt}\`;

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false,
    conflictAction: 'uniquify'
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true,
        conflictAction: 'uniquify'
      }, (retryId) => {
        if (retryId) {
          activeDownloads.set(retryId, { filename, blobUrl: null, startTime: Date.now() });
        }
      });
    } else if (downloadId) {
      activeDownloads.set(downloadId, { filename, blobUrl: null, startTime: Date.now() });
    }
  });
}

/* ==========================================================================
   7. VIDEO DOWNLOAD FLOW (DIRECT STREAM & SERVICE RESOLVER)
   ========================================================================== */

async function handleStartDownload({ pageUrl, videoId, title, quality, directStreamUrl }, sendResponse) {
  const cleanTitle = sanitizeFileName(title || 'Video', 'Video');
  const ext = quality === 'mp3' ? '.mp3' : '.mp4';
  const filename = \`\${cleanTitle}_\${quality || '720'}p\${ext}\`;

  // If a verified direct stream was already intercepted by in-page hooks, use it immediately
  if (directStreamUrl && isValidMediaUrl(directStreamUrl)) {
    downloadVideoDirect(directStreamUrl, cleanTitle, ext);
    if (sendResponse) sendResponse({ ok: true, filename: filename });
    return;
  }

  const videoUrl = pageUrl || (videoId ? \`https://www.youtube.com/watch?v=\${videoId}\` : '');
  if (!videoUrl) {
    const err = 'No valid video URL provided for download.';
    await chrome.storage.local.set({ downloadState: { status: 'error', text: err, pct: 0 } });
    if (sendResponse) sendResponse({ ok: false, error: err });
    return;
  }

  try {
    await chrome.storage.local.set({
      downloadState: {
        status: 'connecting',
        text: '⏳ Connecting to fast download server...',
        pct: 5
      }
    });

    const apiUrl = \`https://p.savenow.to/ajax/download.php?url=\${encodeURIComponent(videoUrl)}&format=\${encodeURIComponent(quality || '720')}\`;
    const controller = new AbortController();
    const initTimeout = setTimeout(() => controller.abort(), 12000);
    const initRes = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(initTimeout);

    if (!initRes.ok) throw new Error(\`Download service returned HTTP \${initRes.status}\`);

    const initData = await initRes.json();
    if (!initData || (!initData.success && !initData.progress_url)) {
      throw new Error(initData?.text || initData?.message || 'Download service unavailable for this video');
    }

    let downloadUrl = initData.download_url || '';
    const progressUrl = initData.progress_url || '';

    if (!downloadUrl && progressUrl && isValidMediaUrl(progressUrl)) {
      let attempts = 0;
      const maxAttempts = 25; // Bounded retry safeguard
      while (!downloadUrl && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1200));
        attempts++;
        try {
          const pollController = new AbortController();
          const pollTimeout = setTimeout(() => pollController.abort(), 8000);
          const pollRes = await fetch(progressUrl, { signal: pollController.signal });
          clearTimeout(pollTimeout);

          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const pct = Math.min(99, Math.max(10, Math.round((pollData.progress || 0) / 10)));
            await chrome.storage.local.set({
              downloadState: {
                status: 'processing',
                text: \`⏳ Processing \${quality || '720'}p video (\${pct}%)...\`,
                pct: pct
              }
            });
            if (pollData.download_url && isValidMediaUrl(pollData.download_url)) {
              downloadUrl = pollData.download_url;
              break;
            }
          }
        } catch (pollErr) {}
      }
    }

    if (!downloadUrl || !isValidMediaUrl(downloadUrl)) {
      throw new Error('Video conversion timed out or server format unavailable. Please try another quality.');
    }

    await chrome.storage.local.set({
      downloadState: {
        status: 'saving',
        text: '⏳ Starting PC download...',
        pct: 100
      }
    });

    chrome.downloads.download({
      url: downloadUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, async (downloadId) => {
      if (chrome.runtime.lastError) {
        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          saveAs: true,
          conflictAction: 'uniquify'
        }, async (retryId) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message;
            await chrome.storage.local.set({
              downloadState: { status: 'error', text: \`Download error: \${errMsg}\`, pct: 0 }
            });
            if (sendResponse) sendResponse({ ok: false, error: errMsg });
          } else {
            activeDownloads.set(retryId, { filename, blobUrl: null, startTime: Date.now() });
            if (sendResponse) sendResponse({ ok: true, downloadId: retryId, filename: filename });
          }
        });
      } else {
        activeDownloads.set(downloadId, { filename, blobUrl: null, startTime: Date.now() });
        if (sendResponse) sendResponse({ ok: true, downloadId: downloadId, filename: filename });
      }
    });

  } catch (err) {
    console.error('[op.downloads] Download flow error:', err);
    await chrome.storage.local.set({
      downloadState: { status: 'error', text: \`Download error: \${err.message || 'Network error'}\`, pct: 0 }
    });
    if (sendResponse) sendResponse({ ok: false, error: err.message || 'Network error' });
  }
}

/* ==========================================================================
   8. MESSAGE LISTENER WITH SCHEMA VALIDATION & DEBOUNCING
   ========================================================================== */

const recentDownloadRequests = new Map(); // url -> timestamp to prevent duplicate clicks

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    if (sendResponse) sendResponse({ ok: false, error: 'Malformed message' });
    return false;
  }

  // Query Sniffed Streams for a Tab
  if (message.type === 'GET_TAB_STREAMS') {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    if (!tabId) {
      sendResponse({ ok: true, streams: [] });
      return false;
    }

    if (tabStreams.has(tabId)) {
      sendResponse({ ok: true, streams: tabStreams.get(tabId) });
      return false;
    }

    // Attempt restoring from session storage if worker just woke up
    restoreTabStreams().then(() => {
      const list = tabStreams.has(tabId) ? tabStreams.get(tabId) : [];
      sendResponse({ ok: true, streams: list });
    }).catch(() => {
      sendResponse({ ok: true, streams: [] });
    });
    return true; // async
  }

  // Report stream discovered in Content or Injected script
  if (message.type === 'REPORT_STREAM_FOUND') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId && message.stream && isValidMediaUrl(message.stream.url)) {
      registerStream(tabId, message.stream);
    }
    sendResponse({ ok: true });
    return false;
  }

  // 1-Click HLS Stream Download (.m3u8)
  if (message.type === 'DOWNLOAD_HLS') {
    if (!message.url || !isValidMediaUrl(message.url)) {
      sendResponse({ ok: false, error: 'Invalid stream URL.' });
      return false;
    }

    const now = Date.now();
    if (recentDownloadRequests.has(message.url) && now - recentDownloadRequests.get(message.url) < 2000) {
      sendResponse({ ok: false, error: 'Download already initiated.' });
      return false;
    }
    recentDownloadRequests.set(message.url, now);

    downloadHlsStream(message.url, message.title, sendResponse);
    return true; // async
  }

  // YouTube / Streaming Download
  if (message.type === 'START_DOWNLOAD') {
    handleStartDownload(message, sendResponse);
    return true; // async
  }

  // Direct Video Download
  if (message.type === 'DOWNLOAD_VIDEO') {
    if (!message.url || !isValidMediaUrl(message.url)) {
      sendResponse({ ok: false, error: 'Invalid video URL.' });
      return false;
    }
    downloadVideoDirect(message.url, message.title, message.ext || '.mp4');
    sendResponse({ ok: true });
    return false;
  }

  // Image Conversion & Download
  if (message.type === 'DOWNLOAD_IMAGE') {
    if (!message.url || !isValidMediaUrl(message.url)) {
      sendResponse({ ok: false, error: 'Invalid image URL.' });
      return false;
    }
    convertAndDownloadImage(message.url, message.format || 'png', message.title || 'image');
    sendResponse({ ok: true });
    return false;
  }

  // Batch Image Download with bounded concurrency
  if (message.type === 'DOWNLOAD_ALL_IMAGES') {
    const images = Array.isArray(message.images) ? message.images : [];
    const fmt = message.format || 'png';
    const baseTitle = message.title || 'image';

    const validImages = images.filter((img) => img && isValidMediaUrl(img.url)).slice(0, 100);
    validImages.forEach((img, idx) => {
      setTimeout(() => {
        convertAndDownloadImage(img.url, fmt, \`\${baseTitle}_\${idx + 1}\`);
      }, idx * 250);
    });

    sendResponse({ ok: true, count: validImages.length });
    return false;
  }

  return false;
});
`;

export const INJECTED_JS = `/**
 * op.downloads - MAIN World Universal Stream Sniffer & Media Hook (v3.2.0)
 * 
 * - Hooks window.fetch and XMLHttpRequest to detect HLS (.m3u8), DASH (.mpd), and MP4 streams across all websites
 * - Hooks HTMLMediaElement.prototype.play, setAttribute, and src setter to capture all playing videos
 * - Hardened against prototype pollution, malformed URLs, and unhandled exceptions
 * - YouTube Player Precision Playback Speed Controller (up to 10x / 16x)
 * - Safe inter-context messaging to content script
 */

(function () {
  'use strict';

  if (window.__opDownloadsMainLoaded) return;
  window.__opDownloadsMainLoaded = true;

  function isValidHttpUrl(str) {
    if (!str || typeof str !== 'string' || str.length > 4096) return false;
    const lower = str.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  }

  /* ==========================================================================
     1. UNIVERSAL NETWORK STREAM INTERCEPTOR (Fetch, XHR & Media Hooks)
     ========================================================================== */

  const detectedUrlCache = new Set();

  function notifyStreamDetected(url, source) {
    if (!url || typeof url !== 'string') return;
    const clean = url.trim();
    if (!isValidHttpUrl(clean) || detectedUrlCache.has(clean)) return;

    const lower = clean.split('?')[0].toLowerCase();
    const isStreamOrVideo = (
      lower.endsWith('.m3u8') ||
      clean.includes('.m3u8') ||
      lower.endsWith('.mpd') ||
      clean.includes('.mpd') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.webm') ||
      lower.endsWith('.m4v') ||
      lower.endsWith('.mov') ||
      clean.includes('mime=video') ||
      clean.includes('mime_type=video') ||
      clean.includes('/video/tos/') ||
      clean.includes('videoplayback') ||
      clean.includes('master.json') ||
      clean.includes('playlist.m3u8') ||
      (clean.includes('/video/') && (clean.includes('.ts') || clean.includes('.m4s') || clean.includes('token=')))
    );

    if (isStreamOrVideo) {
      detectedUrlCache.add(clean);
      if (detectedUrlCache.size > 200) {
        const first = detectedUrlCache.values().next().value;
        detectedUrlCache.delete(first);
      }

      try {
        window.postMessage({
          type: 'OPDOWNLOADS_STREAM_DETECTED',
          url: clean,
          source: source || 'network'
        }, '*');
      } catch (e) {}
    }
  }

  // Hook window.fetch safely
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      try {
        const input = args[0];
        let url = '';
        if (typeof input === 'string') {
          url = input;
        } else if (input && typeof input.url === 'string') {
          url = input.url;
        }
        if (url) {
          notifyStreamDetected(url, 'fetch');
        }
      } catch (e) {}
      return origFetch.apply(this, args);
    };
  }

  // Hook XMLHttpRequest.prototype.open safely
  if (typeof XMLHttpRequest === 'function' && XMLHttpRequest.prototype && XMLHttpRequest.prototype.open) {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (typeof url === 'string') {
          notifyStreamDetected(url, 'xhr');
        }
      } catch (e) {}
      return origOpen.call(this, method, url, ...rest);
    };
  }

  // Hook HTMLMediaElement (play, setAttribute, src descriptor)
  try {
    if (window.HTMLMediaElement && window.HTMLMediaElement.prototype) {
      const origPlay = window.HTMLMediaElement.prototype.play;
      window.HTMLMediaElement.prototype.play = function (...args) {
        try {
          const src = this.currentSrc || this.src;
          if (src && typeof src === 'string') {
            notifyStreamDetected(src, 'media_play');
            window.postMessage({
              type: 'OPDOWNLOADS_VIDEO_PLAYING',
              src: src,
              title: typeof document.title === 'string' ? document.title.substring(0, 120) : 'Video'
            }, '*');
          }
        } catch (e) {}
        return origPlay.apply(this, args);
      };

      const origSetAttribute = window.HTMLMediaElement.prototype.setAttribute;
      window.HTMLMediaElement.prototype.setAttribute = function (name, val) {
        try {
          if (typeof name === 'string' && name.toLowerCase() === 'src' && typeof val === 'string') {
            notifyStreamDetected(val, 'media_set_attr');
          }
        } catch (e) {}
        return origSetAttribute.apply(this, arguments);
      };

      const srcDescriptor = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'src');
      if (srcDescriptor && srcDescriptor.set) {
        const origSrcSet = srcDescriptor.set;
        Object.defineProperty(window.HTMLMediaElement.prototype, 'src', {
          ...srcDescriptor,
          set: function (val) {
            try {
              if (val && typeof val === 'string') {
                notifyStreamDetected(val, 'media_src_set');
              }
            } catch (e) {}
            return origSrcSet.call(this, val);
          }
        });
      }
    }
  } catch (e) {}

  /* ==========================================================================
     2. YOUTUBE HELPER & SPEED CONTROLLER
     ========================================================================== */

  const isYouTube = typeof window.location.hostname === 'string' && window.location.hostname.includes('youtube.com');

  let userPlaybackRate = 1.0;
  try {
    const saved = localStorage.getItem('opdownloads_preferred_speed');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 16.0) {
        userPlaybackRate = parsed;
      }
    }
  } catch (e) {}

  window.addEventListener('message', (event) => {
    if (!event || event.source !== window || !event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'OPDOWNLOADS_SET_SPEED') {
      setCustomSpeed(event.data.speed);
    } else if (event.data.type === 'OPDOWNLOADS_REQUEST_VIDEO_DATA') {
      sendVideoDataToContent();
    }
  });

  function getPlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  }

  function getVideo() {
    const player = getPlayer();
    if (player) {
      return player.querySelector('video.html5-main-video') || player.querySelector('video');
    }
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  function setCustomSpeed(speed) {
    const raw = parseFloat(speed);
    if (isNaN(raw)) return;
    const targetSpeed = Math.max(0.25, Math.min(16.0, raw));
    userPlaybackRate = targetSpeed;
    try {
      localStorage.setItem('opdownloads_preferred_speed', targetSpeed.toString());
    } catch (e) {}

    const video = getVideo();
    if (video) {
      video.playbackRate = targetSpeed;
    }
  }

  window.__opDownloadsStreams = window.__opDownloadsStreams || {};

  function extractStreamsFromPlayer() {
    const player = getPlayer();
    if (!player) return;
    try {
      const resp = typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : (window.ytInitialPlayerResponse || null);
      if (resp && resp.streamingData) {
        const fmts = [
          ...(resp.streamingData.formats || []),
          ...(resp.streamingData.adaptiveFormats || [])
        ];
        for (let i = 0; i < fmts.length; i++) {
          const f = fmts[i];
          if (f && f.url && f.itag && isValidHttpUrl(f.url)) {
            window.__opDownloadsStreams[f.itag.toString()] = f.url;
          }
        }
      }
    } catch (e) {}
  }

  function pickBestStream(itagCandidates) {
    for (let i = 0; i < itagCandidates.length; i++) {
      const itag = itagCandidates[i].toString();
      if (window.__opDownloadsStreams[itag]) {
        return window.__opDownloadsStreams[itag];
      }
    }
    return '';
  }

  function sendVideoDataToContent() {
    if (!isYouTube) return;
    extractStreamsFromPlayer();

    const player = getPlayer();
    let title = typeof document.title === 'string' ? document.title.replace('- YouTube', '').trim() : 'YouTube Video';
    let videoId = '';

    try {
      const urlParams = new URLSearchParams(window.location.search);
      videoId = urlParams.get('v') || '';

      if (player && typeof player.getVideoData === 'function') {
        const vData = player.getVideoData();
        if (vData) {
          if (vData.title && typeof vData.title === 'string') title = vData.title;
          if (vData.video_id && typeof vData.video_id === 'string') videoId = vData.video_id;
        }
      }
    } catch (e) {}

    const streamMap = {
      '1080': pickBestStream([137, 248, 399, 136, 18]),
      '720': pickBestStream([22, 136, 247, 398, 18, 137]),
      '480': pickBestStream([135, 244, 397, 18, 136]),
      '360': pickBestStream([18, 134, 243, 396, 135, 136]),
      'mp3': pickBestStream([140, 251, 139, 250, 249, 18])
    };

    const directStreamUrl = streamMap['720'] || streamMap['360'] || streamMap['1080'] || '';

    window.postMessage({
      type: 'OPDOWNLOADS_RESPONSE_VIDEO_DATA',
      title: title.substring(0, 120),
      videoId: videoId.substring(0, 32),
      currentSpeed: userPlaybackRate || 1.0,
      streamMap: streamMap,
      directStreamUrl: directStreamUrl
    }, '*');
  }

  function init() {
    if (isYouTube) {
      const video = getVideo();
      if (video && userPlaybackRate > 1.0 && video.playbackRate !== userPlaybackRate) {
        video.playbackRate = userPlaybackRate;
      }
    }
  }

  if (isYouTube) {
    window.addEventListener('yt-navigate-finish', init, { passive: true });
    window.addEventListener('yt-page-data-updated', init, { passive: true });
  }
  init();
})();
`;

export const CONTENT_JS = `/**
 * op.downloads - Universal Content Script (Manifest V3 - v3.2.0)
 * 
 * - 100% Reliable Top-Right Hover Download Badge on ANY Video or Image across ALL websites
 * - Deep Multi-Layer Detection (Composed Path, Shadow DOM, ElementsFromPoint, Direct Video Attach)
 * - Safe XSS-Free Toast & DOM Rendering
 * - Debounced MutationObserver & Throttled Pointer Tracking (Zero CPU Lag)
 * - Universal 1x to 10x Video Speed Controller
 */

(function () {
  'use strict';

  let preferredSpeed = 1.0;
  const isYouTube = typeof window.location.hostname === 'string' && window.location.hostname.includes('youtube.com');
  let hoverEnabled = true;

  function isValidHttpUrl(str) {
    if (!str || typeof str !== 'string' || str.length > 4096) return false;
    const lower = str.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  }

  // Load storage preferences safely
  try {
    chrome.storage.local.get({ preferredSpeed: 1.0, hoverEnabled: true }, (data) => {
      if (chrome.runtime.lastError || !data) return;
      if (data.hoverEnabled !== undefined) hoverEnabled = Boolean(data.hoverEnabled);
      if (data.preferredSpeed) {
        preferredSpeed = parseFloat(data.preferredSpeed) || 1.0;
        applySpeedToAllVideos(preferredSpeed);
      }
    });
  } catch (e) {}

  /* ==========================================================================
     0. SAFE ON-SCREEN TOAST NOTIFICATIONS (XSS-FREE)
     ========================================================================== */

  function showOpToast(text, type = 'info') {
    let toast = document.getElementById('op-downloads-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'op-downloads-toast';
      toast.style.cssText = \`
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        padding: 10px 16px;
        background: rgba(15, 23, 42, 0.95);
        color: #FFFFFF;
        border: 1px solid rgba(255, 230, 0, 0.5);
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        opacity: 0;
        transform: translateY(10px);
        display: flex;
        align-items: center;
        gap: 8px;
      \`;
      (document.body || document.documentElement).appendChild(toast);
    }

    const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠' : '⏳');
    const color = type === 'success' ? '#4ADE80' : (type === 'error' ? '#F87171' : '#FFE600');

    // Safe DOM construction without innerHTML
    toast.textContent = '';
    const iconSpan = document.createElement('span');
    iconSpan.style.color = color;
    iconSpan.style.fontSize = '14px';
    iconSpan.textContent = icon;

    const textSpan = document.createElement('span');
    textSpan.textContent = String(text || '');

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);

    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 3200);
  }

  /* ==========================================================================
     1. IN-PAGE STREAM SNIFFER & HOOK LISTENER
     ========================================================================== */

  let lastDetectedStreamUrl = '';

  window.addEventListener('message', (event) => {
    if (!event || event.source !== window || !event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'OPDOWNLOADS_STREAM_DETECTED' && event.data.url) {
      const url = event.data.url;
      if (isValidHttpUrl(url)) {
        lastDetectedStreamUrl = url;
        chrome.runtime.sendMessage({
          type: 'REPORT_STREAM_FOUND',
          stream: {
            url: url,
            type: url.includes('.m3u8') ? 'hls' : 'direct',
            ext: url.includes('.m3u8') ? '.m3u8' : '.mp4',
            formatLabel: url.includes('.m3u8') ? 'HLS Stream (m3u8)' : 'Video Stream'
          }
        }).catch(() => {});
      }
    } else if (event.data.type === 'OPDOWNLOADS_VIDEO_PLAYING') {
      const src = event.data.src;
      if (src && isValidHttpUrl(src)) {
        lastDetectedStreamUrl = src;
      }
      scheduleAttachAllVideos();
    }
  });

  function findResourceStreamUrls() {
    const urls = [];
    try {
      const entries = performance.getEntriesByType('resource');
      for (let i = entries.length - 1; i >= 0 && urls.length < 10; i--) {
        const u = entries[i].name;
        if (
          isValidHttpUrl(u) && (
            u.includes('.m3u8') ||
            u.includes('.mpd') ||
            u.includes('.mp4') ||
            u.includes('mime=video') ||
            (u.includes('videoplayback') && !u.includes('itag=251'))
          )
        ) {
          urls.push(u);
        }
      }
    } catch (e) {}
    return urls;
  }

  function findPageMetaVideoUrl() {
    try {
      const selectors = [
        'meta[property="og:video"]',
        'meta[property="og:video:secure_url"]',
        'meta[property="og:video:url"]',
        'meta[name="twitter:player:stream"]',
        'link[rel="video_src"]',
        'meta[itemprop="contentUrl"]'
      ];
      for (let i = 0; i < selectors.length; i++) {
        const el = document.querySelector(selectors[i]);
        if (el) {
          const val = el.getAttribute('content') || el.getAttribute('href');
          if (isValidHttpUrl(val)) {
            return val;
          }
        }
      }
    } catch (e) {}
    return '';
  }

  /* ==========================================================================
     2. UNIVERSAL HOVER DOWNLOAD BADGE (Top-Right of Image / Video)
     ========================================================================== */

  let hoverBadge = null;
  let activeMediaEl = null;
  let activeMediaInfo = null;
  let hideTimer = null;
  let isMouseOverBadge = false;

  function createHoverBadge() {
    let existing = document.getElementById('op-downloads-hover-badge');
    if (existing) return existing;

    const badge = document.createElement('div');
    badge.id = 'op-downloads-hover-badge';
    badge.style.cssText = \`
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 5px;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 230, 0, 0.5);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      border-radius: 8px;
      padding: 4px 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #FFFFFF;
      user-select: none;
      pointer-events: auto;
      transition: opacity 0.15s ease, transform 0.15s ease;
      opacity: 0;
      transform: translateY(-2px);
    \`;

    badge.addEventListener('mouseenter', () => {
      isMouseOverBadge = true;
      if (hideTimer) clearTimeout(hideTimer);
    });

    badge.addEventListener('mouseleave', () => {
      isMouseOverBadge = false;
      scheduleHideBadge();
    });

    (document.body || document.documentElement).appendChild(badge);
    return badge;
  }

  function scheduleHideBadge() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!isMouseOverBadge && hoverBadge) {
        hoverBadge.style.opacity = '0';
        hoverBadge.style.transform = 'translateY(-2px)';
        setTimeout(() => {
          if (!isMouseOverBadge && hoverBadge && hoverBadge.style.opacity === '0') {
            hoverBadge.style.display = 'none';
            activeMediaEl = null;
            activeMediaInfo = null;
          }
        }, 150);
      }
    }, 550);
  }

  function updateBadgePosition(rect) {
    if (!hoverBadge || hoverBadge.style.display === 'none' || !rect) return;
    const badgeWidth = hoverBadge.offsetWidth || 110;
    let top = Math.max(8, rect.top + 8);
    let left = Math.max(8, rect.right - badgeWidth - 8);

    hoverBadge.style.top = \`\${top}px\`;
    hoverBadge.style.left = \`\${left}px\`;
  }

  function createSvgIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#FFE600');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '7 10 12 15 17 10');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '12');
    line.setAttribute('y1', '15');
    line.setAttribute('x2', '12');
    line.setAttribute('y2', '3');

    svg.appendChild(path);
    svg.appendChild(poly);
    svg.appendChild(line);
    return svg;
  }

  function showBadgeForMedia(el, info, rect) {
    if (!hoverEnabled) return;
    if (hideTimer) clearTimeout(hideTimer);

    if (!hoverBadge) {
      hoverBadge = createHoverBadge();
    }

    if (activeMediaEl === el && hoverBadge.style.display === 'flex') {
      updateBadgePosition(rect);
      return;
    }

    activeMediaEl = el;
    activeMediaInfo = info;

    hoverBadge.textContent = '';

    if (info.type === 'video') {
      const btn = document.createElement('button');
      styleBadgeButton(btn);

      btn.appendChild(createSvgIcon());
      const label = document.createElement('span');
      label.style.color = '#FFFFFF';
      label.style.marginLeft = '3px';
      label.textContent = 'MP4';
      btn.appendChild(label);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.textContent = '⏳ Downloading...';
        triggerVideoDownload(info, el, () => {
          btn.textContent = '✓ Downloaded';
          setTimeout(() => {
            btn.textContent = '';
            btn.appendChild(createSvgIcon());
            const lbl = document.createElement('span');
            lbl.style.color = '#FFFFFF';
            lbl.style.marginLeft = '3px';
            lbl.textContent = 'MP4';
            btn.appendChild(lbl);
          }, 3000);
        });
      });
      hoverBadge.appendChild(btn);
    } else {
      // Image: Offer PNG and JPG buttons
      const btnPng = document.createElement('button');
      styleBadgeButton(btnPng);
      btnPng.appendChild(createSvgIcon());
      const lblPng = document.createElement('span');
      lblPng.style.color = '#FFFFFF';
      lblPng.style.marginLeft = '2px';
      lblPng.textContent = 'PNG';
      btnPng.appendChild(lblPng);

      btnPng.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerImageDownload(info, 'png');
        btnPng.textContent = '✓ Saved';
        setTimeout(() => {
          btnPng.textContent = '';
          btnPng.appendChild(createSvgIcon());
          const l = document.createElement('span');
          l.style.color = '#FFFFFF';
          l.style.marginLeft = '2px';
          l.textContent = 'PNG';
          btnPng.appendChild(l);
        }, 2000);
      });

      const btnJpg = document.createElement('button');
      styleBadgeButton(btnJpg);
      const lblJpg = document.createElement('span');
      lblJpg.style.color = '#FFFFFF';
      lblJpg.textContent = 'JPG';
      btnJpg.appendChild(lblJpg);

      btnJpg.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerImageDownload(info, 'jpg');
        btnJpg.textContent = '✓ Saved';
        setTimeout(() => {
          btnJpg.textContent = '';
          const l = document.createElement('span');
          l.style.color = '#FFFFFF';
          l.textContent = 'JPG';
          btnJpg.appendChild(l);
        }, 2000);
      });

      hoverBadge.appendChild(btnPng);
      hoverBadge.appendChild(btnJpg);
    }

    hoverBadge.style.display = 'flex';
    updateBadgePosition(rect);

    requestAnimationFrame(() => {
      if (hoverBadge) {
        hoverBadge.style.opacity = '1';
        hoverBadge.style.transform = 'translateY(0)';
      }
    });
  }

  function styleBadgeButton(btn) {
    btn.style.cssText = \`
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 800;
      padding: 3px 7px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      transition: background 0.15s ease, border-color 0.15s ease;
      white-space: nowrap;
    \`;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255, 230, 0, 0.28)';
      btn.style.borderColor = '#FFE600';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.14)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
    });
  }

  /* ==========================================================================
     3. DEEP RESTRICTED MEDIA DETECTOR & UNLOCKER
     ========================================================================== */

  function extractHighestResImageUrl(img) {
    if (!img) return '';

    // Check srcset attribute
    const srcset = img.getAttribute('srcset') || img.srcset;
    if (srcset && typeof srcset === 'string') {
      const candidates = srcset.split(',').map((item) => {
        const parts = item.trim().split(/\\s+/);
        const url = parts[0];
        let score = 0;
        if (parts[1]) {
          const wMatch = parts[1].match(/(\\d+)w/);
          const xMatch = parts[1].match(/(\\d+(?:\\.\\d+)?)x/);
          if (wMatch) score = parseInt(wMatch[1], 10);
          else if (xMatch) score = parseFloat(xMatch[1]) * 1000;
        }
        return { url, score };
      });

      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length > 0 && candidates[0].url) {
        return candidates[0].url;
      }
    }

    // Check parent <picture> element
    if (img.parentElement && img.parentElement.tagName === 'PICTURE') {
      const sources = img.parentElement.querySelectorAll('source');
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i].getAttribute('srcset');
        if (s) {
          const parts = s.split(',').map((p) => p.trim().split(/\\s+/)[0]);
          if (parts[parts.length - 1]) return parts[parts.length - 1];
        }
      }
    }

    // Check high-res data attributes
    const highResAttrs = [
      'data-original',
      'data-highres',
      'data-full-url',
      'data-zoom-src',
      'data-large_image',
      'data-src',
      'data-lazy-src'
    ];
    for (let i = 0; i < highResAttrs.length; i++) {
      const val = img.getAttribute(highResAttrs[i]);
      if (val && !val.startsWith('javascript:')) return val;
    }

    return img.currentSrc || img.src || '';
  }

  function findNestedVideo(root, depth = 0) {
    if (!root || depth > 4) return null;
    if (root.tagName === 'VIDEO') return root;
    if (root.querySelector) {
      try {
        const v = root.querySelector('video');
        if (v) return v;
      } catch (e) {}
    }
    if (root.shadowRoot) {
      const v = findNestedVideo(root.shadowRoot, depth + 1);
      if (v) return v;
    }
    return null;
  }

  function isVideoIframe(el) {
    if (!el || el.tagName !== 'IFRAME') return false;
    const src = (el.src || el.getAttribute('src') || '').toLowerCase();
    const hasFs = el.hasAttribute('allowfullscreen') || (el.getAttribute('allow') || '').includes('fullscreen');
    const isVideoSrc = (
      src.includes('player') ||
      src.includes('video') ||
      src.includes('embed') ||
      src.includes('stream') ||
      src.includes('vimeo') ||
      src.includes('youtube') ||
      src.includes('dailymotion') ||
      src.includes('twitch') ||
      src.includes('.mp4') ||
      src.includes('.m3u8')
    );
    return isVideoSrc || hasFs;
  }

  function inspectElementForMedia(rawEl, mouseX, mouseY, eventPath) {
    if (hoverBadge && isMouseOverBadge) return null;

    // Check composed path first (crosses shadow DOM boundaries)
    if (eventPath && Array.isArray(eventPath)) {
      for (let i = 0; i < eventPath.length; i++) {
        const el = eventPath[i];
        if (!el || !el.tagName) continue;
        if (el.id === 'op-downloads-hover-badge' || (el.closest && el.closest('#op-downloads-hover-badge'))) {
          return null;
        }

        // Direct Video
        if (el.tagName === 'VIDEO') {
          const r = el.getBoundingClientRect();
          if (r.width >= 50 && r.height >= 50) {
            return {
              element: el,
              rect: r,
              info: { type: 'video', url: el.currentSrc || el.src || '', title: document.title || 'Video' }
            };
          }
        }

        // Nested Video
        const nestedVideo = findNestedVideo(el);
        if (nestedVideo) {
          const r = nestedVideo.getBoundingClientRect();
          if (r.width >= 50 && r.height >= 50) {
            return {
              element: nestedVideo,
              rect: r,
              info: { type: 'video', url: nestedVideo.currentSrc || nestedVideo.src || '', title: document.title || 'Video' }
            };
          }
        }

        // Embedded Iframe Video
        if (isVideoIframe(el)) {
          const r = el.getBoundingClientRect();
          if (r.width >= 160 && r.height >= 90) {
            return {
              element: el,
              rect: r,
              info: { type: 'video', isIframe: true, url: el.src || '', title: document.title || 'Embedded Video' }
            };
          }
        }

        // Direct Image
        if (el.tagName === 'IMG') {
          const r = el.getBoundingClientRect();
          if (r.width >= 50 && r.height >= 50) {
            const src = extractHighestResImageUrl(el);
            if (src && !src.startsWith('javascript:')) {
              return {
                element: el,
                rect: r,
                info: { type: 'image', url: src, title: el.alt || el.title || document.title || 'Image' }
              };
            }
          }
        }

        // Canvas
        if (el.tagName === 'CANVAS') {
          const r = el.getBoundingClientRect();
          if (r.width >= 50 && r.height >= 50) {
            return {
              element: el,
              rect: r,
              info: { type: 'canvas', canvasEl: el, title: document.title || 'Canvas_Image' }
            };
          }
        }
      }
    }

    // Secondary check: look beneath transparent overlays
    if (document.elementsFromPoint && mouseX !== undefined && mouseY !== undefined) {
      try {
        const elements = document.elementsFromPoint(mouseX, mouseY);
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (!el || !el.tagName) continue;
          if (el.id === 'op-downloads-hover-badge' || (el.closest && el.closest('#op-downloads-hover-badge'))) {
            return null;
          }

          const rect = el.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 50) continue;

          if (el.tagName === 'VIDEO') {
            return {
              element: el,
              rect: rect,
              info: { type: 'video', url: el.currentSrc || el.src || '', title: document.title || 'Video' }
            };
          }

          if (el.tagName === 'IMG') {
            const src = extractHighestResImageUrl(el);
            if (src && !src.startsWith('javascript:')) {
              return {
                element: el,
                rect: rect,
                info: { type: 'image', url: src, title: el.alt || el.title || document.title || 'Image' }
              };
            }
          }

          if (el.tagName === 'CANVAS') {
            return {
              element: el,
              rect: rect,
              info: { type: 'canvas', canvasEl: el, title: document.title || 'Canvas_Image' }
            };
          }
        }
      } catch (e) {}
    }

    return null;
  }

  // Smooth Throttled Pointer Activity Tracker
  let isCheckingMove = false;
  let lastMoveTime = 0;

  function handlePointerActivity(e) {
    if (!hoverEnabled) return;

    if (hoverBadge && (hoverBadge === e.target || hoverBadge.contains(e.target))) {
      isMouseOverBadge = true;
      if (hideTimer) clearTimeout(hideTimer);
      return;
    }

    const now = Date.now();
    if (now - lastMoveTime < 30) return; // 30ms throttle avoids high CPU on heavy pages
    lastMoveTime = now;

    // Fast check: if mouse is still inside active media bounds
    if (activeMediaEl && !isMouseOverBadge) {
      try {
        const r = activeMediaEl.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          updateBadgePosition(r);
          return;
        }
      } catch (err) {}
    }

    if (isCheckingMove) return;
    isCheckingMove = true;

    requestAnimationFrame(() => {
      isCheckingMove = false;
      const path = e.composedPath ? e.composedPath() : [e.target];
      const media = inspectElementForMedia(e.target, e.clientX, e.clientY, path);

      if (media) {
        showBadgeForMedia(media.element, media.info, media.rect);
      } else {
        if (!isMouseOverBadge && hoverBadge && hoverBadge.style.display === 'flex') {
          scheduleHideBadge();
        }
      }
    });
  }

  document.addEventListener('mousemove', handlePointerActivity, { passive: true });
  document.addEventListener('mouseover', handlePointerActivity, { passive: true });

  // Direct Listeners for Every Video
  function attachVideoDirectListeners(video) {
    if (!video || video.__opDownloadsAttached) return;
    video.__opDownloadsAttached = true;

    const showForThisVideo = () => {
      if (!hoverEnabled) return;
      try {
        const r = video.getBoundingClientRect();
        if (r.width >= 50 && r.height >= 50) {
          showBadgeForMedia(video, { type: 'video', url: video.currentSrc || video.src || '', title: document.title }, r);
        }
      } catch (e) {}
    };

    video.addEventListener('pointerenter', showForThisVideo, { passive: true });
    video.addEventListener('play', showForThisVideo, { passive: true });
    video.addEventListener('playing', showForThisVideo, { passive: true });

    if (video.parentElement && !video.parentElement.__opDownloadsParentAttached) {
      video.parentElement.__opDownloadsParentAttached = true;
      video.parentElement.addEventListener('pointerenter', showForThisVideo, { passive: true });
    }
  }

  function getAllVideos() {
    const videos = [];
    try {
      const vs = document.querySelectorAll('video');
      for (let i = 0; i < vs.length; i++) {
        if (!videos.includes(vs[i])) videos.push(vs[i]);
      }
    } catch (e) {}
    return videos;
  }

  let attachDebounceTimer = null;
  function scheduleAttachAllVideos() {
    if (attachDebounceTimer) clearTimeout(attachDebounceTimer);
    attachDebounceTimer = setTimeout(() => {
      getAllVideos().forEach((v) => attachVideoDirectListeners(v));
    }, 150);
  }
  scheduleAttachAllVideos();

  // Unblock right-click on restricted media sites safely
  window.addEventListener('contextmenu', (e) => {
    const path = e.composedPath ? e.composedPath() : [e.target];
    const media = inspectElementForMedia(e.target, e.clientX, e.clientY, path);
    if (media) {
      e.stopPropagation();
    }
  }, true);

  /* ==========================================================================
     4. 1-CLICK ADVANCED VIDEO DOWNLOAD DISPATCHER
     ========================================================================== */

  async function triggerVideoDownload(info, videoEl, onDone) {
    if (isYouTube) {
      showOpToast('Connecting to high-speed YouTube engine...', 'info');
      chrome.runtime.sendMessage({
        type: 'START_DOWNLOAD',
        pageUrl: window.location.href,
        title: (document.title || '').replace('- YouTube', '').trim(),
        quality: '720'
      }, () => {
        if (onDone) onDone();
      });
      return;
    }

    // Step 1: Check direct URL from video element or source
    let candidateUrl = info.url || '';
    if ((!candidateUrl || candidateUrl.startsWith('blob:')) && videoEl) {
      candidateUrl = videoEl.currentSrc || videoEl.src || '';
      if ((!candidateUrl || candidateUrl.startsWith('blob:')) && videoEl.querySelectorAll) {
        const sources = videoEl.querySelectorAll('source');
        for (let s of sources) {
          const sSrc = s.src || s.getAttribute('src');
          if (sSrc && !sSrc.startsWith('blob:')) {
            candidateUrl = sSrc;
            break;
          }
        }
      }
    }

    if (candidateUrl && !candidateUrl.startsWith('blob:') && !candidateUrl.startsWith('data:')) {
      showOpToast('⬇ Starting direct video download...', 'info');
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_VIDEO',
        url: candidateUrl,
        title: info.title || document.title,
        ext: '.mp4'
      }, () => {
        showOpToast('✓ Video downloaded directly to PC!', 'success');
        if (onDone) onDone();
      });
      return;
    }

    // Step 2: Query Background Network Sniffer for captured streams
    showOpToast('🔍 Locating video stream...', 'info');

    chrome.runtime.sendMessage({ type: 'GET_TAB_STREAMS' }, (resp) => {
      let hlsStream = null;
      let directStream = null;

      if (resp && resp.streams && resp.streams.length > 0) {
        hlsStream = resp.streams.find((s) => s.type === 'hls');
        directStream = resp.streams.find((s) => s.type === 'direct');
      }

      if (!hlsStream && !directStream) {
        const perfUrls = findResourceStreamUrls();
        for (let i = 0; i < perfUrls.length; i++) {
          if (perfUrls[i].includes('.m3u8')) {
            hlsStream = { url: perfUrls[i] };
            break;
          } else if (!directStream && (perfUrls[i].includes('.mp4') || perfUrls[i].includes('mime=video'))) {
            directStream = { url: perfUrls[i] };
          }
        }
      }

      if (!hlsStream && !directStream) {
        const metaUrl = findPageMetaVideoUrl();
        if (metaUrl) {
          if (metaUrl.includes('.m3u8')) {
            hlsStream = { url: metaUrl };
          } else {
            directStream = { url: metaUrl };
          }
        }
      }

      if (!hlsStream && !directStream && lastDetectedStreamUrl) {
        if (lastDetectedStreamUrl.includes('.m3u8')) {
          hlsStream = { url: lastDetectedStreamUrl };
        } else {
          directStream = { url: lastDetectedStreamUrl };
        }
      }

      if (hlsStream) {
        showOpToast('⬇ Downloading & merging HLS video directly to PC...', 'info');
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_HLS',
          url: hlsStream.url,
          title: info.title || document.title
        }, () => {
          showOpToast('✓ Video downloaded to PC Downloads!', 'success');
          if (onDone) onDone();
        });
        return;
      }

      if (directStream) {
        showOpToast('⬇ Downloading video stream...', 'info');
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_VIDEO',
          url: directStream.url,
          title: info.title || document.title,
          ext: '.mp4'
        }, () => {
          showOpToast('✓ Video downloaded to PC Downloads!', 'success');
          if (onDone) onDone();
        });
        return;
      }

      showOpToast('Please press play on the video to start download.', 'error');
      if (videoEl && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
      if (onDone) onDone();
    });
  }

  function triggerImageDownload(info, format) {
    if (info.type === 'canvas' && info.canvasEl) {
      try {
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const dataUrl = info.canvasEl.toDataURL(mime, 0.95);
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_IMAGE',
          url: dataUrl,
          format: format,
          title: info.title || 'canvas_image'
        });
        showOpToast(\`✓ Saving canvas image as \${format.toUpperCase()}...\`, 'success');
        return;
      } catch (e) {}
    }

    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_IMAGE',
      url: info.url,
      format: format,
      title: info.title || document.title || 'image'
    });
    showOpToast(\`✓ Saving image as \${format.toUpperCase()}...\`, 'success');
  }

  /* ==========================================================================
     5. UNIVERSAL VIDEO SPEED CONTROLLER (1x to 10x)
     ========================================================================== */

  function applySpeedToVideo(video, speed) {
    if (!video) return;
    try {
      const spd = Math.max(0.25, Math.min(16.0, parseFloat(speed) || 1.0));
      if (video.playbackRate !== spd) {
        video.playbackRate = spd;
      }
      video.__opDownloadsSpeed = spd;

      if (!video.__opDownloadsBound) {
        video.__opDownloadsBound = true;

        video.addEventListener('ratechange', () => {
          if (video.__opDownloadsSpeed && video.playbackRate !== video.__opDownloadsSpeed) {
            video.playbackRate = video.__opDownloadsSpeed;
          }
        }, { passive: true });

        video.addEventListener('play', () => {
          if (video.__opDownloadsSpeed && video.playbackRate !== video.__opDownloadsSpeed) {
            video.playbackRate = video.__opDownloadsSpeed;
          }
        }, { passive: true });
      }
    } catch (e) {}
  }

  function applySpeedToAllVideos(speed) {
    preferredSpeed = speed;
    const videos = getAllVideos();
    videos.forEach((v) => applySpeedToVideo(v, speed));
    return videos.length;
  }

  // Debounced DOM Observer for dynamic SPAs
  let mutationDebounceTimer = null;
  const dynamicObserver = new MutationObserver(() => {
    if (mutationDebounceTimer) return;
    mutationDebounceTimer = setTimeout(() => {
      mutationDebounceTimer = null;
      scheduleAttachAllVideos();
      if (preferredSpeed !== 1.0) {
        getAllVideos().forEach((v) => {
          if (!v.__opDownloadsBound) {
            applySpeedToVideo(v, preferredSpeed);
          }
        });
      }
    }, 250);
  });

  try {
    dynamicObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  } catch (e) {}

  /* ==========================================================================
     6. POPUP SCANNER & MESSAGING
     ========================================================================== */

  function scanAllPageImages() {
    const images = [];
    const seenUrls = new Set();

    function addImg(url, w, h, alt) {
      if (!url || typeof url !== 'string') return;
      const clean = url.trim();
      if (!clean || clean.startsWith('javascript:') || seenUrls.has(clean)) return;
      if ((w && w < 30) || (h && h < 30)) return;
      seenUrls.add(clean);
      images.push({ url: clean, width: w || 0, height: h || 0, alt: alt || 'Image' });
    }

    document.querySelectorAll('img').forEach((img) => {
      const src = extractHighestResImageUrl(img);
      addImg(src, img.naturalWidth || img.width, img.naturalHeight || img.height, img.alt || img.title);
    });

    document.querySelectorAll('div, section, article, span, a').forEach((el) => {
      try {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg.startsWith('url(') && !bg.includes('none')) {
          const rawUrl = bg.slice(4, -1).replaceAll('"', '').replaceAll("'", '').trim();
          const r = el.getBoundingClientRect();
          if (r.width >= 50 && r.height >= 50) {
            addImg(rawUrl, Math.round(r.width), Math.round(r.height), 'Background Image');
          }
        }
      } catch (e) {}
    });

    return images.slice(0, 100);
  }

  function scanAllPageVideos() {
    const videos = [];
    const seenUrls = new Set();
    const pageTitle = (document.title || 'Web Video').trim();

    getAllVideos().forEach((v, index) => {
      let src = v.currentSrc || v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
      const isBlob = !src || src.startsWith('blob:');
      const identifier = src || \`video_index_\${index}\`;

      if (!seenUrls.has(identifier)) {
        seenUrls.add(identifier);
        const w = v.videoWidth || v.clientWidth || 0;
        const h = v.videoHeight || v.clientHeight || 0;
        videos.push({
          url: src,
          videoIndex: index,
          title: pageTitle ? \`\${pageTitle} (\${index + 1})\` : \`Video_\${index + 1}\`,
          width: w,
          height: h,
          duration: Math.round(v.duration || 0),
          resolution: w && h ? \`\${w}x\${h}\` : 'HD',
          isBlob: isBlob
        });
      }
    });

    if (videos.length === 0) {
      try {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((ifr, index) => {
          if (isVideoIframe(ifr)) {
            const r = ifr.getBoundingClientRect();
            if (r.width >= 160 && r.height >= 90) {
              videos.push({
                url: ifr.src || '',
                videoIndex: index,
                title: pageTitle ? \`\${pageTitle} (Embedded Player)\` : \`Embedded_Video_\${index + 1}\`,
                width: Math.round(r.width),
                height: Math.round(r.height),
                duration: 0,
                resolution: \`\${Math.round(r.width)}x\${Math.round(r.height)}\`,
                isBlob: true,
                isIframe: true
              });
            }
          }
        });
      } catch (e) {}
    }

    return videos;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      if (sendResponse) sendResponse({ ok: false, error: 'Malformed request' });
      return false;
    }

    if (message.type === 'SET_PLAYBACK_SPEED') {
      const speed = parseFloat(message.speed) || 1.0;
      const count = applySpeedToAllVideos(speed);
      if (isYouTube) {
        window.postMessage({ type: 'OPDOWNLOADS_SET_SPEED', speed: speed }, '*');
      }
      sendResponse({ ok: true, count: count, currentSpeed: speed });
      return false;
    }

    if (message.type === 'GET_PAGE_MEDIA') {
      sendResponse({
        ok: true,
        isYouTube: isYouTube,
        pageTitle: (document.title || 'Page Media').replace('- YouTube', '').trim(),
        currentSpeed: preferredSpeed,
        videoCount: getAllVideos().length,
        videos: scanAllPageVideos(),
        images: scanAllPageImages(),
        hoverEnabled: hoverEnabled
      });
      return false;
    }

    if (message.type === 'TRIGGER_PAGE_VIDEO_DOWNLOAD') {
      const idx = message.videoIndex || 0;
      const allV = getAllVideos();
      const targetVideo = allV[idx] || allV[0];
      if (targetVideo) {
        triggerVideoDownload({ url: targetVideo.currentSrc || targetVideo.src, title: message.title || document.title }, targetVideo, () => {
          sendResponse({ ok: true });
        });
        return true;
      } else {
        sendResponse({ ok: false, error: 'No video element found on page.' });
        return false;
      }
    }

    if (message.type === 'SET_HOVER_ENABLED') {
      hoverEnabled = message.enabled !== false;
      if (!hoverEnabled && hoverBadge) hoverBadge.style.display = 'none';
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  window.addEventListener('load', () => {
    scheduleAttachAllVideos();
    if (preferredSpeed !== 1.0) {
      applySpeedToAllVideos(preferredSpeed);
    }
  });

})();
`;

export const POPUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>op.downloads</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 340px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #FFFFFF;
      color: #0F172A;
      padding: 14px;
      user-select: none;
    }
    :focus-visible {
      outline: 2px solid #FFE600;
      outline-offset: 2px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-box {
      width: 28px;
      height: 28px;
      background: #FFE600;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(15, 23, 42, 0.15);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .brand-name {
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.5px;
    }
    .version-tag {
      font-size: 10px;
      font-weight: 700;
      color: #475569;
      background: #F1F5F9;
      padding: 2px 6px;
      border-radius: 6px;
    }

    /* Navigation Tabs */
    .tabs-nav {
      display: flex;
      background: #F1F5F9;
      padding: 3px;
      border-radius: 10px;
      gap: 3px;
      margin-bottom: 12px;
    }
    .tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      padding: 6px 0;
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }
    .tab-btn.active {
      background: #FFFFFF;
      color: #0F172A;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    /* Tab Contents */
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }

    /* Cards */
    .section-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
      display: flex;
      align-items: center;
      gap: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge {
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
      background: #FFE600;
      padding: 2px 7px;
      border-radius: 6px;
    }

    /* Video UI */
    .video-title {
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      padding: 6px 8px;
      border-radius: 6px;
    }
    .quality-select {
      width: 100%;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #0F172A;
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      margin-bottom: 8px;
      outline: none;
      cursor: pointer;
    }
    .action-btn {
      width: 100%;
      background: #0F172A;
      color: #FFFFFF;
      border: none;
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .action-btn:hover {
      background: #1E293B;
    }
    .action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .status-msg {
      font-size: 10px;
      font-weight: 600;
      margin-top: 6px;
      text-align: center;
      min-height: 14px;
      color: #64748B;
      word-break: break-word;
    }
    .status-msg.success { color: #059669; }
    .status-msg.error { color: #DC2626; }

    /* Detected / Sniffed Lists */
    .detected-list {
      max-height: 160px;
      overflow-y: auto;
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .detected-item {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .detected-item-info {
      flex: 1;
      min-width: 0;
    }
    .detected-item-title {
      font-size: 10px;
      font-weight: 700;
      color: #0F172A;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .detected-item-res {
      font-size: 9px;
      color: #64748B;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .small-dl-btn {
      background: #FFE600;
      color: #0F172A;
      border: none;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .small-dl-btn:hover {
      background: #FACC15;
    }
    .small-dl-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Images UI */
    .fmt-pill-group {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .fmt-pill {
      flex: 1;
      padding: 5px 0;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      cursor: pointer;
      text-align: center;
    }
    .fmt-pill.active {
      background: #FFE600;
      border-color: #E2B900;
      color: #0F172A;
    }
    .images-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      max-height: 190px;
      overflow-y: auto;
      margin-top: 8px;
      padding: 2px;
    }
    .img-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .img-thumb {
      width: 100%;
      height: 60px;
      object-fit: cover;
      background: #F1F5F9;
    }
    .img-dl-btn {
      width: 100%;
      padding: 4px 0;
      background: #0F172A;
      color: #FFFFFF;
      border: none;
      font-size: 9px;
      font-weight: 800;
      cursor: pointer;
      text-align: center;
    }
    .img-dl-btn:hover {
      background: #1E293B;
    }

    /* Speed Grid */
    .speed-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
      margin-bottom: 8px;
    }
    .speed-btn {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 7px 0;
      font-size: 11px;
      font-weight: 700;
      color: #0F172A;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }
    .speed-btn:hover {
      background: #F1F5F9;
      border-color: #94A3B8;
    }
    .speed-btn.active {
      background: #FFE600;
      border-color: #E2B900;
      color: #0F172A;
      box-shadow: 0 1px 4px rgba(255, 230, 0, 0.35);
    }
    .slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .speed-slider {
      flex: 1;
      accent-color: #FFE600;
      cursor: pointer;
    }
    .slider-label {
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
      min-width: 40px;
      text-align: right;
    }
    .status-hint {
      font-size: 10px;
      font-weight: 600;
      color: #64748B;
      margin-top: 6px;
      text-align: center;
    }

    /* Settings Toggle Row */
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #E2E8F0;
    }
    .setting-label {
      font-size: 11px;
      font-weight: 700;
      color: #0F172A;
    }
    .setting-desc {
      font-size: 9px;
      color: #64748B;
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider-switch {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #CBD5E1;
      transition: .2s;
      border-radius: 20px;
    }
    .slider-switch:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .slider-switch {
      background-color: #10B981;
    }
    input:checked + .slider-switch:before {
      transform: translateX(16px);
    }

    .copy-cmd-btn {
      width: 100%;
      background: #F1F5F9;
      color: #475569;
      border: 1px dashed #CBD5E1;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .copy-cmd-btn:hover { background: #E2E8F0; color: #0F172A; }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: #64748B;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="logo-box" aria-hidden="true">
        <!-- Pixelated Download Icon -->
        <svg width="18" height="18" viewBox="0 0 12 12" style="image-rendering: pixelated;">
          <rect x="4" y="0" width="4" height="4" fill="#0F172A" />
          <rect x="1" y="4" width="10" height="1" fill="#0F172A" />
          <rect x="2" y="5" width="8" height="1" fill="#0F172A" />
          <rect x="3" y="6" width="6" height="1" fill="#0F172A" />
          <rect x="4" y="7" width="4" height="1" fill="#0F172A" />
          <rect x="0" y="9" width="2" height="2" fill="#0F172A" />
          <rect x="10" y="9" width="2" height="2" fill="#0F172A" />
          <rect x="0" y="10" width="12" height="2" fill="#0F172A" />
        </svg>
      </div>
      <div class="brand-name">op.downloads</div>
    </div>
    <span class="version-tag">v3.2.0</span>
  </div>

  <!-- Navigation Tabs -->
  <div class="tabs-nav" role="tablist" aria-label="Main navigation">
    <button id="tabBtnVideos" class="tab-btn active" role="tab" aria-selected="true" aria-controls="tabVideos" tabindex="0" data-tab="tabVideos">🎬 Videos</button>
    <button id="tabBtnImages" class="tab-btn" role="tab" aria-selected="false" aria-controls="tabImages" tabindex="-1" data-tab="tabImages">🖼 Images</button>
    <button id="tabBtnSpeed" class="tab-btn" role="tab" aria-selected="false" aria-controls="tabSpeed" tabindex="-1" data-tab="tabSpeed">⚡ Speed</button>
    <button id="tabBtnSettings" class="tab-btn" role="tab" aria-selected="false" aria-controls="tabSettings" tabindex="-1" data-tab="tabSettings">⚙ Settings</button>
  </div>

  <!-- TAB 1: VIDEOS -->
  <div id="tabVideos" class="tab-content active" role="tabpanel" aria-labelledby="tabBtnVideos">
    <!-- Active Video / YouTube Downloader -->
    <div class="section-card" id="mainVideoCard">
      <div class="section-header">
        <span class="section-title">🎬 Video Downloader (MP4)</span>
      </div>

      <div id="ytDownloaderSection">
        <div id="videoTitleDisplay" class="video-title">
          Detecting video...
        </div>

        <select id="qualitySelect" class="quality-select" aria-label="Select video quality">
          <option value="1080">1080p Full HD (MP4)</option>
          <option value="720" selected>720p HD (MP4 - Recommended)</option>
          <option value="480">480p (MP4)</option>
          <option value="360">360p (MP4 - Fast)</option>
          <option value="mp3">Audio Only (MP3)</option>
        </select>

        <button id="downloadBtn" class="action-btn" aria-label="Download video directly">
          <span>⬇ Download Directly to PC</span>
        </button>

        <div id="downloadStatus" class="status-msg" role="status" aria-live="polite"></div>

        <button id="copyCmdBtn" class="copy-cmd-btn" aria-label="Copy lossless 4K terminal command">
          <span>📋 Copy Lossless 4K PC Command</span>
        </button>
      </div>
    </div>

    <!-- Sniffed Media Streams (HLS / m3u8 & MP4) -->
    <div class="section-card" id="sniffedStreamsSection" style="display: none;">
      <div class="section-header">
        <span class="section-title">📡 Sniffed Streams (<span id="sniffedCount">0</span>)</span>
        <span class="badge" style="background: #10B981; color: #FFFFFF;">HLS / MP4</span>
      </div>
      <div style="font-size: 10px; color: #64748B; margin-bottom: 6px;">
        1-Click direct streams detected from network:
      </div>
      <div id="sniffedStreamsList" class="detected-list"></div>
    </div>

    <!-- Detected In-Page Web Videos -->
    <div class="section-card" id="webVideosSection" style="display: none;">
      <div class="section-header">
        <span class="section-title">🎬 Page Videos (<span id="webVideoCount">0</span>)</span>
      </div>
      <div id="detectedVideosList" class="detected-list"></div>
    </div>
  </div>

  <!-- TAB 2: IMAGES -->
  <div id="tabImages" class="tab-content" role="tabpanel" aria-labelledby="tabBtnImages">
    <div class="section-card">
      <div class="section-header">
        <span class="section-title">🖼 Download Any Image</span>
        <span id="imageCountBadge" class="badge">0</span>
      </div>

      <div class="fmt-pill-group">
        <button id="fmtPng" class="fmt-pill active" aria-label="Convert to PNG format">PNG Format</button>
        <button id="fmtJpg" class="fmt-pill" aria-label="Convert to JPG format">JPG Format</button>
      </div>

      <button id="downloadAllImagesBtn" class="action-btn" style="margin-bottom: 6px;" aria-label="Download all detected images">
        <span>⬇ Download All Images</span>
      </button>

      <div id="imagesStatus" class="status-msg" role="status" aria-live="polite"></div>

      <div id="imagesGrid" class="images-grid"></div>
    </div>
  </div>

  <!-- TAB 3: SPEED (1x - 10x) -->
  <div id="tabSpeed" class="tab-content" role="tabpanel" aria-labelledby="tabBtnSpeed">
    <div class="section-card">
      <div class="section-header">
        <span class="section-title">⚡ Playback Speed (1x - 10x)</span>
        <span id="speedBadge" class="badge">1.0x</span>
      </div>

      <div class="speed-grid">
        <button class="speed-btn" data-spd="1.0" aria-label="Set speed to 1x">1x</button>
        <button class="speed-btn" data-spd="1.5" aria-label="Set speed to 1.5x">1.5x</button>
        <button class="speed-btn" data-spd="2.0" aria-label="Set speed to 2x">2x</button>
        <button class="speed-btn" data-spd="3.0" aria-label="Set speed to 3x">3x</button>
        <button class="speed-btn" data-spd="5.0" aria-label="Set speed to 5x">5x</button>
        <button class="speed-btn" data-spd="10.0" aria-label="Set speed to 10x">10x</button>
      </div>

      <div class="slider-row">
        <input type="range" id="speedSlider" class="speed-slider" min="0.25" max="10.0" step="0.25" value="1.0" aria-label="Speed adjustment slider">
        <span id="sliderVal" class="slider-label">1.0x</span>
      </div>

      <div id="speedVideoCount" class="status-hint">
        ⚡ Controls any video across all websites in Chrome
      </div>
    </div>
  </div>

  <!-- TAB 4: SETTINGS -->
  <div id="tabSettings" class="tab-content" role="tabpanel" aria-labelledby="tabBtnSettings">
    <div class="section-card">
      <div class="section-header">
        <span class="section-title">⚙ Preferences</span>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Hover Download Button</div>
          <div class="setting-desc">Top-right corner badge on any video/image</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="hoverToggle" checked aria-label="Enable hover download buttons">
          <span class="slider-switch"></span>
        </label>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-label">HLS/m3u8 Stream Sniffer</div>
          <div class="setting-desc">Stitches multi-segment streaming videos directly</div>
        </div>
        <span style="font-size: 10px; font-weight: 700; color: #10B981;">Active</span>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-label">Restricted Media Detection</div>
          <div class="setting-desc">Detects overlays, canvas, and protected MSE players</div>
        </div>
        <span style="font-size: 10px; font-weight: 700; color: #10B981;">Active</span>
      </div>
    </div>

    <div class="footer">
      <span>op.downloads - Universal PC Downloader</span>
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
`;

export const POPUP_JS = `/**
 * op.downloads - Extension Popup Controller (Manifest V3 - v3.2.0)
 * 
 * - 1-Click Universal Video Downloader (YouTube High-Speed API, Sniffed HLS/m3u8, Direct MP4)
 * - 1-Click Universal Image Downloader (PNG / JPG with OffscreenCanvas)
 * - Universal 1x to 10x Video Speed Controller
 * - Keyboard Accessible (WCAG 2.1 Tab navigation) & Safe DOM Rendering
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // Navigation Tabs
  const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
  const tabContents = Array.from(document.querySelectorAll('.tab-content'));

  // Video UI
  const videoTitleDisplay = document.getElementById('videoTitleDisplay');
  const qualitySelect = document.getElementById('qualitySelect');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadStatus = document.getElementById('downloadStatus');
  const copyCmdBtn = document.getElementById('copyCmdBtn');

  // Sniffed Streams UI
  const sniffedStreamsSection = document.getElementById('sniffedStreamsSection');
  const sniffedCount = document.getElementById('sniffedCount');
  const sniffedStreamsList = document.getElementById('sniffedStreamsList');

  // Page Videos UI
  const webVideosSection = document.getElementById('webVideosSection');
  const webVideoCount = document.getElementById('webVideoCount');
  const detectedVideosList = document.getElementById('detectedVideosList');

  // Images UI
  const imageCountBadge = document.getElementById('imageCountBadge');
  const fmtPng = document.getElementById('fmtPng');
  const fmtJpg = document.getElementById('fmtJpg');
  const downloadAllImagesBtn = document.getElementById('downloadAllImagesBtn');
  const imagesStatus = document.getElementById('imagesStatus');
  const imagesGrid = document.getElementById('imagesGrid');

  // Speed UI
  const speedBadge = document.getElementById('speedBadge');
  const speedBtns = Array.from(document.querySelectorAll('.speed-btn'));
  const speedSlider = document.getElementById('speedSlider');
  const sliderVal = document.getElementById('sliderVal');
  const speedVideoCount = document.getElementById('speedVideoCount');

  // Settings UI
  const hoverToggle = document.getElementById('hoverToggle');

  // State
  let activeTabId = null;
  let activeTabUrl = '';
  let activeVideoId = '';
  let activeTitle = 'Web Page';
  let isYouTubePage = false;
  let selectedImgFmt = 'png';
  let detectedImages = [];
  let detectedVideos = [];
  let sniffedStreams = [];

  function sanitizeDisplayText(text, maxLen = 60) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.trim();
    return clean.length > maxLen ? clean.substring(0, maxLen - 3) + '...' : clean;
  }

  // 1. Accessible Tab Navigation (Keyboard + Click)
  function activateTab(index) {
    if (index < 0 || index >= tabBtns.length) return;
    const btn = tabBtns[index];
    const targetId = btn.dataset.tab;

    tabBtns.forEach((b, i) => {
      const isActive = i === index;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    tabContents.forEach((c) => {
      const isTarget = c.id === targetId;
      c.classList.toggle('active', isTarget);
    });

    btn.focus();
  }

  tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      activateTab(index);
    });

    btn.addEventListener('keydown', (e) => {
      let nextIndex = index;
      if (e.key === 'ArrowRight') {
        nextIndex = (index + 1) % tabBtns.length;
        e.preventDefault();
        activateTab(nextIndex);
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (index - 1 + tabBtns.length) % tabBtns.length;
        e.preventDefault();
        activateTab(nextIndex);
      } else if (e.key === 'Home') {
        e.preventDefault();
        activateTab(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        activateTab(tabBtns.length - 1);
      }
    });
  });

  // 2. Load Storage Preferences
  let storageData = {};
  try {
    storageData = await chrome.storage.local.get({
      preferredSpeed: 1.0,
      hoverEnabled: true,
      downloadState: null
    });
  } catch (e) {}

  let currentSpeed = storageData.preferredSpeed || 1.0;
  let hoverEnabled = storageData.hoverEnabled !== false;
  if (hoverToggle) hoverToggle.checked = hoverEnabled;

  updateSpeedUI(currentSpeed);

  if (storageData.downloadState) {
    applyDownloadState(storageData.downloadState);
  }

  // Listen to download progress changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.downloadState) {
      applyDownloadState(changes.downloadState.newValue);
    }
  });

  // 3. Query Active Tab for Media & Video details
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].id) {
      setVideoStatus('No active browser tab found.', 'error');
      return;
    }

    activeTabId = tabs[0].id;
    activeTabUrl = tabs[0].url || '';
    activeTitle = (tabs[0].title || 'Page').replace('- YouTube', '').trim();

    // Check for internal / restricted browser pages
    const isRestrictedUrl = (
      activeTabUrl.startsWith('chrome://') ||
      activeTabUrl.startsWith('chrome-extension://') ||
      activeTabUrl.startsWith('edge://') ||
      activeTabUrl.startsWith('about:') ||
      activeTabUrl.includes('chromewebstore.google.com') ||
      activeTabUrl.includes('chrome.google.com/webstore')
    );

    if (isRestrictedUrl) {
      videoTitleDisplay.textContent = 'Chrome System / Store Page';
      setVideoStatus('Extension active. Media scanning is disabled on Chrome internal pages.', '');
      if (downloadBtn) downloadBtn.disabled = true;
      if (speedVideoCount) speedVideoCount.textContent = '⚡ Speed controls available on ordinary web pages.';
      return;
    }

    try {
      const urlObj = new URL(activeTabUrl);
      isYouTubePage = urlObj.hostname.includes('youtube.com');
      if (isYouTubePage) {
        activeVideoId = urlObj.searchParams.get('v') || '';
      }
    } catch (e) {}

    if (isYouTubePage && activeVideoId) {
      videoTitleDisplay.textContent = sanitizeDisplayText(activeTitle, 65);
      qualitySelect.style.display = 'block';
      copyCmdBtn.style.display = 'flex';
      downloadBtn.style.display = 'flex';
      downloadBtn.textContent = '⬇ Download Directly to PC';
    } else {
      videoTitleDisplay.textContent = sanitizeDisplayText(activeTitle, 65);
      qualitySelect.style.display = 'none';
      copyCmdBtn.style.display = 'none';
      downloadBtn.style.display = 'flex';
      downloadBtn.textContent = '⬇ Download Video (MP4)';
    }

    // A. Query Sniffed Streams from Background Worker
    chrome.runtime.sendMessage({ type: 'GET_TAB_STREAMS', tabId: activeTabId }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.streams && resp.streams.length > 0) {
        sniffedStreams = resp.streams;
        sniffedStreamsSection.style.display = 'block';
        sniffedCount.textContent = sniffedStreams.length.toString();
        renderSniffedStreams(sniffedStreams);
      }
    });

    // B. Request in-page media data from content script
    chrome.tabs.sendMessage(activeTabId, { type: 'GET_PAGE_MEDIA' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        if (speedVideoCount) speedVideoCount.textContent = '⚡ Works on all videos in Chrome (refresh tab to link)';
        return;
      }

      if (resp.currentSpeed) {
        currentSpeed = resp.currentSpeed;
        updateSpeedUI(currentSpeed);
      }

      const vCount = resp.videoCount || 0;
      if (vCount > 0) {
        speedVideoCount.textContent = \`⚡ \${vCount} video(s) active & synced at \${currentSpeed}x\`;
      } else {
        speedVideoCount.textContent = '⚡ Ready! Applies to any video on this page';
      }

      // Render Detected In-Page Web Videos
      if (resp.videos && resp.videos.length > 0) {
        detectedVideos = resp.videos;
        webVideosSection.style.display = 'block';
        webVideoCount.textContent = detectedVideos.length.toString();
        renderWebVideos(detectedVideos);
      } else if (!isYouTubePage && sniffedStreams.length === 0) {
        webVideosSection.style.display = 'block';
        webVideoCount.textContent = '0';
        detectedVideosList.textContent = '';
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'font-size: 10px; color: #94A3B8; text-align: center; padding: 10px;';
        emptyMsg.textContent = 'Play any video on this page to detect & download.';
        detectedVideosList.appendChild(emptyMsg);
      }

      // Render Detected Images
      if (resp.images && resp.images.length > 0) {
        detectedImages = resp.images;
        imageCountBadge.textContent = detectedImages.length.toString();
        renderImages(detectedImages);
      } else {
        imageCountBadge.textContent = '0';
        imagesGrid.textContent = '';
        const emptyImgMsg = document.createElement('div');
        emptyImgMsg.style.cssText = 'font-size: 10px; color: #94A3B8; text-align: center; grid-column: span 3; padding: 20px;';
        emptyImgMsg.textContent = 'No images found on this page.';
        imagesGrid.appendChild(emptyImgMsg);
      }
    });
  });

  // 4. Sniffed Streams Safe Renderer
  function renderSniffedStreams(streams) {
    sniffedStreamsList.textContent = '';
    streams.forEach((stream, idx) => {
      const item = document.createElement('div');
      item.className = 'detected-item';

      const info = document.createElement('div');
      info.className = 'detected-item-info';

      const title = document.createElement('div');
      title.className = 'detected-item-title';
      title.textContent = stream.formatLabel || \`Stream \${idx + 1}\`;

      const res = document.createElement('div');
      res.className = 'detected-item-res';
      const cleanUrl = stream.url.length > 40 ? stream.url.substring(0, 37) + '...' : stream.url;
      res.textContent = cleanUrl;

      info.appendChild(title);
      info.appendChild(res);

      const dlBtn = document.createElement('button');
      dlBtn.className = 'small-dl-btn';
      dlBtn.textContent = '⬇ MP4';

      dlBtn.addEventListener('click', () => {
        dlBtn.disabled = true;
        dlBtn.textContent = '⏳ Saving...';
        setVideoStatus('⏳ Starting stream download & binary merge...', '');

        if (stream.type === 'hls') {
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_HLS',
            url: stream.url,
            title: activeTitle || 'HLS_Video'
          }, (r) => {
            if (r && !r.ok) {
              dlBtn.disabled = false;
              dlBtn.textContent = '⬇ MP4';
            }
          });
        } else {
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_VIDEO',
            url: stream.url,
            title: activeTitle || 'Video',
            ext: '.mp4'
          }, () => {
            dlBtn.textContent = '✓ Saved!';
            setTimeout(() => {
              dlBtn.disabled = false;
              dlBtn.textContent = '⬇ MP4';
            }, 3000);
          });
        }
      });

      item.appendChild(info);
      item.appendChild(dlBtn);
      sniffedStreamsList.appendChild(item);
    });
  }

  // 5. Detected Web Videos Safe Renderer
  function renderWebVideos(videos) {
    detectedVideosList.textContent = '';
    videos.forEach((v, idx) => {
      const item = document.createElement('div');
      item.className = 'detected-item';

      const info = document.createElement('div');
      info.className = 'detected-item-info';

      const title = document.createElement('div');
      title.className = 'detected-item-title';
      title.textContent = v.title || \`Video \${idx + 1}\`;

      const res = document.createElement('div');
      res.className = 'detected-item-res';
      const durText = v.duration ? \`\${Math.floor(v.duration / 60)}:\${(v.duration % 60).toString().padStart(2, '0')}\` : '';
      res.textContent = \`\${v.isBlob ? 'Streaming Player' : 'Direct MP4'} • \${v.resolution || 'HD'} \${durText ? '• ' + durText : ''}\`;

      info.appendChild(title);
      info.appendChild(res);

      const dlBtn = document.createElement('button');
      dlBtn.className = 'small-dl-btn';
      dlBtn.textContent = '⬇ MP4';

      dlBtn.addEventListener('click', () => {
        dlBtn.textContent = '⏳ Saving...';
        dlBtn.disabled = true;

        if (v.isBlob && activeTabId) {
          chrome.tabs.sendMessage(activeTabId, {
            type: 'TRIGGER_PAGE_VIDEO_DOWNLOAD',
            videoIndex: v.videoIndex !== undefined ? v.videoIndex : idx,
            title: v.title
          }, () => {
            dlBtn.textContent = '✓ Saved!';
            setTimeout(() => {
              dlBtn.textContent = '⬇ MP4';
              dlBtn.disabled = false;
            }, 3000);
          });
        } else {
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_VIDEO',
            url: v.url,
            title: v.title,
            ext: '.mp4'
          }, () => {
            dlBtn.textContent = '✓ Saved!';
            setTimeout(() => {
              dlBtn.textContent = '⬇ MP4';
              dlBtn.disabled = false;
            }, 3000);
          });
        }
      });

      item.appendChild(info);
      item.appendChild(dlBtn);
      detectedVideosList.appendChild(item);
    });
  }

  // 6. Universal Video Downloader Handler
  downloadBtn.addEventListener('click', async () => {
    if (!activeTabUrl) {
      setVideoStatus('Please open a media webpage first.', 'error');
      return;
    }

    if (isYouTubePage) {
      const quality = qualitySelect.value;
      setVideoStatus('⏳ Connecting to high-speed download engine...', '');
      downloadBtn.disabled = true;

      chrome.runtime.sendMessage({
        type: 'START_DOWNLOAD',
        pageUrl: activeTabUrl,
        videoId: activeVideoId,
        title: activeTitle,
        quality: quality
      }, (resp) => {
        if (resp && !resp.ok) {
          setVideoStatus(resp.error || 'Download failed.', 'error');
          downloadBtn.disabled = false;
        }
      });
      return;
    }

    // Non-YouTube Universal Video Download
    downloadBtn.disabled = true;
    setVideoStatus('⏳ Locating video stream...', '');

    // Check sniffed streams first
    if (sniffedStreams && sniffedStreams.length > 0) {
      const stream = sniffedStreams[0];
      if (stream.type === 'hls') {
        setVideoStatus('⏳ Downloading & merging HLS video chunks...', '');
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_HLS',
          url: stream.url,
          title: activeTitle || 'Video'
        }, () => {
          downloadBtn.disabled = false;
        });
      } else {
        setVideoStatus('✓ Downloading video stream directly to PC...', 'success');
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_VIDEO',
          url: stream.url,
          title: activeTitle || 'Video',
          ext: '.mp4'
        }, () => {
          downloadBtn.disabled = false;
        });
      }
      return;
    }

    // Check detected videos on page
    if (detectedVideos && detectedVideos.length > 0) {
      const v = detectedVideos[0];
      if (v.isBlob && activeTabId) {
        chrome.tabs.sendMessage(activeTabId, {
          type: 'TRIGGER_PAGE_VIDEO_DOWNLOAD',
          videoIndex: 0,
          title: v.title || activeTitle
        }, () => {
          downloadBtn.disabled = false;
        });
      } else if (v.url) {
        setVideoStatus('✓ Downloading video directly to PC...', 'success');
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_VIDEO',
          url: v.url,
          title: v.title || activeTitle,
          ext: '.mp4'
        }, () => {
          downloadBtn.disabled = false;
        });
      }
      return;
    }

    // Fallback: ask content script to detect and download active video
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'TRIGGER_PAGE_VIDEO_DOWNLOAD',
        videoIndex: 0,
        title: activeTitle
      }, (r) => {
        downloadBtn.disabled = false;
        if (r && !r.ok) {
          setVideoStatus('▶ Please press play on the video or hover over it to download.', 'error');
        }
      });
    } else {
      downloadBtn.disabled = false;
      setVideoStatus('▶ Please press play on the video to start download.', 'error');
    }
  });

  function setVideoStatus(msg, type) {
    downloadStatus.textContent = msg;
    downloadStatus.className = 'status-msg ' + (type || '');
  }

  function applyDownloadState(st) {
    if (!st) return;
    if (st.status === 'connecting' || st.status === 'processing' || st.status === 'saving') {
      setVideoStatus(st.text || 'Downloading...', '');
      if (downloadBtn) downloadBtn.disabled = true;
    } else if (st.status === 'success') {
      setVideoStatus(st.text || '✓ Download complete! Saved to PC.', 'success');
      if (downloadBtn) downloadBtn.disabled = false;
    } else if (st.status === 'error') {
      setVideoStatus(st.text || 'Download failed.', 'error');
      if (downloadBtn) downloadBtn.disabled = false;
    }
  }

  copyCmdBtn.addEventListener('click', () => {
    const cmd = \`yt-dlp -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]" "\${activeTabUrl || 'https://www.youtube.com/watch?v=' + activeVideoId}"\`;
    navigator.clipboard.writeText(cmd).then(() => {
      copyCmdBtn.textContent = '✓ Copied to clipboard! (Paste in terminal)';
      setTimeout(() => {
        copyCmdBtn.textContent = '📋 Copy Lossless 4K PC Command';
      }, 2500);
      setVideoStatus('Command copied: run in terminal/cmd for max 4K quality', 'success');
    }).catch(() => {
      setVideoStatus('Could not copy command to clipboard.', 'error');
    });
  });

  // 7. Universal Image Downloader (PNG / JPG)
  fmtPng.addEventListener('click', () => {
    selectedImgFmt = 'png';
    fmtPng.classList.add('active');
    fmtJpg.classList.remove('active');
    updateImageCardsLabel();
  });

  fmtJpg.addEventListener('click', () => {
    selectedImgFmt = 'jpg';
    fmtJpg.classList.add('active');
    fmtPng.classList.remove('active');
    updateImageCardsLabel();
  });

  function updateImageCardsLabel() {
    document.querySelectorAll('.img-dl-btn').forEach((btn) => {
      btn.textContent = \`⬇ \${selectedImgFmt.toUpperCase()}\`;
    });
  }

  downloadAllImagesBtn.addEventListener('click', () => {
    if (!detectedImages || detectedImages.length === 0) {
      setImagesStatus('No images to download.', 'error');
      return;
    }

    setImagesStatus(\`⏳ Downloading all \${detectedImages.length} images as \${selectedImgFmt.toUpperCase()}...\`, '');
    downloadAllImagesBtn.disabled = true;

    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_ALL_IMAGES',
      images: detectedImages,
      format: selectedImgFmt,
      title: activeTitle
    }, () => {
      downloadAllImagesBtn.disabled = false;
      setImagesStatus(\`✓ Download started! Check browser downloads.\`, 'success');
    });
  });

  function renderImages(images) {
    imagesGrid.textContent = '';
    images.forEach((img, idx) => {
      const card = document.createElement('div');
      card.className = 'img-card';

      const thumb = document.createElement('img');
      thumb.className = 'img-thumb';
      thumb.src = img.url;
      thumb.alt = img.alt || \`Image \${idx + 1}\`;
      thumb.loading = 'lazy';
      thumb.onerror = () => {
        thumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24"><rect width="24" height="24" fill="%23f1f5f9"/><text x="12" y="14" font-size="6" text-anchor="middle" fill="%2394a3b8">IMG</text></svg>';
      };

      const dlBtn = document.createElement('button');
      dlBtn.className = 'img-dl-btn';
      dlBtn.textContent = \`⬇ \${selectedImgFmt.toUpperCase()}\`;

      dlBtn.addEventListener('click', () => {
        dlBtn.textContent = '⏳ Saving...';
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_IMAGE',
          url: img.url,
          format: selectedImgFmt,
          title: \`\${activeTitle}_img_\${idx + 1}\`
        }, () => {
          dlBtn.textContent = '✓ Saved!';
          setTimeout(() => {
            dlBtn.textContent = \`⬇ \${selectedImgFmt.toUpperCase()}\`;
          }, 2500);
        });
      });

      card.appendChild(thumb);
      card.appendChild(dlBtn);
      imagesGrid.appendChild(card);
    });
  }

  function setImagesStatus(msg, type) {
    imagesStatus.textContent = msg;
    imagesStatus.className = 'status-msg ' + (type || '');
  }

  // 8. Universal Speed Controls (1x to 10x)
  speedBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const spd = parseFloat(btn.dataset.spd);
      if (!isNaN(spd)) applySpeed(spd);
    });
  });

  speedSlider.addEventListener('input', () => {
    const spd = parseFloat(speedSlider.value);
    if (!isNaN(spd)) applySpeed(spd);
  });

  function applySpeed(spd) {
    currentSpeed = spd;
    updateSpeedUI(spd);
    chrome.storage.local.set({ preferredSpeed: spd });

    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'SET_PLAYBACK_SPEED',
        speed: spd
      }, (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp && resp.count !== undefined) {
          speedVideoCount.textContent = \`⚡ Applied \${spd}x to \${resp.count} video(s) on this page\`;
        }
      });
    }
  }

  function updateSpeedUI(spd) {
    const formatted = \`\${spd.toFixed(1)}x\`.replace('.0x', 'x');
    speedBadge.textContent = formatted;
    sliderVal.textContent = formatted;
    speedSlider.value = spd.toString();

    speedBtns.forEach((btn) => {
      if (parseFloat(btn.dataset.spd) === spd) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // 9. Hover Settings Toggle
  hoverToggle.addEventListener('change', () => {
    const enabled = hoverToggle.checked;
    chrome.storage.local.set({ hoverEnabled: enabled });
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'SET_HOVER_ENABLED',
        enabled: enabled
      }).catch(() => {});
    }
  });

});
`;

export const README_MD = `# op.downloads - Advanced Universal Video & Image Downloader (v3.2.0)

A high-performance, secure, and privacy-first Chrome Extension (Manifest V3) engineered to download accessible videos and images in **1-Click** across the web, parse and merge HLS multi-segment streams (.m3u8), extract media past transparent click overlays, and control playback speed up to 10x.

---

## 🚀 Key Features

### 1. 🎯 1-Click Top-Right Corner Hover Download Badge
- **Instant Media Access:** Whenever you hover your cursor over accessible videos or images on websites where downloading is permitted, a floating download badge automatically appears in the top-right corner.
- **Videos:** Displays \`[ ⬇ MP4 ]\` — initiates a direct download of the detected media stream to PC Downloads.
- **Images:** Displays \`[ ⬇ PNG ]\` and \`[ ⬇ JPG ]\` — converts and saves the image directly.
- **Z-Index Layering:** Placed at high elevation (\`z-index: 2147483647\`) to float cleanly above custom player overlays without interfering with controls.

### 2. 📡 HLS (.m3u8) Stream Sniffer & Binary Segment Merger
- **Multi-Channel Sniffing:** Background service worker monitors media network requests to identify \`.m3u8\` playlists and direct video streams.
- **Automated Segment Assembly:** Resolves master playlists to the highest-bandwidth video variant, fetches transport chunks in parallel batches (concurrency: 8), and merges them into a contiguous \`.mp4\` file.
- **Blob Stream Downloading:** Uses \`URL.createObjectURL\` with automatic resource revocation to avoid high memory spikes.

### 3. 🔓 Restricted Overlay Inspection
- **Transparent Overlay Penetration:** Uses deep DOM inspection (\`elementsFromPoint\`) to reach behind transparent shield \`<div>\` elements that prevent standard browser right-click saving.
- **Highest-Resolution srcset Parser:** Inspects \`srcset\` and picture elements to retrieve full-resolution originals rather than low-resolution thumbnail previews.
- **Canvas & Background Media Extraction:** Converts HTML5 \`<canvas>\` elements and CSS background images to PNG or JPG downloads.

### 4. ⚡ Universal Video Speed Controller (1x to 10x)
- Controls playback speed for HTML5 videos across the browser.
- Preset buttons: **1x**, **1.5x**, **2x**, **3x**, **5x**, and **10x**.
- Continuous range slider from **0.25x to 10.0x**.
- Mutation observer ensures new dynamically injected video players respect user speed preferences.

### 5. 🖼 Universal Image Converter (PNG & JPG)
- Converts images (including WebP, AVIF, and canvas) to **PNG** or **JPG** format using \`OffscreenCanvas\`.
- Preserves natural dimensions and aspect ratios.
- Provides an in-popup gallery with batch **Download All Images** capability.

---

## 🔒 Security, Privacy & Web Store Policies

### 1. Permissions Justifications (Least Privilege)
| Permission | Justification |
| :--- | :--- |
| \`storage\` | Stores user settings (playback speed, hover toggle) and caches active tab streams across service-worker restarts. |
| \`downloads\` | Saves detected media files and merged video streams directly to the local PC Downloads directory. |
| \`contextMenus\` | Adds quick right-click actions for saving images as PNG/JPG and videos as MP4. |
| \`activeTab\` | Grants temporary script execution and DOM access on the current active tab when the extension popup is opened. |
| \`webRequest\` | Sniffs media URLs (\`.m3u8\`, \`.mpd\`, \`.mp4\`) from network headers to identify downloadable stream resources. |
| \`*://*/*\` (host) | Required to inspect video manifests and media streams across permitted websites. |

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
1. Open Google Chrome and visit \`chrome://extensions/\`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the \`extension\` folder located inside this project directory:
   \`\`\`
   c:\\Users\\INDIA TECHNOLOGY\\Downloads\\op.downloads\\extension
   \`\`\`
5. The **op.downloads** extension is now active. Pin it to your Chrome toolbar for quick access.

### Reloading After Updates:
1. Navigate to \`chrome://extensions/\`.
2. Locate the **op.downloads** card and click the **↻ (Reload)** icon.
3. Refresh any open webpages (\`F5\`) to load updated content scripts.

---

## 🧪 Testing & Verification

### Running Automated Test Suite:
Run the comprehensive 20-point automated test suite:
\`\`\`bash
python scripts/test_extension.py -v
\`\`\`
Tests verify:
- Manifest V3 configuration and icon assets.
- Filename sanitization against Windows reserved devices (\`CON\`, \`PRN\`, \`AUX\`, \`NUL\`) and path traversal.
- URL protocol validation (\`http:\`, \`https:\`, \`blob:\`, \`data:\`).
- HLS playlist bandwidth parsing and segment resolution.
- XSS prevention and safe DOM node creation.
- Repository file parity between root, \`extension/\`, and \`src/extensionData.ts\`.

### Running Asset Synchronization:
To mirror any edits between root files and the \`extension/\` directory:
\`\`\`bash
python scripts/sync_extension_data.py
\`\`\`

### Running Asset Syntax Validator:
\`\`\`bash
python scripts/validate_extension.py
\`\`\`

---

## 📋 Chrome Manual Testing Checklist

1. **Hover Download Button:**
   - Open a webpage with ordinary images (e.g., Unsplash, Wikipedia).
   - Hover cursor over any image -> Verify top-right \`[ PNG ]\` and \`[ JPG ]\` buttons appear.
   - Click \`[ PNG ]\` -> Verify image downloads as a valid \`.png\` file.
2. **Video Playback & Speed:**
   - Open any HTML5 video player.
   - Open the popup, navigate to the **⚡ Speed** tab, and select **2x** or move the slider.
   - Verify video playback rate changes immediately.
3. **HLS Stream Sniffing:**
   - Open a website streaming \`.m3u8\` video.
   - Open popup -> Verify sniffed streams section displays the detected stream.
   - Click \`⬇ MP4\` -> Verify progress notifications and file saving to Downloads.
4. **Keyboard Accessibility:**
   - Open popup and press \`Tab\` to reach navigation tabs.
   - Use \`ArrowRight\` and \`ArrowLeft\` to switch tabs.
   - Verify focus outlines are clearly visible.
5. **System Page Safety:**
   - Open popup on \`chrome://extensions\` or Chrome Web Store.
   - Verify popup displays a friendly informational status without errors or crashes.
`;

export const EXTENSION_FILES: ExtensionFile[] = [
  {
    name: 'manifest.json',
    path: 'manifest.json',
    language: 'json',
    description: 'Manifest V3 configuration with storage, downloads, contextMenus, and activeTab permissions.',
    content: MANIFEST_JSON
  },
  {
    name: 'injected.js',
    path: 'injected.js',
    language: 'javascript',
    description: 'MAIN world speed controller and YouTube video stream hook.',
    content: INJECTED_JS
  },
  {
    name: 'content.js',
    path: 'content.js',
    language: 'javascript',
    description: 'Hover download button, restricted media unlocker, and 1x-10x video speed engine.',
    content: CONTENT_JS
  },
  {
    name: 'background.js',
    path: 'background.js',
    language: 'javascript',
    description: 'High-speed background service worker managing JPG/PNG conversions and video downloads.',
    content: BACKGROUND_JS
  },
  {
    name: 'popup.html',
    path: 'popup.html',
    language: 'html',
    description: 'op.downloads popup interface for video, image, and speed controls.',
    content: POPUP_HTML
  },
  {
    name: 'popup.js',
    path: 'popup.js',
    language: 'javascript',
    description: 'Popup controller handling downloads, image galleries, and speed presets.',
    content: POPUP_JS
  },
  {
    name: 'README.md',
    path: 'README.md',
    language: 'markdown',
    description: 'Full documentation and installation guide for op.downloads.',
    content: README_MD
  }
];
