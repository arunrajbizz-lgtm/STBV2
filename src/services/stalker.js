import axios from 'axios';

export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '/api';
  
  const isTizen = typeof window.tizen !== 'undefined' || typeof window.webapis !== 'undefined';
  const hostname = window.location.hostname;
  const savedIp = typeof window.localStorage !== 'undefined' ? window.localStorage.getItem('POOMANI_SERVER_IP') : null;
  const serverIp = savedIp || hostname || '192.168.1.10';
  
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:3001/api`;
  }
  
  if (isTizen || savedIp) {
    return `http://${serverIp}:3001/api`;
  }
  
  return "/api";
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Service for interacting with the Backend API Proxy.
 */
class StalkerService {
  constructor() {
    this.axios = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    this.metadataCache = {};
    this.contentCache = {};
    this.pending = {};
    // Short-lived in-memory content cache (30s TTL).
    // Prevents redundant HTTP round-trips when user switches between categories quickly.
    this._contentCache = {}; // key → { data, ts }
    this._CONTENT_TTL = 30000; // 30 seconds
  }

  _cacheGet(key) {
    const entry = this._contentCache[key];
    if (entry && (Date.now() - entry.ts < this._CONTENT_TTL)) return entry.data;
    return null;
  }

  _cacheSet(key, data) {
    this._contentCache[key] = { data, ts: Date.now() };
  }

  async fetchCached(endpoint, params = {}, isContent = false) {
    const key = `${endpoint}-${JSON.stringify(params)}`;
    const cache = isContent ? this.contentCache : this.metadataCache;
    if (cache[key]) return cache[key];
    if (this.pending[key]) return this.pending[key];

    this.pending[key] = this.fetch(endpoint, params).then(data => {
        cache[key] = data;
        delete this.pending[key];
        return data;
    });
    return this.pending[key];
  }

  sortTamilFirst(data) {
     if (!Array.isArray(data)) return data;
     return [...data].sort((a, b) => {
        const titleA = (a.title || a.name || '').toUpperCase();
        const titleB = (b.title || b.name || '').toUpperCase();
        const isTamilA = titleA.includes('TAMIL');
        const isTamilB = titleB.includes('TAMIL');
        return isTamilB - isTamilA;
     });
  }

  async fetch(endpoint, params = {}) {
    try {
      console.log(`AUDIT: API_REQUEST_START`, { endpoint, params });
      const response = await this.axios.get(endpoint, { params });
      console.log(`AUDIT: API_REQUEST_SUCCESS`, { endpoint, data_type: typeof response.data, is_array: Array.isArray(response.data) });
      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error(`AUDIT: API_REQUEST_ERROR [${endpoint}]:`, errorMsg);
      throw new Error(errorMsg);
    }
  }

  async getLiveCategories() {
    return this.fetch('/live-categories');
  }

  async getChannels(genreId = 'all') {
    const key = `channels:${genreId}`;
    const cached = this._cacheGet(key);
    if (cached) return cached;
    const params = genreId !== 'all' ? { genre: genreId } : {};
    const data = await this.fetch('/live-channels', params);
    this._cacheSet(key, data);
    return data;
  }

  async getMovieCategories() {
    const response = await this.fetch('/media-library');
    return response?.categories || [];
  }

  async getSeriesCategories() {
    const response = await this.fetch('/series-categories');
    return response?.categories || [];
  }

  async getEPG(chId) {
    if (!chId) return [];
    try {
      const data = await this.fetch('/epg', { ch_id: chId });
      return Array.isArray(data) ? data : (data?.js || []);
    } catch (e) {
      return [];
    }
  }

  async getMovies(categoryId = 'all') {
    const key = `movies:${categoryId}`;
    const cached = this._cacheGet(key);
    if (cached) return cached;
    const params = categoryId !== 'all' ? { category: categoryId } : {};
    const data = await this.fetch('/media-library', params);
    this._cacheSet(key, data);
    return data;
  }

  async getSeries(categoryId = 'all') {
    const key = `series:${categoryId}`;
    const cached = this._cacheGet(key);
    if (cached) return cached;
    const params = categoryId !== 'all' ? { category: categoryId } : {};
    const response = await this.fetch('/series-list', params);
    const data = response?.series || [];
    this._cacheSet(key, data);
    return data;
  }

  async getSeriesInfo(seriesId) {
    return this.fetch('/series-info', { id: seriesId });
  }

  async getSeasons(seriesId) {
    const info = await this.getSeriesInfo(seriesId);
    return info?.seasons || [];
  }

  async getEpisodes(seriesId, seasonId) {
    const info = await this.getSeriesInfo(seriesId);
    const season = info?.seasons?.find(s => String(s.seasonId) === String(seasonId));
    return season?.episodes || [];
  }

  resolveUrl(url) {
    if (!url) return url;
    if (url.startsWith('http')) return url;
    const base = API_BASE_URL.replace(/\/api$/, '');
    const resolved = `${base}${url.startsWith('/') ? '' : '/'}${url}`;
    console.log(`AUDIT: RESOLVE_URL`, { original: url, resolved });
    return resolved;
  }

  async createLink(cmd, type = 'itv') {
    console.log("AUDIT: CREATE_LINK_START", { cmd, type });
    try {
      await this.axios.post('/playback-priority/enter');
      const result = await this.fetch('/create-link', { cmd, type });
      if (result?.url) {
         return this.resolveUrl(result.url);
      }
      return null;
    } finally {
      this.axios.post('/playback-priority/exit').catch(() => {});
    }
  }

  async getMovieLink(movieId, cmd) {
    const finalCmd = cmd || `/media/${movieId}.mpg`;
    try {
      await this.axios.post('/playback-priority/enter');
      const result = await this.fetch('/create-link', {
        cmd: finalCmd,
        type: 'vod',
        movie_id: movieId
      });

      if (result?.url) {
         return { url: this.resolveUrl(result.url) };
      }
      return { url: null, error: result?.error };
    } finally {
      this.axios.post('/playback-priority/exit').catch(() => {});
    }
  }

  async getEpisodeLink(seriesId, seasonId, episodeId) {
    try {
      await this.axios.post('/playback-priority/enter');
      const result = await this.fetch('/episode-link', {
        series_id: seriesId,
        season_id: seasonId,
        episode_id: episodeId
      });

      if (result?.url) {
        return { url: this.resolveUrl(result.url) };
      }
      return { url: null, error: result?.error };
    } finally {
      this.axios.post('/playback-priority/exit').catch(() => {});
    }
  }

  async getMovieCollection(collectionId) {
    const response = await this.fetch(`/movie-collection/${collectionId}`);
    return response?.movies || [];
  }
}

export default new StalkerService();
