import { API_BASE_URL } from '../services/stalker';

/**
 * Utility to resolve Stalker portal image paths correctly based on priority and type.
 */
export const resolveImageUrl = (item, activeProvider) => {
  if (!item) return null;

  // 1. Priority Order for Metadata Fields
  const path = item.screenshot_uri || item.cover_big || item.poster || item.pic || item.logo || '';
  if (!path) return null;

  // 2. HTTP/HTTPS URLs - Return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // 3. Resolve Portal Origin
  let portalOrigin = 'http://tatatv.cc'; // Baseline fallback
  if (activeProvider?.PORTAL_URL) {
    try {
      portalOrigin = new URL(activeProvider.PORTAL_URL).origin;
    } catch (e) {
      console.warn('[ImageResolver] Invalid Portal URL, using fallback', activeProvider.PORTAL_URL);
    }
  }

  // 4. Resolve Proxy URL
  let resolvedUrl = '';
  if (path.startsWith('/')) {
    resolvedUrl = `${portalOrigin}${path}`;
  } else {
    const isChannel = item.type === 'channel' || item.streamType === 'live' || !!item.number;
    if (isChannel) {
      resolvedUrl = `${portalOrigin}/stalker_portal/misc/logos/240/${path}`;
    } else {
      resolvedUrl = `${portalOrigin}/stalker_portal/screenshots/${path}`;
    }
  }

  // Always return via proxy to handle CORS/Auth
  const base = API_BASE_URL.replace(/\/api$/, '');
  return `${base}/api/proxy-image?url=${encodeURIComponent(resolvedUrl)}`;
};
