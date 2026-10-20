/**
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

  const illegalCharsRegex = new RegExp('[<>:"/\\\\|?*\\x00-\\x1F\\x7F-\\x9F]', 'g');
  const trimDotsRegex = new RegExp('^[.\\s]+|[.\\s]+$', 'g');
  const reservedRegex = new RegExp('^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?$', 'i');

  let clean = name
    .replace(illegalCharsRegex, '_')
    .replace(/\s+/g, ' ')
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
  return `Download stopped (${reason}).`;
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
  return `data:${mime};base64,${uint8ArrayToBase64(uint8)}`;
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
            text: `✓ Saved ${active.filename} directly to PC Downloads!`,
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
  const filename = `${cleanTitle}_${Date.now()}.mp4`;

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

    if (!m3u8Res.ok) throw new Error(`Stream fetch failed: HTTP ${m3u8Res.status}`);
    const m3u8Text = await m3u8Res.text();

    let targetPlaylistUrl = m3u8Url;
    let playlistContent = m3u8Text;

    // 2. Resolve Master Playlist to Best Quality Variant (Highest bandwidth)
    if (m3u8Text.includes('#EXT-X-STREAM-INF')) {
      const lines = m3u8Text.split('\n');
      let bestBandwidth = -1;
      let bestVariantUri = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          let bw = 0;
          const matchBw = line.match(/BANDWIDTH=(\d+)/);
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
    const mediaLines = playlistContent.split('\n');
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
        text: `⏳ Downloading 0/${segmentUrls.length} stream chunks...`,
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
            text: `⏳ Downloading chunks: ${completedCount}/${segmentUrls.length} (${pct}%)...`,
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
              downloadState: { status: 'error', text: `Download error: ${err}`, pct: 0 }
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
      downloadState: { status: 'error', text: `Download error: ${err.message || 'Stream processing failed'}`, pct: 0 }
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
  const filename = `${cleanTitle}_${Date.now()}${targetExt}`;

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

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const filename = `${cleanTitle}_${Date.now()}${targetExt}`;

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
  const filename = `${cleanTitle}_${quality || '720'}p${ext}`;

  // If a verified direct stream was already intercepted by in-page hooks, use it immediately
  if (directStreamUrl && isValidMediaUrl(directStreamUrl)) {
    downloadVideoDirect(directStreamUrl, cleanTitle, ext);
    if (sendResponse) sendResponse({ ok: true, filename: filename });
    return;
  }

  const videoUrl = pageUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
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

    const apiUrl = `https://p.savenow.to/ajax/download.php?url=${encodeURIComponent(videoUrl)}&format=${encodeURIComponent(quality || '720')}`;
    const controller = new AbortController();
    const initTimeout = setTimeout(() => controller.abort(), 12000);
    const initRes = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(initTimeout);

    if (!initRes.ok) throw new Error(`Download service returned HTTP ${initRes.status}`);

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
                text: `⏳ Processing ${quality || '720'}p video (${pct}%)...`,
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
              downloadState: { status: 'error', text: `Download error: ${errMsg}`, pct: 0 }
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
      downloadState: { status: 'error', text: `Download error: ${err.message || 'Network error'}`, pct: 0 }
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
        convertAndDownloadImage(img.url, fmt, `${baseTitle}_${idx + 1}`);
      }, idx * 250);
    });

    sendResponse({ ok: true, count: validImages.length });
    return false;
  }

  return false;
});
