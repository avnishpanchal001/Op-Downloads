/**
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
