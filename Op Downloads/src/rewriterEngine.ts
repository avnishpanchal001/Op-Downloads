export interface RewriteResult {
  rawUrl: string;
  isParsable: boolean;
  hostname: string;
  pathname: string;
  videoParam: string | null;
  hasTrailingDot: boolean;
  isLongFormWatch: boolean;
  decision:
    | 'TRANSFORMED'
    | 'ONE_SHOT_HALTED'
    | 'LOOP_GUARD_SKIPPED'
    | 'EXCLUDED_SHORTS'
    | 'EXCLUDED_CHANNEL'
    | 'EXCLUDED_EMBED'
    | 'EXCLUDED_SEARCH'
    | 'EXCLUDED_FEED'
    | 'EXCLUDED_NON_YOUTUBE'
    | 'INVALID_URL';
  reason: string;
  targetUrl: string;
  isNewVideo: boolean;
}

export function evaluateYouTubeUrl(rawInput: string, lastProcessedVideoId?: string | null): RewriteResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      rawUrl: '',
      isParsable: false,
      hostname: '',
      pathname: '',
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'INVALID_URL',
      reason: 'URL is empty.',
      targetUrl: '',
      isNewVideo: false
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
  } catch (err) {
    return {
      rawUrl: trimmed,
      isParsable: false,
      hostname: '',
      pathname: '',
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'INVALID_URL',
      reason: 'Failed to parse URL structure.',
      targetUrl: trimmed,
      isNewVideo: false
    };
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname;
  const hasTrailingDot = hostname.endsWith('.');

  // 1. Hostname already has dot:
  if (hasTrailingDot) {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: url.searchParams.get('v'),
      hasTrailingDot: true,
      isLongFormWatch: pathname === '/watch',
      decision: 'LOOP_GUARD_SKIPPED',
      reason: 'Loop Guard: Hostname already has the trailing dot (".") appended. No action taken.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 2. YouTube domain check
  const isYouTubeDomain = hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  if (!isYouTubeDomain) {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'EXCLUDED_NON_YOUTUBE',
      reason: 'Not a YouTube host. Ignored by host_permissions filter.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 3. Exclusions: Shorts
  if (pathname.startsWith('/shorts')) {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'EXCLUDED_SHORTS',
      reason: 'Excluded: Short-form video format (/shorts/). Only targets long-form /watch videos.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 4. Exclusions: Channel pages
  if (pathname.startsWith('/@') || pathname.startsWith('/channel') || pathname.startsWith('/c/')) {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'EXCLUDED_CHANNEL',
      reason: 'Excluded: Creator channel profile page. Left untouched.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 5. Exclusions: Embed frames
  if (pathname.startsWith('/embed')) {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'EXCLUDED_EMBED',
      reason: 'Excluded: Embedded iframe player format (/embed/). Left untouched.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 6. Exclusions: Search queries
  if (pathname === '/results') {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'EXCLUDED_SEARCH',
      reason: 'Excluded: Search result query listing (/results). Left untouched.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 7. Exclusions: Feed & Home
  if (pathname === '/' || pathname.startsWith('/feed')) {
    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam: null,
      hasTrailingDot: false,
      isLongFormWatch: false,
      decision: 'EXCLUDED_FEED',
      reason: 'Excluded: YouTube Home or Feed browsing route. Left untouched.',
      targetUrl: url.toString(),
      isNewVideo: false
    };
  }

  // 8. Long-form video match: /watch?v=...
  const videoParam = url.searchParams.get('v');
  if (pathname === '/watch' && videoParam) {
    // ONE-SHOT PER-VIDEO CHECK:
    if (lastProcessedVideoId && lastProcessedVideoId === videoParam) {
      return {
        rawUrl: trimmed,
        isParsable: true,
        hostname,
        pathname,
        videoParam,
        hasTrailingDot: false,
        isLongFormWatch: true,
        decision: 'ONE_SHOT_HALTED',
        reason: `One-Shot Guard: Video ID "${videoParam}" was already transformed once for this navigation. Halting further redirects to permanently prevent ERR_TOO_MANY_REDIRECTS!`,
        targetUrl: url.toString(),
        isNewVideo: false
      };
    }

    const target = new URL(url.toString());
    target.hostname = hostname + '.';

    return {
      rawUrl: trimmed,
      isParsable: true,
      hostname,
      pathname,
      videoParam,
      hasTrailingDot: false,
      isLongFormWatch: true,
      decision: 'TRANSFORMED',
      reason: `New video confirmed ("${videoParam}"): Appended dot once to hostname -> "${hostname}.". Recorded video ID token to stop any 301 redirect loop.`,
      targetUrl: target.toString(),
      isNewVideo: true
    };
  }

  return {
    rawUrl: trimmed,
    isParsable: true,
    hostname,
    pathname,
    videoParam: null,
    hasTrailingDot: false,
    isLongFormWatch: false,
    decision: 'EXCLUDED_FEED',
    reason: 'Generic YouTube page without long-form /watch?v= parameter.',
    targetUrl: url.toString(),
    isNewVideo: false
  };
}
