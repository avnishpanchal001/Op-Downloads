/**
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
        speedVideoCount.textContent = `⚡ ${vCount} video(s) active & synced at ${currentSpeed}x`;
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
      title.textContent = stream.formatLabel || `Stream ${idx + 1}`;

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
      title.textContent = v.title || `Video ${idx + 1}`;

      const res = document.createElement('div');
      res.className = 'detected-item-res';
      const durText = v.duration ? `${Math.floor(v.duration / 60)}:${(v.duration % 60).toString().padStart(2, '0')}` : '';
      res.textContent = `${v.isBlob ? 'Streaming Player' : 'Direct MP4'} • ${v.resolution || 'HD'} ${durText ? '• ' + durText : ''}`;

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
    const cmd = `yt-dlp -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]" "${activeTabUrl || 'https://www.youtube.com/watch?v=' + activeVideoId}"`;
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
      btn.textContent = `⬇ ${selectedImgFmt.toUpperCase()}`;
    });
  }

  downloadAllImagesBtn.addEventListener('click', () => {
    if (!detectedImages || detectedImages.length === 0) {
      setImagesStatus('No images to download.', 'error');
      return;
    }

    setImagesStatus(`⏳ Downloading all ${detectedImages.length} images as ${selectedImgFmt.toUpperCase()}...`, '');
    downloadAllImagesBtn.disabled = true;

    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_ALL_IMAGES',
      images: detectedImages,
      format: selectedImgFmt,
      title: activeTitle
    }, () => {
      downloadAllImagesBtn.disabled = false;
      setImagesStatus(`✓ Download started! Check browser downloads.`, 'success');
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
      thumb.alt = img.alt || `Image ${idx + 1}`;
      thumb.loading = 'lazy';
      thumb.onerror = () => {
        thumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24"><rect width="24" height="24" fill="%23f1f5f9"/><text x="12" y="14" font-size="6" text-anchor="middle" fill="%2394a3b8">IMG</text></svg>';
      };

      const dlBtn = document.createElement('button');
      dlBtn.className = 'img-dl-btn';
      dlBtn.textContent = `⬇ ${selectedImgFmt.toUpperCase()}`;

      dlBtn.addEventListener('click', () => {
        dlBtn.textContent = '⏳ Saving...';
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_IMAGE',
          url: img.url,
          format: selectedImgFmt,
          title: `${activeTitle}_img_${idx + 1}`
        }, () => {
          dlBtn.textContent = '✓ Saved!';
          setTimeout(() => {
            dlBtn.textContent = `⬇ ${selectedImgFmt.toUpperCase()}`;
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
          speedVideoCount.textContent = `⚡ Applied ${spd}x to ${resp.count} video(s) on this page`;
        }
      });
    }
  }

  function updateSpeedUI(spd) {
    const formatted = `${spd.toFixed(1)}x`.replace('.0x', 'x');
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
