// Client-side Search Service for Universal Search
// Manages local indexing cache, server status polling, and fast fuzzy/prefix searching.

class LocalSearchEngine {
  constructor() {
    this.index = [];
  }

  setIndex(items) {
    this.index = Array.isArray(items) ? items : [];
  }

  normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9 ]/g, " ") // replace symbols with space
      .replace(/\s+/g, " ") // collapse spaces
      .trim();
  }

  search(query) {
    const start = Date.now();
    const cleanQuery = this.normalize(query);
    if (!cleanQuery) return { results: { live: [], movie: [], series: [], episode: [] }, totalCount: 0, timeMs: 0 };

    const queryWords = cleanQuery.split(' ').filter(Boolean);
    const results = [];

    for (const item of this.index) {
      const title = item.title || "";
      const cleanTitle = this.normalize(title);
      const searchable = item.searchableText ? item.searchableText.toLowerCase() : cleanTitle;
      
      let score = 0;
      
      if (cleanTitle === cleanQuery) {
        score += 1000; // Exact Match
      } else if (cleanTitle.startsWith(cleanQuery)) {
        score += 500; // Prefix Match
      } else if (cleanTitle.includes(cleanQuery)) {
        score += 200; // Contains Match
      } else {
        // Word matches
        let matchedWords = 0;
        for (const word of queryWords) {
          if (searchable.includes(word)) {
            matchedWords++;
          }
        }
        if (matchedWords === queryWords.length) {
          score += 100;
        } else if (matchedWords > 0) {
          score += 50 * matchedWords;
        } else {
          // Fuzzy match
          const fuzzyDist = this.fuzzyMatchScore(cleanTitle, cleanQuery);
          if (fuzzyDist > 0.6) {
            score += Math.round(fuzzyDist * 80);
          }
        }
      }

      if (score > 0) {
        results.push({ ...item, score });
      }
    }

    // Sort by score and then alphabetically
    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    // Group results and limit to top 50 per category for rendering performance
    const live = [];
    const movie = [];
    const series = [];
    const episode = [];

    for (const r of results) {
      if (r.type === 'live' && live.length < 50) live.push(r);
      else if (r.type === 'movie' && movie.length < 50) movie.push(r);
      else if (r.type === 'series' && series.length < 50) series.push(r);
      else if (r.type === 'episode' && episode.length < 50) episode.push(r);
    }

    const duration = Date.now() - start;
    
    // Telemetry logs
    try {
      fetch('/api/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `SEARCH_QUERY: "${query}" | SEARCH_RESULTS_COUNT: ${results.length} | TIME: ${duration}ms` })
      }).catch(() => {});
    } catch (e) {}

    return {
      results: { live, movie, series, episode },
      totalCount: results.length,
      timeMs: duration
    };
  }

  fuzzyMatchScore(title, query) {
    if (query.length < 3) return 0;
    if (title.length < query.length) return 0;
    
    let titleIdx = 0;
    let queryIdx = 0;
    let matches = 0;
    
    while (titleIdx < title.length && queryIdx < query.length) {
      if (title[titleIdx] === query[queryIdx]) {
        queryIdx++;
        matches++;
      }
      titleIdx++;
    }
    
    return matches / query.length;
  }
}

class SearchService {
  constructor() {
    this.engine = new LocalSearchEngine();
    this.dbName = 'poomani_search_db';
    this.storeName = 'search_indices';
    this.db = null;
    this.apiBaseUrl = '';
    
    // Resolve API URL
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const savedIp = window.localStorage.getItem('POOMANI_SERVER_IP');
      const serverIp = savedIp || hostname || '127.0.0.1';
      this.apiBaseUrl = `http://${serverIp}:3001/api`;
    }
  }

  async initDB() {
    if (this.db) return this.db;
    if (typeof window === 'undefined' || !window.indexedDB) return null;

    return new Promise((resolve) => {
      const request = window.indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = () => {
        resolve(null);
      };
    });
  }

  async getCachedIndex(providerId) {
    const db = await this.initDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction([this.storeName], 'readonly');
          const store = transaction.objectStore(this.storeName);
          const req = store.get(providerId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }
    
    // Fallback to localStorage
    try {
      const data = window.localStorage.getItem(`search_index_${providerId}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  async cacheIndex(providerId, items) {
    const db = await this.initDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);
          const req = store.put(items, providerId);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }

    // Fallback to localStorage (chunked if large, or try catch block)
    try {
      window.localStorage.setItem(`search_index_${providerId}`, JSON.stringify(items));
      return true;
    } catch (e) {
      console.warn('[SearchService] localStorage cache size limit exceeded');
      return false;
    }
  }

  async fetchIndexFromServer() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/search/index`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('[SearchService] Failed to fetch index from server:', e.message);
      return [];
    }
  }

  async getStatus() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/search/status`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (e) {
      return { status: 'idle', progress: 0, itemsCount: 0 };
    }
  }

  async triggerIndexing(force = false) {
    try {
      await fetch(`${this.apiBaseUrl}/search/trigger?force=${force}`, { method: 'POST' });
      return true;
    } catch (e) {
      return false;
    }
  }

  async loadIndex(providerId) {
    if (!providerId) return false;
    
    console.log('[SearchService] Loading search index...');
    // 1. Try local cache first
    let items = await this.getCachedIndex(providerId);
    
    if (items && items.length > 0) {
      console.log(`[SearchService] Loaded search index from cache: ${items.length} items`);
      this.engine.setIndex(items);
      
      // Async background check for server status / updates
      this.checkAndSyncIndex(providerId).catch(() => {});
      return true;
    }
    
    // 2. Fallback to server index if cache missing
    items = await this.fetchIndexFromServer();
    if (items && items.length > 0) {
      this.engine.setIndex(items);
      await this.cacheIndex(providerId, items);
      console.log(`[SearchService] Loaded search index from server: ${items.length} items`);
      return true;
    }
    
    return false;
  }

  async checkAndSyncIndex(providerId) {
    const status = await this.getStatus();
    if (status.status === 'complete' && status.itemsCount > 0) {
      const items = await this.fetchIndexFromServer();
      if (items && items.length > 0) {
        this.engine.setIndex(items);
        await this.cacheIndex(providerId, items);
        console.log(`[SearchService] Synchronized index from server: ${items.length} items`);
      }
    }
  }

  search(query) {
    return this.engine.search(query);
  }
}

export default new SearchService();
