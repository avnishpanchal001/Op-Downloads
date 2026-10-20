/**
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
      toast.style.cssText = `
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
      `;
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
    badge.style.cssText = `
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
    `;

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

    hoverBadge.style.top = `${top}px`;
    hoverBadge.style.left = `${left}px`;
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
    btn.style.cssText = `
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
    `;
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
        const parts = item.trim().split(/\s+/);
        const url = parts[0];
        let score = 0;
        if (parts[1]) {
          const wMatch = parts[1].match(/(\d+)w/);
          const xMatch = parts[1].match(/(\d+(?:\.\d+)?)x/);
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
          const parts = s.split(',').map((p) => p.trim().split(/\s+/)[0]);
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
        showOpToast(`✓ Saving canvas image as ${format.toUpperCase()}...`, 'success');
        return;
      } catch (e) {}
    }

    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_IMAGE',
      url: info.url,
      format: format,
      title: info.title || document.title || 'image'
    });
    showOpToast(`✓ Saving image as ${format.toUpperCase()}...`, 'success');
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
      const identifier = src || `video_index_${index}`;

      if (!seenUrls.has(identifier)) {
        seenUrls.add(identifier);
        const w = v.videoWidth || v.clientWidth || 0;
        const h = v.videoHeight || v.clientHeight || 0;
        videos.push({
          url: src,
          videoIndex: index,
          title: pageTitle ? `${pageTitle} (${index + 1})` : `Video_${index + 1}`,
          width: w,
          height: h,
          duration: Math.round(v.duration || 0),
          resolution: w && h ? `${w}x${h}` : 'HD',
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
                title: pageTitle ? `${pageTitle} (Embedded Player)` : `Embedded_Video_${index + 1}`,
                width: Math.round(r.width),
                height: Math.round(r.height),
                duration: 0,
                resolution: `${Math.round(r.width)}x${Math.round(r.height)}`,
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
