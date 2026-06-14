import express from 'express';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import { pipeline } from 'stream';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

import os from 'os';

// --- PROXY & VPN CONFIGURATION ---
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:40000';
const CLOUDFLARE_WORKER_URL = '129.154.34.222';
let proxyAgent = null;

// Smart Proxy Check: Only enable if a local proxy (WARP) is reachable
const checkProxy = async () => {
    try {
        // Test connection to the local WARP proxy
        const url = new URL(PROXY_URL);
        const req = http.request({
            host: url.hostname,
            port: url.port,
            method: 'CONNECT',
            path: 'google.com:443',
            timeout: 2000
        });
        req.on('error', () => {});
        req.end();
        
        proxyAgent = new HttpsProxyAgent(PROXY_URL);
        console.log(`AUDIT: WARP_PROXY_DETECTED_FOR_STREAMS`, { url: PROXY_URL });
    } catch (e) {
        proxyAgent = null;
        console.log(`AUDIT: NO_WARP_DETECTED_STREAMS_DIRECT`);
    }
};
checkProxy();

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 15000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 15000, rejectUnauthorized: false });
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

const streamPipeline = promisify(pipeline);

// --- GLOBAL PROCESS SAFETY ---
process.on('uncaughtException', (err) => {
  console.error('!!! CRITICAL UNCAUGHT EXCEPTION !!!');
  console.error(err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('!!! UNHANDLED PROMISE REJECTION !!!');
  console.error('Reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 3001;
console.log("SERVER_START", { PORT, PID: process.pid });

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE_FILE = path.resolve(__dirname, 'cache.json');
let PERSISTENT_CACHE_DATA = { vod: {}, categories: {}, auth: {}, seriesInfo: {}, vodResolution: {}, epg: {} };
const loadCache = () => { try { if (fs.existsSync(CACHE_FILE)) PERSISTENT_CACHE_DATA = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch (e) {} };
const saveCache = () => { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(PERSISTENT_CACHE_DATA, null, 2)); } catch (e) {} };
loadCache();
PERSISTENT_CACHE_DATA.vodResolution = {}; // Flush VOD resolutions on start to clear incorrect cache mappings

// --- REQUEST QUEUE (Concurrency & Priority Control) ---
class RequestQueue {
  constructor(maxConcurrent = 1, minDelay = 1000) {
    this.maxConcurrent = maxConcurrent;
    this.minDelay = minDelay;
    this.queue = [];
    this.activeCount = 0;
    this.lastRequestTime = 0;
  }

  async add(fn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ 
        fn, resolve, reject, priority, 
        timestamp: Date.now() 
      });
      this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
      
      if (this.queue.length > 5) {
          console.log("AUDIT: QUEUE_BURST", { size: this.queue.length, active: this.activeCount });
      }
      
      this.process();
    });
  }

  async process() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

    const now = Date.now();
    const timeToWait = Math.max(0, this.lastRequestTime + this.minDelay - now);

    if (timeToWait > 0) {
      setTimeout(() => this.process(), timeToWait);
      return;
    }

    const item = this.queue.shift();
    this.activeCount++;
    this.lastRequestTime = Date.now();

    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeCount--;
      this.process();
    }
  }
}

// FIX: Reduced from 1500ms → 300ms. Portal handles concurrent requests fine;
// the 1500ms delay was causing category loads to take 3–15 seconds unnecessarily.
const portalQueue = new RequestQueue(1, 800);

// --- PROVIDER MANAGER ---
class ProviderManager {
  constructor() {
    this.filePath = path.resolve(__dirname, 'providers.json');
    this.data = { activeProviderId: '', providers: [] };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(fileContent);
      }
    } catch (error) {
      console.error('PM_LOAD_ERROR', error.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('PM_SAVE_ERROR', error);
    }
  }

  getProviders() {
    return this.data.providers.map(p => ({
      ...this.normalize(p),
      active: p.id === this.data.activeProviderId
    }));
  }

  getActiveProvider() {
    const provider = this.data.providers.find(p => p.id === this.data.activeProviderId) || null;
    return provider ? this.normalize(provider) : null;
  }

  normalize(provider) {
    const map = {
      portalUrl: 'PORTAL_URL',
      mac: 'MAC',
      sn: 'SN',
      deviceId1: 'DEVICE_ID',
      deviceId2: 'DEVICE_ID2',
      signature: 'SIGNATURE'
    };
    const normalized = { ...provider };
    for (const [frontendKey, backendKey] of Object.entries(map)) {
      if (provider[frontendKey] !== undefined) {
        normalized[backendKey] = provider[frontendKey];
      }
      if (provider[backendKey] !== undefined && normalized[frontendKey] === undefined) {
        normalized[frontendKey] = provider[backendKey];
      }
    }
    return normalized;
  }

  addProvider(provider) {
    const normalized = this.normalize(provider);
    normalized.id = normalized.id || Date.now().toString();
    this.data.providers.push(normalized);
    if (!this.data.activeProviderId) {
      this.data.activeProviderId = normalized.id;
    }
    this.save();
    return normalized;
  }

  updateProvider(id, updates) {
    const index = this.data.providers.findIndex(p => p.id === id);
    if (index !== -1) {
      const normalizedUpdates = this.normalize(updates);
      this.data.providers[index] = { ...this.data.providers[index], ...normalizedUpdates, id };
      this.save();
      return this.data.providers[index];
    }
    return null;
  }

  deleteProvider(id) {
    this.data.providers = this.data.providers.filter(p => p.id !== id);
    if (this.data.activeProviderId === id) {
      this.data.activeProviderId = this.data.providers.length > 0 ? this.data.providers[0].id : '';
    }
    this.save();
  }

  activateProvider(id) {
    if (this.data.providers.find(p => p.id === id)) {
      this.data.activeProviderId = id;
      this.save();
      return true;
    }
    return false;
  }
}

const providerManager = new ProviderManager();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const normalizePortalUrl = (url) => {
  if (!url) return '';
  let normalized = url.trim();
  if (!normalized.startsWith('http')) {
    normalized = 'http://' + normalized;
  }
  normalized = normalized.replace(/\/+$/, '');
  if (normalized.includes('/server/load.php')) return normalized;
  if (normalized.endsWith('/c')) return normalized.replace(/\/c$/, '/server/load.php');
  return normalized + '/server/load.php';
};

const getHeaders = (opts = {}, providerOverride = null) => {
  const provider = providerOverride || providerManager.getActiveProvider();
  if (!provider) return {};

  const baseUrl = (provider.PORTAL_URL || '').replace(/\/c\/?$/, '').replace(/\/$/, '');
  const referer = provider.REFERER || `${baseUrl}/c/`;
  const mac = provider.MAC || '';
  const providerName = (provider.name || '').toUpperCase();

  // AUTHENTIC MAG IDENTITY STRATEGY
  const magUA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
  
  // Airtel/Jio require more authentic headers
  const isStrict = providerName.includes('AIRTEL') || providerName.includes('JIO');
  
  let cookie = `mac=${mac}; stb_lang=en; timezone=Asia/Kolkata;`;
  if (opts.token && !opts.isCdn) {
    cookie += ` token=${opts.token};`;
  }

  const headers = {
    'User-Agent': provider.STB_USER_AGENT || magUA,
    'X-User-Agent': provider.STB_X_USER_AGENT || `model=MAG250;vver=250;ver=0.2.18-r14;ser=${mac}`,
    'Referer': referer,
    'Origin': referer.replace(/\/c\/$/, ''),
    'Cookie': cookie,
    'X-STB-MAC': mac,
    'Accept': '*/*',
    'Connection': 'keep-alive',
    // SPOOFING RESIDENTIAL IP: Trick portal into thinking connection is from an Indian ISP
    'X-Forwarded-For': `49.36.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
    'X-Real-IP': `49.36.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`
  };

  if (opts.token && !opts.isCdn) {
    headers['Authorization'] = `Bearer ${opts.token}`;
  }
  return headers;
};

class PortalClient {
  constructor() {
    this.tokens = {};
    this.isAuthorizedState = {};
    this.pendingAuths = new Map();
    this.lastHandshakeTimes = {};
    this.categoryCache = new Map();
    this.CACHE_TTL = 3600 * 1000;
    this.pendingRequests = new Map();
    this.priorityActiveCount = 0;
    
    // PER-PROVIDER ROUTING LOGIC
    // Determine if a provider should use the VPN proxy, Bridge, or a direct connection
    this.getAgent = (provider) => {
       // Use local proxyAgent (WARP) as fallback if available
       if (proxyAgent) return proxyAgent;
       
       return null; 
    };

    this.getPortalUrl = (provider, originalUrl) => {
        const name = (provider?.name || '').toUpperCase();
        const url = (originalUrl || '').toLowerCase();
        
        // ROUTE STRICT PROVIDERS THROUGH CLOUDFLARE BRIDGE
        if (name.includes('JIO') || name.includes('AIRTEL') || url.includes('jiotv') || url.includes('airtel')) {
            // Note: Cloudflare worker is now smart enough to merge query params from its own URL
            return CLOUDFLARE_WORKER_URL + '?url=' + encodeURIComponent(originalUrl);
        }
        
        return originalUrl;
    };

    // Load existing token from cache if present for active provider
    if (PERSISTENT_CACHE_DATA.auth?.token) {
       const activeProvider = providerManager.getActiveProvider();
       if (activeProvider) {
          this.tokens[activeProvider.id] = PERSISTENT_CACHE_DATA.auth.token;
          this.isAuthorizedState[activeProvider.id] = true;
       }
    }
    // Also load from multi-tenant cache if present
    if (PERSISTENT_CACHE_DATA.auths) {
       for (const pid in PERSISTENT_CACHE_DATA.auths) {
          this.tokens[pid] = PERSISTENT_CACHE_DATA.auths[pid].token;
          this.isAuthorizedState[pid] = true;
       }
    }
  }

  get token() {
    const provider = providerManager.getActiveProvider();
    return provider ? this.tokens[provider.id] : null;
  }

  set token(val) {
    const provider = providerManager.getActiveProvider();
    if (provider) {
       this.tokens[provider.id] = val;
       if (val === null) {
          this.isAuthorizedState[provider.id] = false;
          if (PERSISTENT_CACHE_DATA.auths) delete PERSISTENT_CACHE_DATA.auths[provider.id];
       }
    }
  }

  get isAuthorized() {
    const provider = providerManager.getActiveProvider();
    return provider ? !!this.isAuthorizedState[provider.id] : false;
  }

  set isAuthorized(val) {
    const provider = providerManager.getActiveProvider();
    if (provider) {
       this.isAuthorizedState[provider.id] = val;
    }
  }

  async enterPlaybackPriority() { 
    this.priorityActiveCount++; 
    console.log("AUDIT: PLAYBACK_PRIORITY_ENTER", { count: this.priorityActiveCount });
  }
  exitPlaybackPriority() { 
    this.priorityActiveCount = Math.max(0, this.priorityActiveCount - 1); 
    console.log("AUDIT: PLAYBACK_PRIORITY_EXIT", { count: this.priorityActiveCount });
  }
  async waitPlayback() {
    if (this.priorityActiveCount > 0) {
       console.log("AUDIT: WAITING_FOR_PLAYBACK_PRIORITY_EXIT");
       const startTime = Date.now();
       const maxWaitMs = 15000; // max 15 seconds wait
       while (this.priorityActiveCount > 0 && (Date.now() - startTime < maxWaitMs)) {
           await new Promise(r => setTimeout(r, 500));
       }
       if (this.priorityActiveCount > 0) {
           console.warn("AUDIT: WAITING_FOR_PLAYBACK_PRIORITY_EXIT TIMED OUT");
       }
    }
  }

  _getAuthParams(provider) {
    const mac = provider.MAC || '';
    const sn = provider.SN || Buffer.from(mac.replace(/:/g, '')).toString('hex').toUpperCase().substring(0, 13);
    const device_id = provider.DEVICE_ID || crypto.createHash('sha256').update(mac).digest('hex').toUpperCase();
    const signature = provider.SIGNATURE || crypto.createHash('sha256').update(sn).digest('hex').toUpperCase();
    
    // AIRTEL-OPTIMIZED SIGNATURE
    const providerName = (provider.name || '').toUpperCase();
    let hw2 = provider.HW_VERSION_2 || '2.18-r14';
    
    if (provider.PORTAL_URL && provider.PORTAL_URL.includes('Jiotv.be')) {
        hw2 = sn.toLowerCase() + '21c29bcaee8b4b0f103';
    } else if (providerName.includes('AIRTEL')) {
        // Authentic MAG254/270 hardware signature pattern for Airtel
        hw2 = '2.18-r14-pub-270'; 
    }
    
    return { 
        sn, 
        device_id, 
        device_id2: device_id, 
        signature, 
        hw_version: provider.HW_VERSION || '1.6-BD-00', 
        hw_version_2: hw2 
    };
  }

  async authorize(force = false, priority = 10, source = 'unknown', providerOverride = null) {
    const provider = providerOverride || providerManager.getActiveProvider();
    if (!provider) throw new Error('No active provider configured');
    const providerId = provider.id;

    if (!force && this.tokens[providerId]) {
        const age = Date.now() - (PERSISTENT_CACHE_DATA.auths?.[providerId]?.timestamp || PERSISTENT_CACHE_DATA.auth?.timestamp || 0);
        if (age < 3600 * 1000) return this.tokens[providerId];
    }

    if (this.pendingAuths.has(providerId)) {
        console.log("AUDIT: AUTH_AWAIT_PENDING", { source, providerId });
        return this.pendingAuths.get(providerId);
    }

    // Cooldown check: prevent handshake storm
    const now = Date.now();
    const cooldownMs = 5000;
    const lastHandshake = this.lastHandshakeTimes[providerId] || 0;
    if (force && (now - lastHandshake < cooldownMs)) {
        console.log("AUDIT: AUTH_COOLDOWN_ACTIVE", { source, providerId, remaining: cooldownMs - (now - lastHandshake) });
        if (this.tokens[providerId]) return this.tokens[providerId];
    }

    console.log("AUDIT: AUTHORIZATION_START", { providerName: provider.name, force, priority, source, time: new Date().toISOString() });
    this.lastHandshakeTimes[providerId] = now;

    const authPromise = (async () => {
      try {
        let attempts = 0;
        const agent = this.getAgent(provider);
        
        while (attempts < 3) {
          try {
            const portalUrl = this.getPortalUrl(provider, normalizePortalUrl(provider.PORTAL_URL));
            const authParams = this._getAuthParams(provider);
            
            console.log("AUDIT: AUTH_STEP_1_HANDSHAKE", { providerName: provider.name, source, attempt: attempts, proxy: !!agent, bridge: portalUrl.includes('workers.dev') });
            const response = await axios.post(portalUrl, null, {
              params: { type: 'stb', action: 'handshake', token: '', ...authParams, JsHttpRequest: '1-xml' },
              headers: getHeaders({ token: '' }, provider),
              timeout: 20000,
              validateStatus: false,
              ...(agent ? { httpsAgent: agent, httpAgent: agent } : {})
            });
            
            if (response.status === 429) {
               console.error("AUDIT: AUTH_429_RATE_LIMITED", { providerName: provider.name, attempt: attempts });
               const delay = 5000 * (attempts + 1);
               await new Promise(r => setTimeout(r, delay));
               attempts++;
               continue;
            }

            const token = response.data?.js?.token || response.data?.token;
            if (!token) throw new Error("HANDSHAKE_FAILED: " + JSON.stringify(response.data));
            console.log("AUDIT: AUTH_STEP_1_SUCCESS", { providerName: provider.name, token: token.substring(0, 8) + '...' });

            console.log("AUDIT: AUTH_STEP_2_PROFILE", { providerName: provider.name });
            const profileParams = {
              type: 'stb',
              action: 'get_profile',
              hd: 1,
              ver: 'ImageDescription: 0.2.18-r14-pub-270; ImageDate: Fri Jan 15 15:20:44 EET 2016; PORTAL version: 5.1.0; API Version: JS API version: 328; STB API version: 134; Player Engine version: 0x566',
              num_banks: 2,
              sn: authParams.sn,
              stb_type: 'MAG270',
              image_version: 218,
              video_out: 'hdmi',
              device_id: authParams.device_id,
              device_id2: authParams.device_id2,
              signature: authParams.signature,
              auth_second_step: 1,
              hw_version: authParams.hw_version,
              not_valid_token: 0,
              client_type: 'STB',
              hw_version_2: authParams.hw_version_2,
              timestamp: Math.floor(Date.now() / 1000),
              api_signature: 263,
              metrics: JSON.stringify({
                mac: provider.MAC,
                sn: authParams.sn,
                model: 'MAG270',
                type: 'STB',
                uid: '',
                device_id: authParams.device_id,
                device_id2: authParams.device_id2,
                signature: authParams.signature
              }),
              token: token,
              JsHttpRequest: '1-xml'
            };

            const profile = await axios.post(portalUrl, null, {
              params: profileParams,
              headers: getHeaders({ token }, provider),
              timeout: 20000,
              ...(agent ? { httpsAgent: agent, httpAgent: agent } : {})
            });

            if (profile.data?.js === false || profile.data?.error === 'Authorization failed') {
               throw new Error("MAC_NOT_AUTHORIZED");
            }
            console.log("AUDIT: AUTH_STEP_2_SUCCESS", { providerName: provider.name });

            this.tokens[providerId] = token;
            this.isAuthorizedState[providerId] = true;
            
            if (!PERSISTENT_CACHE_DATA.auths) PERSISTENT_CACHE_DATA.auths = {};
            PERSISTENT_CACHE_DATA.auths[providerId] = { token, timestamp: Date.now() };
            saveCache();

            console.log("AUDIT: AUTHORIZATION_SUCCESS", { providerName: provider.name, source });
            // Trigger background search indexing
            setTimeout(() => {
                if (typeof searchIndexer !== 'undefined') {
                   searchIndexer.startIndexing(provider, false);
                }
            }, 5000);
            return token;
          } catch (err) {
            if (err.message.includes('429') && attempts < 3) {
               attempts++;
               await new Promise(r => setTimeout(r, 5000));
               continue;
            }
            console.error("AUDIT: AUTHORIZATION_FAILED", { providerName: provider.name, source, message: err.message });
            this.isAuthorizedState[providerId] = false;
            throw err;
          }
        }
        throw new Error("PORTAL_RATE_LIMIT_EXCEEDED");
      } finally {
        this.pendingAuths.delete(providerId);
      }
    })();

    this.pendingAuths.set(providerId, authPromise);
    return authPromise;
  }

  async request(type, action, params = {}, retryCount = 0, priority = 0, providerOverride = null) {
    const provider = providerOverride || providerManager.getActiveProvider();
    if (!provider) return { js: {}, error: 'NO_PROVIDER' };

    const portalUrl = normalizePortalUrl(provider.PORTAL_URL);
    const requestKey = `${provider.id}:${type}:${action}:${JSON.stringify(params)}`;

    if (this.pendingRequests.has(requestKey)) return this.pendingRequests.get(requestKey);

    // --- PLAYBACK PRIORITY CHECK (BEFORE QUEUE) ---
    // If this is a background or low-priority request, wait for active playback to stabilize
    if (priority < 100) {
        await this.waitPlayback();
    }

    const requestPromise = portalQueue.add(async () => {
      let currentRetry = retryCount;
      const maxRetries = 3;
      const agent = this.getAgent(provider);

      while (true) {
        try {
          const portalUrl = this.getPortalUrl(provider, normalizePortalUrl(provider.PORTAL_URL));
          console.log(`AUDIT: PORTAL_REQUEST_EXECUTE`, { providerName: provider.name, type, action, priority, retry: currentRetry, proxy: !!agent, bridge: portalUrl.includes('workers.dev') });
          const usedToken = await this.authorize(false, priority + 1, `${type}:${action}`, provider);
          const authParams = this._getAuthParams(provider);
          
          const response = await axios.post(portalUrl, null, {
            params: { type, action: action, ...params, ...authParams, token: usedToken, JsHttpRequest: '1-xml' },
            headers: getHeaders({ token: usedToken }, provider),
            timeout: 15000,
            ...(agent ? { httpsAgent: agent, httpAgent: agent } : {})
          });

          const responseData = response.data;
          const isAuthFail = (typeof responseData === 'string' && responseData.includes('Authorization failed')) ||
                             (responseData && (responseData.error === 'Authorization failed' || (responseData.js && responseData.js.error === 'Authorization failed')));
          
          if (isAuthFail) {
            console.warn("AUDIT: AUTH_FAILED_IN_RESPONSE", { providerName: provider.name, type, action });
            if (currentRetry < 1) {
              currentRetry++;
              await this.authorize(true, priority + 1, `retry:${type}:${action}`, provider);
              continue;
            }
            return { js: {}, error: 'Authorization failed' };
          }

          return responseData;
        } catch (error) {
          console.error(`AUDIT: REQUEST_ERROR`, { providerName: provider.name, type, action, status: error.response?.status, message: error.message });

          if (error.response?.status === 429 && currentRetry < 5) {
            const delay = 3000 * (currentRetry + 1);
            console.log(`AUDIT: RATE_LIMIT_RETRY_DELAY`, { delay });
            await new Promise(r => setTimeout(r, delay));
            currentRetry++;
            continue;
          }

          if (currentRetry < 1 && (error.response?.status === 401 || error.response?.status === 403)) {
            currentRetry++;
            await this.authorize(true, priority + 1, `error:${type}:${action}`, provider);
            continue;
          }

          return { js: {}, error: error.message };
        }
      }
    }, priority);

    this.pendingRequests.set(requestKey, requestPromise);
    try { 
      return await requestPromise; 
    } catch (e) {
      return { js: {}, error: e.message };
    } finally { 
      this.pendingRequests.delete(requestKey); 
    }
  }
}

const portal = new PortalClient();

const filterAndSortCategories = (categories) => {
  if (!Array.isArray(categories)) return [];
  const filtered = categories.filter(cat => !/adult|18\+|xxx|porn|sex/i.test(cat.title || cat.name || ""));
  const tamilCats = filtered.filter(cat => (cat.title || cat.name || "").toLowerCase().includes('tamil'));
  const otherCats = filtered.filter(cat => !(cat.title || cat.name || "").toLowerCase().includes('tamil'));
  return [...tamilCats, ...otherCats];
};



// ── Fast first-page fetch (used by content routes for immediate response) ────────────
// Returns page 1 immediately; kicks off a background job to fetch remaining pages.
const _backgroundFetching = new Set(); // prevents duplicate background jobs per cacheKey

const fetchFirstPage = async (type, action, initialParams = {}, priority = 0) => {
  const categoryId = initialParams.category || initialParams.category_id || initialParams.genre || '0';
  const cacheKey = `${type}:${categoryId}`;

  // ── Serve from disk cache if still fresh (12 hours) ──────────────────────────────
  if (PERSISTENT_CACHE_DATA.vod?.[cacheKey]) {
    const cached = PERSISTENT_CACHE_DATA.vod[cacheKey];
    if (Date.now() - cached.timestamp < 12 * 3600 * 1000) {
      console.log(`CACHE_HIT [${cacheKey}] → ${cached.data.length} items`);
      return cached.data;
    }
  }

  // ── Page 1 — must complete before we respond ─────────────────────────────────────
  const firstPage = await portal.request(type, action, { ...initialParams, p: 1 }, 0, priority);
  const js = firstPage.js || {};
  const page1Items = Array.isArray(js) ? js : (Array.isArray(js.data) ? js.data : []);

  const totalItems = parseInt(js.total_items || js.total || 0, 10);
  const perPage    = parseInt(js.max_page_items || js.per_page || page1Items.length || 14, 10);
  const totalPages = (totalItems > 0 && perPage > 0) ? Math.ceil(totalItems / perPage) : 1;

  console.log(`PAGE1 [${cacheKey}] items=${page1Items.length} totalPages=${totalPages}`);

  // Seed cache with page 1 so subsequent requests within the same session are fast.
  if (!PERSISTENT_CACHE_DATA.vod) PERSISTENT_CACHE_DATA.vod = {};
  const existing = PERSISTENT_CACHE_DATA.vod[cacheKey];
  // Only update if we have at least as many items as before (avoid regression)
  if (!existing || page1Items.length >= existing.data.length) {
    PERSISTENT_CACHE_DATA.vod[cacheKey] = { data: page1Items, timestamp: Date.now(), complete: totalPages <= 1 };
  }

  // ── Kick off background fetch of remaining pages ──────────────────────────────────
  if (totalPages > 1 && !_backgroundFetching.has(cacheKey)) {
    _backgroundFetching.add(cacheKey);
    const MAX_PAGES = 30; // fetch up to 30 pages in background (no user is waiting)
    const pagesToFetch = Math.min(totalPages, MAX_PAGES);
    (async () => {
      const allItems = [...page1Items];
      const BATCH = 4; // fetch 4 pages concurrently per batch
      for (let p = 2; p <= pagesToFetch; p += BATCH) {
        // --- PLAYBACK PRIORITY CHECK ---
        // Pause background fetching if a movie or series is launching/playing
        await portal.waitPlayback();

        const batch = [];
        for (let b = p; b < p + BATCH && b <= pagesToFetch; b++) {
          batch.push(
            portal.request(type, action, { ...initialParams, p: b }, 0, priority)
              .then(r => { const j = r.js || {}; return Array.isArray(j) ? j : (Array.isArray(j.data) ? j.data : []); })
              .catch(() => [])
          );
        }
        // Small gap between batches to avoid hammering the portal
        await new Promise(r => setTimeout(r, 500));
        const batchResults = await Promise.all(batch);
        let added = 0;
        for (const items of batchResults) {
          if (items.length === 0) { pagesToFetch; break; } // portal returned empty — stop
          allItems.push(...items);
          added += items.length;
        }
        if (added === 0) break;
        console.log(`BG_FETCH [${cacheKey}] pages ${p}~${Math.min(p+BATCH-1, pagesToFetch)} → total ${allItems.length}`);
        // Update cache progressively so the next request gets more items
        PERSISTENT_CACHE_DATA.vod[cacheKey] = { data: allItems, timestamp: Date.now(), complete: false };
      }
      PERSISTENT_CACHE_DATA.vod[cacheKey] = { data: allItems, timestamp: Date.now(), complete: true };
      saveCache();
      _backgroundFetching.delete(cacheKey);
      console.log(`BG_FETCH_DONE [${cacheKey}] → ${allItems.length} total items`);
    })().catch(e => {
      console.error(`BG_FETCH_ERROR [${cacheKey}]:`, e.message);
      _backgroundFetching.delete(cacheKey);
    });
  }

  return PERSISTENT_CACHE_DATA.vod[cacheKey].data;
};

// Legacy full-blocking fetchAll — kept for collection fallback only
const fetchAll = async (type, action, initialParams = {}, priority = 0) => {
  const categoryId = initialParams.category || initialParams.category_id || initialParams.genre || '0';
  const cacheKey = `${type}:${categoryId}`;
  if (PERSISTENT_CACHE_DATA.vod?.[cacheKey]) {
    const cached = PERSISTENT_CACHE_DATA.vod[cacheKey];
    if (Date.now() - cached.timestamp < 12 * 3600 * 1000) return cached.data;
  }
  // Delegate to fast fetcher and let background fill the rest
  return fetchFirstPage(type, action, initialParams, priority);
};


const isSeriesItem = (item) => {
  if (!item) return false;
  if (item.is_season || item.season_series || item.is_episode || item.season_id) return true;
  if (item.is_series === '1' || item.is_series === 1) return true;
  if (Array.isArray(item.series) && item.series.length > 0) return true;
  if (item.series && !Array.isArray(item.series)) return true;
  return false;
};

// A collection folder item: it's a parent container but its children are plain movies (not episodes)
// Detected when is_season/is_episode/season_id are NOT set but it has child items
const isCollectionFolder = (item) => {
  if (!item) return false;
  // If explicitly flagged as movie/vod, not a series
  if (item.is_series === '0' || item.is_series === 0) return false;
  // Collection folders often have no series markers but show in a parent query
  return !item.is_season && !item.season_series && !item.is_episode && !item.season_id &&
         !item.is_series && (!item.series || (Array.isArray(item.series) && item.series.length === 0));
};

const findCachedVod = (id) => {
  if (!PERSISTENT_CACHE_DATA.vod) return null;
  for (const cacheKey of Object.keys(PERSISTENT_CACHE_DATA.vod)) {
    const list = PERSISTENT_CACHE_DATA.vod[cacheKey]?.data || [];
    const found = list.find(item => String(item.id) === String(id));
    if (found) return found;
  }
  return null;
};

app.get('/api/debug/handshake', (req, res) => res.json({ status: 'online', token: portal.token ? 'PRESENT' : 'MISSING' }));

app.post('/api/client-log', (req, res) => {
  const { message, data } = req.body;
  console.log(`[CLIENT_LOG] ${message}`, data ? JSON.stringify(data) : '');
  res.json({ success: true });
});

// --- SEARCH ENDPOINTS ---
app.get('/api/search', (req, res) => {
  res.json(searchIndexer.search(req.query.q || ''));
});

app.get('/api/search/status', (req, res) => {
  const pid = providerManager.getActiveProvider()?.id;
  res.json(searchIndexer.status[pid] || { status: 'idle' });
});

// --- PLAYBACK PRIORITY ENDPOINTS ---
app.post('/api/playback-priority/enter', (req, res) => {
  portal.enterPlaybackPriority();
  res.json({ success: true, count: portal.priorityActiveCount });
});

app.post('/api/playback-priority/exit', (req, res) => {
  portal.exitPlaybackPriority();
  res.json({ success: true, count: portal.priorityActiveCount });
});

// --- PROVIDERS ROUTES ---
app.get('/api/providers', (req, res) => {
  res.json(providerManager.getProviders());
});

app.post('/api/providers', (req, res) => {
  try {
    const p = providerManager.addProvider(req.body);
    res.json(p);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/providers/:id', (req, res) => {
  try {
    const p = providerManager.updateProvider(req.params.id, req.body);
    if (!p) return res.status(404).json({ error: 'Provider not found' });
    res.json(p);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/providers/:id', (req, res) => {
  try {
    providerManager.deleteProvider(req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/providers/activate/:id', (req, res) => {
  try {
    const success = providerManager.activateProvider(req.params.id);
    if (!success) return res.status(404).json({ error: 'Provider not found' });
    // Reset auth so new provider re-authenticates fresh
    portal.token = null;
    portal.isAuthorized = false;
    // BUG#2 FIX: Clear server-side content caches so new provider data is fetched
    portal.pendingRequests.clear();      // BUG#5 FIX: drop in-flight dedup promises
    portal.categoryCache.clear();
    PERSISTENT_CACHE_DATA.vod = {};
    PERSISTENT_CACHE_DATA.categories = {};
    PERSISTENT_CACHE_DATA.auth = {};
    PERSISTENT_CACHE_DATA.vodResolution = {};  // FIX: file IDs are provider-specific — MUST clear
    PERSISTENT_CACHE_DATA.seriesInfo = {};     // FIX: episode cmd paths are provider-specific
    PERSISTENT_CACHE_DATA.epg = {};            // FIX: channel IDs differ per provider
    // Persist the cleared cache to disk immediately
    saveCache();
    if (typeof searchIndexer !== 'undefined') {
       searchIndexer.status[req.params.id] = { status: 'idle', progress: 0, itemsCount: 0 };
    }
    console.log('PROVIDER_SWITCHED: all caches cleared for provider', req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/providers/test', async (req, res) => {
  try {
    const config = req.body;
    const portalUrl = normalizePortalUrl(config.PORTAL_URL || config.portalUrl);
    const mac = config.MAC || config.mac || '';
    const sn = config.SN || config.sn || Buffer.from(mac.replace(/:/g, '')).toString('hex').toUpperCase().substring(0, 13);
    const device_id = config.DEVICE_ID || config.deviceId1 || crypto.createHash('sha256').update(mac).digest('hex').toUpperCase();
    const signature = config.SIGNATURE || config.signature || crypto.createHash('sha256').update(sn).digest('hex').toUpperCase();
    let hw2 = config.HW_VERSION_2 || config.hw_version_2 || '2.18-r14';
    if (portalUrl && portalUrl.includes('Jiotv.be')) hw2 = sn.toLowerCase() + '21c29bcaee8b4b0f103';
    
    const testAuthParams = { sn, device_id, device_id2: device_id, signature, hw_version: config.HW_VERSION || config.hw_version || '1.6-BD-00', hw_version_2: hw2 };
    
    const testHeaders = {
      'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
      'X-User-Agent': `model=MAG250;vver=250;ver=0.2.18-r14;ser=${mac}`,
      'Referer': portalUrl.replace(/server\/load\.php$/, 'c/'),
      'Cookie': `mac=${mac};`,
      'X-STB-MAC': mac
    };

    const handshakeRes = await axios.post(portalUrl, null, {
      params: { type: 'stb', action: 'handshake', token: '', ...testAuthParams, JsHttpRequest: '1-xml' },
      headers: testHeaders,
      timeout: 10000
    });
    
    const token = handshakeRes.data?.js?.token;
    if (!token) throw new Error("HANDSHAKE_FAILED");

    const profileRes = await axios.post(portalUrl, null, {
      params: { type: 'stb', action: 'get_profile', ...testAuthParams, token, JsHttpRequest: '1-xml' },
      headers: { ...testHeaders, 'Cookie': `mac=${mac}; token=${token};`, 'Authorization': `Bearer ${token}` },
      timeout: 10000
    });

    if (profileRes.data?.js === false) throw new Error("MAC_NOT_AUTHORIZED");

    res.json({ success: true, profile: profileRes.data?.js || {} });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/live-categories', async (req, res) => {
  try {
    if (PERSISTENT_CACHE_DATA.categories?.['live']) {
       const cached = PERSISTENT_CACHE_DATA.categories['live'];
       if (Date.now() - cached.timestamp < 12 * 3600 * 1000) return res.json(cached.data);
    }
    const data = await portal.request('itv', 'get_genres', {}, 0, 20);
    const filtered = filterAndSortCategories(data.js || data || []);
    const result = filtered.map(c => ({ ...c, count: 0 }));
    if (result.length > 0) {
      if (!PERSISTENT_CACHE_DATA.categories) PERSISTENT_CACHE_DATA.categories = {};
      PERSISTENT_CACHE_DATA.categories['live'] = { data: result, timestamp: Date.now() };
      saveCache();
    }
    res.json(result);
  } catch (error) {
    if (PERSISTENT_CACHE_DATA.categories?.['live']) {
      return res.json(PERSISTENT_CACHE_DATA.categories['live'].data);
    }
    res.json([]);
  }
});

app.get('/api/live-channels', async (req, res) => {
  const { genre } = req.query;
  // fetchFirstPage: responds with page 1 immediately, remaining pages load in background
  const channels = await fetchFirstPage('itv', 'get_ordered_list', { genre: genre || '0', sortby: 'number' }, 20);
  res.json(channels);
});

app.get('/api/media-library', async (req, res) => {
  const { category } = req.query;
  try {
    if (category !== undefined) {
      // fetchFirstPage: responds with page 1 immediately, remaining pages load in background
      const items = await fetchFirstPage('vod', 'get_ordered_list', { category: category || '0' }, 20);
      res.json(items);
    } else {
      if (PERSISTENT_CACHE_DATA.categories?.['movie']) {
         const cached = PERSISTENT_CACHE_DATA.categories['movie'];
         if (Date.now() - cached.timestamp < 12 * 3600 * 1000) return res.json({ categories: cached.data });
      }
      const data = await portal.request('vod', 'get_categories', {}, 0, 20);
      const movieCats = (data.js || []).filter(cat => !/series|tv shows|web series|serials|shows|season|episode|natak|natok|rhymes/i.test(cat.title || cat.name || ""));
      const result = filterAndSortCategories(movieCats).map(c => ({ ...c, count: 0 }));
      if (result.length > 0) {
        if (!PERSISTENT_CACHE_DATA.categories) PERSISTENT_CACHE_DATA.categories = {};
        PERSISTENT_CACHE_DATA.categories['movie'] = { data: result, timestamp: Date.now() };
        saveCache();
      }
      res.json({ categories: result });
    }
  } catch (error) {
    if (category !== undefined) {
      res.json([]);
    } else {
      if (PERSISTENT_CACHE_DATA.categories?.['movie']) {
        return res.json({ categories: PERSISTENT_CACHE_DATA.categories['movie'].data });
      }
      res.json({ categories: [] });
    }
  }
});

app.get('/api/series-categories', async (req, res) => {
  try {
    if (PERSISTENT_CACHE_DATA.categories?.['series']) {
       const cached = PERSISTENT_CACHE_DATA.categories['series'];
       if (Date.now() - cached.timestamp < 12 * 3600 * 1000) return res.json({ categories: cached.data });
    }
    let categories = [];
    try {
      const data = await portal.request('series', 'get_categories', {}, 0, 20);
      if (data.js && Array.isArray(data.js) && data.js.length > 0) categories = data.js;
      else throw new Error();
    } catch (e) {
      const data = await portal.request('vod', 'get_categories', {}, 0, 20);
      categories = (data.js || []).filter(cat => /series|tv shows|show|serial|season|episode|web series|natak|natok/i.test(cat.title || cat.name || ""));
    }
    const result = filterAndSortCategories(categories).map(c => ({ ...c, count: 0 }));
    if (result.length > 0) {
      if (!PERSISTENT_CACHE_DATA.categories) PERSISTENT_CACHE_DATA.categories = {};
      PERSISTENT_CACHE_DATA.categories['series'] = { data: result, timestamp: Date.now() };
      saveCache();
    }
    res.json({ categories: result });
  } catch (error) {
    if (PERSISTENT_CACHE_DATA.categories?.['series']) {
      return res.json({ categories: PERSISTENT_CACHE_DATA.categories['series'].data });
    }
    res.json({ categories: [] });
  }
});

app.get('/api/series-list', async (req, res) => {
  const { category } = req.query;
  try {
    // fetchFirstPage: responds with page 1 immediately, remaining pages load in background
    const items = await fetchFirstPage('vod', 'get_ordered_list', { category: category || '0' }, 20);
    res.json({ series: items });
  } catch (error) {
    res.json({ series: [] });
  }
});

app.get('/api/series-info', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID required' });

  if (!PERSISTENT_CACHE_DATA.seriesInfo) PERSISTENT_CACHE_DATA.seriesInfo = {};
  
  const cached = PERSISTENT_CACHE_DATA.seriesInfo[id];
  if (cached && (Date.now() - cached.timestamp < 12 * 3600 * 1000)) {
     return res.json(cached.data);
  }

  try {
    const seasonsData = await portal.request('vod', 'get_ordered_list', { movie_id: id }, 0, 20);
    const seasonsRaw = seasonsData.js?.data || seasonsData.js || [];
    const seasons = [];
    for (const s of seasonsRaw) {
       const episodesData = await portal.request('vod', 'get_ordered_list', { movie_id: id, season_id: s.id }, 0, 20);
       const episodesRaw = episodesData.js?.data || episodesData.js || [];
       seasons.push({ seasonId: s.id, seasonNumber: parseInt(s.number) || (seasons.length + 1), episodes: episodesRaw.map(ep => ({
          ...ep, episodeId: ep.id, playUrl: `/api/episode-link?series_id=${id}&season_id=${s.id}&episode_id=${ep.id}`
       }))});
    }
    const responseData = { seriesId: id, seasons };
    if (seasons.length > 0 && seasons.some(s => s.episodes.length > 0)) {
      PERSISTENT_CACHE_DATA.seriesInfo[id] = { data: responseData, timestamp: Date.now() };
      saveCache();
    }
    res.json(responseData);
  } catch (error) {
    if (cached) {
      return res.json(cached.data);
    }
    res.status(500).json({ error: error.message });
  }
});

const restoreStreamId = (url, originalCmd) => {
  if (!url || typeof url !== 'string') return url;
  const matchStreamOriginal = String(originalCmd || '').match(/[?&]stream=(\d+)/);
  const matchStreamResponse = url.match(/[?&]stream=(\d+)/);
  const streamId = matchStreamResponse ? matchStreamResponse[1] : (matchStreamOriginal ? matchStreamOriginal[1] : null);
  if (streamId) {
    const restored = url.replace(/([?&]stream=)(?=&|$)/g, `$1${streamId}`);
    if (restored !== url) {
      console.log(`[STREAM_ID_RECOVERY] Restored stream ID ${streamId} in URL: ${url} -> ${restored}`);
    }
    return restored;
  }
  return url;
};

const fetchAllPagesInternal = async (type, action, initialParams = {}, provider) => {
  const allItems = [];
  let page = 1;
  const perPage = 100;
  
  while (page < 100) {
    const params = {
      ...initialParams,
      p: page,
      perpage: perPage,
      JsHttpRequest: '1-xml'
    };
    try {
      const data = await portal.request(type, action, params, 0, 10, provider);
      const items = data.js?.data || data.js || [];
      if (!Array.isArray(items) || items.length === 0) break;
      allItems.push(...items);
      if (items.length < perPage) break;
      page++;
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`[SearchIndexer] fetchAllPagesInternal failed on page ${page}:`, e.message);
      break;
    }
  }
  return allItems;
};

class SearchIndexer {
  constructor() {
    this.status = {};
    this.indexingActive = {};
  }
  
  getStatus(providerId) {
    return this.status[providerId] || { status: 'idle', progress: 0, itemsCount: 0 };
  }

  async startIndexing(provider, force = false) {
    const providerId = provider.id;
    if (this.indexingActive[providerId]) {
      console.log(`[SearchIndexer] Indexing already in progress for provider: ${provider.name}`);
      return;
    }
    
    const indexFilePath = path.join(process.cwd(), `search_index_${providerId}.json`);
    try {
      if (!force && fs.existsSync(indexFilePath)) {
        const stats = fs.statSync(indexFilePath);
        const ageHours = (Date.now() - stats.mtimeMs) / (3600 * 1000);
        if (ageHours < 6) {
          console.log(`[SearchIndexer] Index is fresh (${ageHours.toFixed(1)}h old). Skipping indexing.`);
          const data = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
          this.status[providerId] = { status: 'complete', progress: 100, itemsCount: data.length };
          return;
        }
      }
    } catch (e) {
      console.warn(`[SearchIndexer] Failed to check cached index:`, e.message);
    }

    this.indexingActive[providerId] = true;
    this.status[providerId] = { status: 'indexing', progress: 0, itemsCount: 0 };
    console.log(`SEARCH_INDEX_START`, { providerName: provider.name });

    setTimeout(async () => {
      try {
        // --- STEALTH INDEXING MODIFICATION ---
        // Add a random startup delay to avoid synchronized bot patterns
        const startupDelay = Math.floor(Math.random() * 5000) + 2000;
        await new Promise(r => setTimeout(r, startupDelay));
        
        await this._runIndexing(provider);
      } catch (err) {
        console.error(`[SearchIndexer] Indexing failed:`, err.message);
        this.status[providerId] = { status: 'failed', error: err.message, progress: 0, itemsCount: 0 };
      } finally {
        this.indexingActive[providerId] = false;
      }
    }, 0);
  }

  async _runIndexing(provider) {
    const providerId = provider.id;
    const items = [];
    
    // Increased delay from 100ms -> 2000ms + Randomness for stealth
    const stealthDelay = async (factor = 1) => {
        const ms = (Math.floor(Math.random() * 1500) + 1500) * factor; // 1.5s to 3s delay
        await new Promise(r => setTimeout(r, ms));
    };

    const updateProgress = (progress) => {
      this.status[providerId] = { status: 'indexing', progress: Math.min(99, Math.round(progress)), itemsCount: items.length };
      console.log(`SEARCH_INDEX_ITEMS`, { count: items.length, progress: Math.round(progress) });
    };

    try {
      // 1. Fetch Live Categories
      const liveCatsData = await portal.request('itv', 'get_genres', {}, 0, 10, provider);
      const liveCats = filterAndSortCategories(liveCatsData.js || []);
      
      // 2. Fetch Live Channels
      let liveIndex = 0;
      for (const cat of liveCats) {
        const catId = cat.id;
        const catName = cat.title || cat.name || "";
        
        // Use custom internal fetcher with stealth delay
        const chData = await this._fetchAllPagesStealth('itv', 'get_ordered_list', { genre: catId, sortby: 'number' }, provider, stealthDelay);
        
        for (const ch of chData) {
          items.push({
            id: String(ch.id),
            title: ch.name || "",
            type: 'live',
            category: catName,
            poster: ch.logo || "",
            cmd: ch.cmd || "",
            providerId,
            searchableText: `${ch.name} ${catName} live channel tv`.toLowerCase()
          });
        }
        liveIndex++;
        updateProgress((liveIndex / (liveCats.length + 2)) * 30);
        await stealthDelay(2); // Longer delay between categories
      }

      // 3. Fetch VOD Categories
      const vodCatsData = await portal.request('vod', 'get_categories', {}, 0, 10, provider);
      const vodCats = filterAndSortCategories(vodCatsData.js || []);
      
      const movieCats = vodCats.filter(cat => !/series|tv shows|show|serial|season|episode|web series|natak|natok/i.test(cat.title || cat.name || ""));
      const seriesCats = vodCats.filter(cat => /series|tv shows|show|serial|season|episode|web series|natak|natok/i.test(cat.title || cat.name || ""));

      // 4. Fetch Movies
      let movieIndex = 0;
      for (const cat of movieCats) {
        const catId = cat.id;
        const catName = cat.title || cat.name || "";
        const movieData = await this._fetchAllPagesStealth('vod', 'get_ordered_list', { category: catId }, provider, stealthDelay);
        for (const m of movieData) {
          items.push({
            id: String(m.id),
            title: m.name || "",
            type: 'movie',
            category: catName,
            poster: m.screenshot_uri || m.poster || "",
            cmd: m.cmd || "",
            providerId,
            searchableText: `${m.name} ${catName} movie film`.toLowerCase()
          });
        }
        movieIndex++;
        updateProgress(30 + (movieIndex / (movieCats.length + 1)) * 35);
        await stealthDelay(2);
      }

      // 5. Fetch Series (No deep episode crawling during search for stealth)
      let seriesIndex = 0;
      for (const cat of seriesCats) {
        const catId = cat.id;
        const catName = cat.title || cat.name || "";
        const seriesData = await this._fetchAllPagesStealth('vod', 'get_ordered_list', { category: catId }, provider, stealthDelay);
        
        for (const s of seriesData) {
          items.push({
            id: String(s.id),
            title: s.name || "",
            type: 'series',
            category: catName,
            poster: s.screenshot_uri || s.poster || "",
            cmd: s.cmd || "",
            providerId,
            searchableText: `${s.name} ${catName} series tvshow season`.toLowerCase()
          });
        }
        seriesIndex++;
        updateProgress(65 + (seriesIndex / (seriesCats.length + 1)) * 34);
        await stealthDelay(2);
      }

      const indexFilePath = path.join(process.cwd(), `search_index_${providerId}.json`);
      fs.writeFileSync(indexFilePath, JSON.stringify(items));
      this.status[providerId] = { status: 'complete', progress: 100, itemsCount: items.length };
      console.log(`SEARCH_INDEX_COMPLETE`, { providerName: provider.name, count: items.length });

    } catch (err) {
      throw err;
    }
  }

  async _fetchAllPagesStealth(type, action, initialParams, provider, stealthDelay) {
    const allItems = [];
    let page = 1;
    const perPage = 100;
    
    while (page < 20) { // Limit to 20 pages for stealth
      const params = { ...initialParams, p: page, perpage: perPage, JsHttpRequest: '1-xml' };
      const data = await portal.request(type, action, params, 0, 10, provider);
      const items = data.js?.data || data.js || [];
      if (!Array.isArray(items) || items.length === 0) break;
      allItems.push(...items);
      if (items.length < perPage) break;
      page++;
      await stealthDelay();
    }
    return allItems;
  }
}

const searchIndexer = new SearchIndexer();

setInterval(() => {
  const provider = providerManager.getActiveProvider();
  if (provider) {
    searchIndexer.startIndexing(provider, false);
  }
}, 3600 * 1000);

app.get('/api/search/status', (req, res) => {
  const provider = providerManager.getActiveProvider();
  if (!provider) return res.json({ status: 'idle', progress: 0, itemsCount: 0 });
  res.json(searchIndexer.getStatus(provider.id));
});

app.post('/api/search/trigger', (req, res) => {
  const provider = providerManager.getActiveProvider();
  if (!provider) return res.status(400).json({ error: 'No active provider' });
  const force = req.query.force === 'true';
  searchIndexer.startIndexing(provider, force);
  res.json({ success: true });
});

app.get('/api/search/index', (req, res) => {
  const provider = providerManager.getActiveProvider();
  if (!provider) return res.json([]);
  const indexFilePath = path.join(process.cwd(), `search_index_${provider.id}.json`);
  if (fs.existsSync(indexFilePath)) {
    console.log(`SEARCH_CACHE_HIT`, { providerName: provider.name });
    res.setHeader('Content-Type', 'application/json');
    fs.createReadStream(indexFilePath).pipe(res);
  } else {
    res.json([]);
  }
});

app.get('/api/create-link', async (req, res) => {
  const { cmd, type, movie_id } = req.query;
  console.log(`AUDIT: CREATE_LINK_START`, { type, movie_id, cmd });
  const provider = providerManager.getActiveProvider();
  const providerId = provider ? provider.id : '';
  try {
    const params = { ...req.query, forced_storage: 0 };
    delete params.type;
    
    if (type === 'vod' && movie_id) {
       let fileId = movie_id;
       let isSeries = false;
       let resolvedCmd = null;

       const isLocalCmd = (c) => {
         if (typeof c !== 'string') return false;
         return c.trim().length > 0;
       };

       // 0. Check playback resolution cache (avoids repeated drill-down API calls)
       if (!PERSISTENT_CACHE_DATA.vodResolution) PERSISTENT_CACHE_DATA.vodResolution = {};
       const cachedResolution = PERSISTENT_CACHE_DATA.vodResolution[movie_id];
       if (cachedResolution && (Date.now() - cachedResolution.timestamp < 6 * 3600 * 1000)) {
         console.log(`AUDIT: RESOLUTION_CACHE_HIT`, { movie_id, fileId: cachedResolution.fileId, isSeries: cachedResolution.isSeries });
         fileId = cachedResolution.fileId;
         isSeries = cachedResolution.isSeries;
         resolvedCmd = cachedResolution.cmd || null;
       } else {
         // 1. Check VOD list cache for quick cmd lookup
         const cachedVod = findCachedVod(movie_id);
         if (cachedVod) {
           if (isSeriesItem(cachedVod)) isSeries = true;
           if (isLocalCmd(cachedVod.cmd)) resolvedCmd = cachedVod.cmd;
         }

         // 2. Resolve VOD items (Seasons / Episodes / Collection / Plain movie)
         try {
           const meta = await portal.request('vod', 'get_ordered_list', { movie_id }, 0, 100);
           const metaRaw = meta?.js?.data || meta?.js || [];
           console.log(`AUDIT: VOD_META_FETCHED`, { movie_id, count: metaRaw.length });

           if (metaRaw.length > 0) {
             let targetItem = metaRaw.find(item => String(item.id) === String(movie_id));
             if (!targetItem) {
               targetItem = metaRaw[0];
             }
             const firstItem = targetItem;
             console.log("AUDIT: VOD_FIRST_ITEM", { id: firstItem.id, name: firstItem.name, is_series: firstItem.is_series, is_season: firstItem.is_season, season_series: firstItem.season_series, is_episode: firstItem.is_episode, season_id: firstItem.season_id, series: firstItem.series, cmd: firstItem.cmd });

             if (firstItem.is_season || firstItem.season_series) {
               // It's a season container — fetch its episodes
               isSeries = true;
               const epsData = await portal.request('vod', 'get_ordered_list', { movie_id, season_id: firstItem.id }, 0, 100);
               const epsRaw = epsData.js?.data || epsData.js || [];
               const firstEp = epsRaw[0] || {};
               if (firstEp.id) {
                 fileId = firstEp.id;
                 if (isLocalCmd(firstEp.cmd)) resolvedCmd = firstEp.cmd;
               }
             } else if (firstItem.is_episode || firstItem.season_id) {
               // Direct episode — play as series episode
               isSeries = true;
               fileId = firstItem.id;
               if (isLocalCmd(firstItem.cmd)) resolvedCmd = firstItem.cmd;
             } else if (isSeriesItem(firstItem)) {
               // Could be true series container OR a collection folder — drill one level to find out
               const childData = await portal.request('vod', 'get_ordered_list', { movie_id: firstItem.id }, 0, 100);
               const childRaw = childData.js?.data || childData.js || [];
               const hasSeasonEpisodeChildren = childRaw.length > 0 &&
                 (childRaw[0].is_season || childRaw[0].season_series || childRaw[0].is_episode || childRaw[0].season_id);

               if (hasSeasonEpisodeChildren) {
                 // True series — drill to first episode
                 isSeries = true;
                 const firstSeason = childRaw[0];
                 const epsData = await portal.request('vod', 'get_ordered_list', { movie_id: firstItem.id, season_id: firstSeason.id }, 0, 100);
                 const epsRaw = epsData.js?.data || epsData.js || [];
                 const firstEp = epsRaw[0] || {};
                 if (firstEp.id) {
                   fileId = firstEp.id;
                   if (isLocalCmd(firstEp.cmd)) resolvedCmd = firstEp.cmd;
                 }
               } else {
                 // Collection folder — children are plain movies, play as regular VOD (no series flag)
                 console.log('AUDIT: COLLECTION_FOLDER_DETECTED', { parentId: movie_id, childId: firstItem.id });
                 isSeries = false;
                 fileId = firstItem.id;
                 if (isLocalCmd(firstItem.cmd)) resolvedCmd = firstItem.cmd;
               }
             } else {
               // Simple VOD movie or collection child — play directly as movie
               fileId = firstItem.id;
               if (isLocalCmd(firstItem.cmd)) resolvedCmd = firstItem.cmd;
             }
           }
         } catch (metaErr) {
           console.warn("VOD metadata fetch failed, falling back to series info cache", metaErr.message);
           // 3. Fallback to Series Info Cache
           if (isSeries) {
             const cachedInfo = PERSISTENT_CACHE_DATA.seriesInfo?.[movie_id]?.data;
             if (cachedInfo?.seasons?.length > 0) {
               const firstSeason = cachedInfo.seasons[0];
               if (firstSeason.episodes?.length > 0) {
                 const firstEp = firstSeason.episodes[0];
                 fileId = firstEp.episodeId || firstEp.id;
                 if (isLocalCmd(firstEp.cmd)) resolvedCmd = firstEp.cmd;
               }
             }
           }
         }
       } // end resolution cache miss block

        // 4. Construct command
        let finalCmd = params.cmd;
        if (fileId && String(fileId) !== String(movie_id)) {
          // If we resolved to a child movie/episode ID, override finalCmd to play the child, not the parent collection folder
          finalCmd = resolvedCmd || `/media/file_${fileId}.mpg`;
        } else if (!finalCmd || finalCmd.startsWith('http') || (resolvedCmd && resolvedCmd.startsWith('http') && !finalCmd)) {
          finalCmd = resolvedCmd || `/media/file_${fileId}.mpg`;
        }
        
        if (finalCmd && !finalCmd.startsWith('/') && !finalCmd.startsWith('http') && !finalCmd.startsWith('ffrt') && !finalCmd.startsWith('ey')) {
          finalCmd = `/media/${finalCmd}`;
        }

        // Build exhaustive list of (cmd, series, movie_id) permutations to try
        const tryCreateLink = async (cmd, seriesFlag, useMovieId) => {
          const lp = {
            cmd,
            series: seriesFlag ? '1' : '',
            forced_storage: 0,
            disable_vclub_load_balance: 1,
            disable_ad: '0',
            download: '0',
            force_ch_link_check: '0',
            JsHttpRequest: '1-xml'
          };
          if (useMovieId) {
            lp.movie_id = useMovieId;
          }
          console.log(`AUDIT: CALLING_CREATE_LINK`, { cmd, seriesFlag, movie_id: useMovieId });
          const d = await portal.request('vod', 'create_link', lp, 0, 100);
          const u = d.js?.cmd || d.cmd || (typeof d.js === 'string' ? d.js : '') || '';
          return { url: u, error: d.js?.error || d.error || '' };
        };

        const rawAttempts = [];

        // 1. Child target commands (prioritize resolvedCmd from portal DB!)
        const childCmds = [];
        if (resolvedCmd) {
          childCmds.push(resolvedCmd);
        }
        childCmds.push(`/media/file_${fileId}.mpg`);
        childCmds.push(`/media/${fileId}.mpg`);
        if (params.cmd && String(fileId) === String(movie_id)) {
          let cCmd = params.cmd;
          if (!cCmd.startsWith('/') && !cCmd.startsWith('http') && !cCmd.startsWith('ffrt') && !cCmd.startsWith('ey')) {
            cCmd = `/media/${cCmd}`;
          }
          childCmds.push(cCmd);
        }

        const uniqueChildCmds = [...new Set(childCmds)];

        for (const c of uniqueChildCmds) {
          rawAttempts.push({ cmd: c, seriesFlag: isSeries, useMovieId: undefined });
          rawAttempts.push({ cmd: c, seriesFlag: isSeries, useMovieId: fileId });
          if (movie_id && String(movie_id) !== String(fileId)) {
            rawAttempts.push({ cmd: c, seriesFlag: isSeries, useMovieId: movie_id });
          }
          rawAttempts.push({ cmd: c, seriesFlag: !isSeries, useMovieId: undefined });
          rawAttempts.push({ cmd: c, seriesFlag: !isSeries, useMovieId: fileId });
          if (movie_id && String(movie_id) !== String(fileId)) {
            rawAttempts.push({ cmd: c, seriesFlag: !isSeries, useMovieId: movie_id });
          }
        }

        // 2. Parent target commands (as fallback)
        if (movie_id && String(movie_id) !== String(fileId)) {
          const parentCmds = [
            `/media/file_${movie_id}.mpg`,
            `/media/${movie_id}.mpg`
          ];
          for (const c of parentCmds) {
            rawAttempts.push({ cmd: c, seriesFlag: false, useMovieId: undefined });
            rawAttempts.push({ cmd: c, seriesFlag: false, useMovieId: movie_id });
            rawAttempts.push({ cmd: c, seriesFlag: true,  useMovieId: undefined });
            rawAttempts.push({ cmd: c, seriesFlag: true,  useMovieId: movie_id });
          }
        }

        // 3. Localhost patterns
        rawAttempts.push({ cmd: `ffrt http://localhost/vod/${fileId}`, seriesFlag: true,  useMovieId: undefined });
        rawAttempts.push({ cmd: `ffrt http://localhost/vod/${fileId}`, seriesFlag: false, useMovieId: undefined });
        if (movie_id && String(movie_id) !== String(fileId)) {
          rawAttempts.push({ cmd: `ffrt http://localhost/vod/${movie_id}`, seriesFlag: true,  useMovieId: undefined });
          rawAttempts.push({ cmd: `ffrt http://localhost/vod/${movie_id}`, seriesFlag: false, useMovieId: undefined });
        }

        if (resolvedCmd && resolvedCmd.startsWith('http')) {
           rawAttempts.push({ cmd: resolvedCmd, seriesFlag: isSeries, useMovieId: undefined });
        }

        // Deduplicate attempts
        const attempts = [];
        const seen = new Set();
        for (const att of rawAttempts) {
          const key = `${att.cmd}|${att.seriesFlag}|${att.useMovieId || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            attempts.push(att);
          }
        }

       let directUrlFallback = null;
       let directUrlAttempt = null;

       for (const attempt of attempts) {
         const result = await tryCreateLink(attempt.cmd, attempt.seriesFlag, attempt.useMovieId);
         
         if (result.url && result.url.length > 0) {
            const restoredUrl = restoreStreamId(result.url, attempt.cmd || params.cmd);
            PERSISTENT_CACHE_DATA.vodResolution[movie_id] = { fileId, isSeries: attempt.seriesFlag, cmd: attempt.cmd, timestamp: Date.now() };
            saveCache();
            return res.json({ url: `/api/proxy-stream?url=${encodeURIComponent(restoredUrl.replace(/^(ffrt|auto|ffmpeg)\s+/, ''))}${providerId ? `&providerId=${providerId}` : ''}&type=vod&movie_id=${encodeURIComponent(movie_id || '')}` });
         }

         if (attempt.cmd.startsWith('http') && !attempt.cmd.includes('localhost') && !directUrlFallback) {
            directUrlFallback = attempt.cmd;
            directUrlAttempt = attempt;
         }

         if (result.error && (result.error.includes('Authorization') || result.error.includes('MAC_NOT_AUTHORIZED'))) {
           console.warn(`AUDIT: CONTINUE_VOD_ATTEMPTS_ON_AUTH_FAILURE_RESTRICTION`, { error: result.error });
         }
       }

       if (directUrlFallback) {
          console.log("AUDIT: TRYING_DIRECT_URL_BYPASS", { url: directUrlFallback });
          const restoredFallback = restoreStreamId(directUrlFallback, directUrlAttempt?.cmd || params.cmd);
          PERSISTENT_CACHE_DATA.vodResolution[movie_id] = { fileId, isSeries: directUrlAttempt.seriesFlag, cmd: null, timestamp: Date.now() };
          saveCache();
          return res.json({ url: `/api/proxy-stream?url=${encodeURIComponent(restoredFallback.replace(/^(ffrt|auto|ffmpeg)\s+/, ''))}${providerId ? `&providerId=${providerId}` : ''}&type=vod&movie_id=${encodeURIComponent(movie_id || '')}` });
       }

       throw new Error('nothing_to_play');
    }

    // Removed REWRITING_ITV_CMD_FOR_PORTAL logic to restore native portal command path
    
    let data = await portal.request(type || 'itv', 'create_link', params, 0, 100);
    console.log(`CREATE_LINK_RAW_RESPONSE`, { data });

    let url = data.js?.cmd || data.cmd || data.js || '';
    if (typeof url !== 'string') throw new Error(data.js?.error || data.error || 'Link fault');

    // Force re-authorization if we detect an expired session (indicated by missing stream ID when original had it)
    const originalCmd = req.query.cmd || '';
    const matchStreamOriginal = String(originalCmd).match(/[?&]stream=(\d+)/);
    const matchStreamResponse = String(url).match(/[?&]stream=(\d+)/);
    
    if (matchStreamOriginal && !matchStreamResponse) {
       console.warn("AUDIT: DETECTED_EXPIRED_SESSION_IN_CREATE_LINK (stream ID missing). Re-authorizing and retrying...");
       await portal.authorize(true, 100, 'create-link-expired-session', provider);
       
       data = await portal.request(type || 'itv', 'create_link', params, 0, 100);
       console.log(`CREATE_LINK_RETRY_RAW_RESPONSE`, { data });
       
       url = data.js?.cmd || data.cmd || data.js || '';
       if (typeof url !== 'string') throw new Error(data.js?.error || data.error || 'Link fault');
    }
    
    console.log(`PLAYBACK_URL_STAGE_1_CREATE_LINK_RESPONSE`, { url });

    // Ensure we don't lose the stream ID if it was in the original request but missing in the response
    const restoredUrl = restoreStreamId(url, originalCmd);
    
    let finalProxyUrl = restoredUrl ? `/api/proxy-stream?url=${encodeURIComponent(restoredUrl.replace(/^(ffrt|auto|ffmpeg)\s+/, ''))}${providerId ? `&providerId=${providerId}` : ''}&type=${encodeURIComponent(type || 'itv')}&cmd=${encodeURIComponent(originalCmd || '')}` : '';

    console.log("PROXY_STREAM_FINAL_URL", { finalProxyUrl });

    res.json({ url: finalProxyUrl });
  } catch (error) { 
    console.error(`AUDIT: CREATE_LINK_FAILED`, error.message);
    res.json({ url: '', error: error.message }); 
  }
});

app.get('/api/episode-link', async (req, res) => {
  const { series_id, season_id, episode_id } = req.query;
  const provider = providerManager.getActiveProvider();
  const providerId = provider ? provider.id : '';
  try {
    // FIX: Fast-path — if this episode's cmd was already resolved successfully, replay it
    // immediately without running all attempts again.
    if (!PERSISTENT_CACHE_DATA.vodResolution) PERSISTENT_CACHE_DATA.vodResolution = {};
    const cachedResolution = PERSISTENT_CACHE_DATA.vodResolution[episode_id];
    if (cachedResolution && (Date.now() - cachedResolution.timestamp < 6 * 3600 * 1000) && cachedResolution.cmd) {
      console.log(`AUDIT: EPISODE_RESOLUTION_CACHE_HIT`, { episode_id, cmd: cachedResolution.cmd });
      const lp = {
        cmd: cachedResolution.cmd,
        series: cachedResolution.isSeries ? 1 : 0,
        forced_storage: 0,
        disable_vclub_load_balance: 1,
        JsHttpRequest: '1-xml',
        movie_id: series_id,
        season_id
      };
      const d = await portal.request('vod', 'create_link', lp, 0, 100);
      const fastUrl = d.js?.cmd || d.cmd || (typeof d.js === 'string' ? d.js : '');
      if (fastUrl) {
        const restoredUrl = restoreStreamId(fastUrl, cachedResolution.cmd);
        return res.json({ ok: true, url: `/api/proxy-stream?url=${encodeURIComponent(restoredUrl.replace(/^(ffrt|auto|ffmpeg)\s+/, ''))}${providerId ? `&providerId=${providerId}` : ''}&type=episode&series_id=${encodeURIComponent(series_id || '')}&season_id=${encodeURIComponent(season_id || '')}&episode_id=${encodeURIComponent(episode_id || '')}` });
      }
      // Fast-path failed — fall through to full resolution below
      console.warn('AUDIT: EPISODE_RESOLUTION_CACHE_STALE, re-resolving', { episode_id });
      delete PERSISTENT_CACHE_DATA.vodResolution[episode_id];
    }

    let fileId = null;
    let ep = null;

    // Step 1: Fetch metadata from portal to get actual File ID (primary working pattern)
    try {
       console.log(`AUDIT: EPISODE_METADATA_FETCH_START`, { series_id, season_id, episode_id });
       const data = await portal.request("vod", "get_ordered_list", {
         movie_id: series_id,
         season_id,
         episode_id
       }, 0, 100);
       const epData = data?.js?.data?.[0] || data?.js?.[0] || data?.js || {};
       if (epData.id) {
          ep = epData;
          fileId = epData.id;
          console.log(`AUDIT: EPISODE_METADATA_FETCH_SUCCESS`, { fileId });
       }
    } catch (e) {
       console.warn(`AUDIT: EPISODE_METADATA_FETCH_FAILED`, e.message);
    }

    // Attempt 1: Local cache lookup (from series-info cache) if metadata fetch missed
    if (!fileId) {
      const cachedInfo = PERSISTENT_CACHE_DATA.seriesInfo?.[series_id]?.data;
      if (cachedInfo && Array.isArray(cachedInfo.seasons)) {
         const season = cachedInfo.seasons.find(s => String(s.seasonId) === String(season_id));
         if (season && Array.isArray(season.episodes)) {
            ep = season.episodes.find(e => String(e.id) === String(episode_id) || String(e.episodeId) === String(episode_id));
            if (ep) {
               fileId = ep.id;
               console.log(`AUDIT: EPISODE_CACHE_HIT`, { series_id, season_id, episode_id, fileId });
            }
         }
      }
    }

    // Attempt 2: General list fallback if still no fileId
    if (!fileId) {
       console.log(`AUDIT: EPISODE_CACHE_MISS`, { series_id, season_id, episode_id });
       let epList = [];
       try {
         const data = await portal.request("vod", "get_ordered_list", { movie_id: series_id, season_id }, 0, 100);
         const rawData = data?.js?.data || data?.js || [];
         epList = Array.isArray(rawData) ? rawData : [];
       } catch (e) { /* ignore */ }
       if (epList.length === 0 && season_id) {
         try {
           const data2 = await portal.request("vod", "get_ordered_list", { movie_id: season_id }, 0, 100);
           const rawData2 = data2?.js?.data || data2?.js || [];
           epList = Array.isArray(rawData2) ? rawData2 : [];
         } catch (e) { /* ignore */ }
       }
       if (Array.isArray(epList) && epList.length > 0) {
          ep = epList.find(item => String(item.id) === String(episode_id)) || epList[0] || {};
          fileId = ep.id;
       }
    }

    if (!fileId) throw new Error("Episode ID missing from metadata list");

    const tryCreateLink = async (cmd, seriesFlag, extraParams = {}) => {
      const lp = {
        cmd,
        series: seriesFlag ? 1 : 0,
        forced_storage: 0,
        disable_vclub_load_balance: 1,
        disable_ad: '0',
        download: '0',
        force_ch_link_check: '0',
        JsHttpRequest: '1-xml',
        ...extraParams
      };
      console.log(`AUDIT: CALLING_EPISODE_CREATE_LINK`, { cmd, seriesFlag, extraParams });
      const d = await portal.request('vod', 'create_link', lp, 0, 100);
      const u = d.js?.cmd || d.cmd || (typeof d.js === 'string' ? d.js : '') || '';
      return { url: u, error: d.js?.error || d.error || '' };
    };

    const rawAttempts = [];
    
    // 1. Direct working pattern (highest priority: ep.cmd from portal DB!)
    const childCmds = [];
    if (ep && ep.cmd && typeof ep.cmd === 'string' && ep.cmd.trim() !== '') {
      let cmd1 = ep.cmd;
      if (!cmd1.startsWith('/') && !cmd1.startsWith('http') && !cmd1.startsWith('ffrt') && !cmd1.startsWith('ey')) {
        cmd1 = `/media/${cmd1}`;
      }
      childCmds.push(cmd1);
    }
    childCmds.push(`/media/file_${fileId}.mpg`);
    childCmds.push(`/media/${fileId}.mpg`);
    const uniqueChildCmds = [...new Set(childCmds)];

    for (const c of uniqueChildCmds) {
      rawAttempts.push({ cmd: c, seriesFlag: true,  extraParams: {} });
      rawAttempts.push({ cmd: c, seriesFlag: true,  extraParams: { movie_id: series_id } });
      rawAttempts.push({ cmd: c, seriesFlag: true,  extraParams: { movie_id: series_id, season_id } });
      rawAttempts.push({ cmd: c, seriesFlag: false, extraParams: {} });
      rawAttempts.push({ cmd: c, seriesFlag: false, extraParams: { movie_id: series_id } });
      rawAttempts.push({ cmd: c, seriesFlag: false, extraParams: { movie_id: series_id, season_id } });
    }

    // Deduplicate
    const attempts = [];
    const seen = new Set();
    for (const att of rawAttempts) {
      const paramKeys = Object.keys(att.extraParams).sort().map(k => `${k}:${att.extraParams[k]}`).join(',');
      const key = `${att.cmd}|${att.seriesFlag}|${paramKeys}`;
      if (!seen.has(key)) {
        seen.add(key);
        attempts.push(att);
      }
    }

    let directUrlFallback = null;
    let directUrlAttempt = null;

    for (const attempt of attempts) {
      const result = await tryCreateLink(attempt.cmd, attempt.seriesFlag, attempt.extraParams);
      
      if (result.url && result.url.length > 0) {
        const restoredUrl = restoreStreamId(result.url, attempt.cmd);
        if (!PERSISTENT_CACHE_DATA.vodResolution) PERSISTENT_CACHE_DATA.vodResolution = {};
        PERSISTENT_CACHE_DATA.vodResolution[episode_id] = { fileId: fileId, isSeries: attempt.seriesFlag, cmd: attempt.cmd, timestamp: Date.now() };
        saveCache();
        return res.json({ ok: true, url: `/api/proxy-stream?url=${encodeURIComponent(restoredUrl.replace(/^(ffrt|auto|ffmpeg)\s+/, ''))}${providerId ? `&providerId=${providerId}` : ''}&type=episode&series_id=${encodeURIComponent(series_id || '')}&season_id=${encodeURIComponent(season_id || '')}&episode_id=${encodeURIComponent(episode_id || '')}` });
      }

      if (attempt.cmd.startsWith('http') && !attempt.cmd.includes('localhost') && !directUrlFallback) {
        directUrlFallback = attempt.cmd;
        directUrlAttempt = attempt;
      }

      if (result.error && (result.error.includes('Authorization') || result.error.includes('MAC_NOT_AUTHORIZED'))) {
        console.warn(`AUDIT: CONTINUE_EPISODE_ATTEMPTS_ON_AUTH_FAILURE_RESTRICTION`, { error: result.error });
      }
    }

    if (directUrlFallback) {
      console.log("AUDIT: TRYING_DIRECT_URL_BYPASS_EPISODE", { url: directUrlFallback });
      const restoredFallback = restoreStreamId(directUrlFallback, directUrlAttempt?.cmd);
      if (!PERSISTENT_CACHE_DATA.vodResolution) PERSISTENT_CACHE_DATA.vodResolution = {};
      PERSISTENT_CACHE_DATA.vodResolution[episode_id] = { fileId: fileId, isSeries: directUrlAttempt.seriesFlag, cmd: null, timestamp: Date.now() };
      saveCache();
      return res.json({ ok: true, url: `/api/proxy-stream?url=${encodeURIComponent(restoredFallback.replace(/^(ffrt|auto|ffmpeg)\s+/, ''))}${providerId ? `&providerId=${providerId}` : ''}&type=episode&series_id=${encodeURIComponent(series_id || '')}&season_id=${encodeURIComponent(season_id || '')}&episode_id=${encodeURIComponent(episode_id || '')}` });
    }

    throw new Error('nothing_to_play');
  } catch (error) { 
    console.error("AUDIT: EPISODE_LINK_FAILED", error.message);
    res.json({ ok: false, url: '', error: error.message }); 
  }
});

app.get('/api/epg', async (req, res) => {
  const { ch_id, action = 'get_epg_info' } = req.query;
  if (!ch_id) return res.json([]);
  
  if (!PERSISTENT_CACHE_DATA.epg) PERSISTENT_CACHE_DATA.epg = {};
  
  const cacheKey = `${ch_id}:${action}`;
  const cached = PERSISTENT_CACHE_DATA.epg[cacheKey];
  if (cached && (Date.now() - cached.timestamp < 2 * 3600 * 1000)) {
     return res.json(cached.data);
  }

  try {
    const data = await portal.request('itv', action, { ch_id }, 0, 10);
    const result = data.js || data || [];
    if (result.length > 0 || (result && !Array.isArray(result))) {
      PERSISTENT_CACHE_DATA.epg[cacheKey] = { data: result, timestamp: Date.now() };
      saveCache();
    }
    res.json(result);
  } catch (error) {
    if (cached) return res.json(cached.data);
    res.json([]);
  }
});

app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('URL required');
  try {
    const provider = providerManager.getActiveProvider();
    const headers = {};
    if (provider) {
      const mac = provider.MAC || '';
      headers['User-Agent'] = provider.STB_USER_AGENT || 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
      headers['Cookie'] = `mac=${mac}; stb_lang=en; timezone=Asia/Kolkata;`;
      headers['X-STB-MAC'] = mac;
    }

    const response = await axios({
      method: 'get',
      url: imageUrl,
      headers: headers,
      responseType: 'stream',
      timeout: 15000,
      validateStatus: false
    });

    if (response.status >= 400) {
      return res.status(response.status).send(`Upstream image error: ${response.status}`);
    }

    res.status(response.status);
    if (response.headers['content-type']) res.set('Content-Type', response.headers['content-type']);
    if (response.headers['content-length']) res.set('Content-Length', response.headers['content-length']);
    
    // Set cache control for images
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours

    await streamPipeline(response.data, res);
  } catch (error) {
    if (!res.headersSent) res.status(500).send(error.message);
  }
});

app.get('/api/movie-collection/:collectionId', async (req, res) => {
  const { collectionId } = req.params;
  try {
    // Strategy 1: Try series-info (works for collection-type series like HOLLYWOOD SUPERSTARS)
    // These are is_series=1 items where children are episodes from a single season
    let movies = [];
    try {
      const info = await portal.request('vod', 'get_ordered_list', { movie_id: collectionId }, 0, 100);
      const seasonsRaw = info?.js?.data || info?.js || [];
      if (Array.isArray(seasonsRaw) && seasonsRaw.length > 0) {
        const firstSeason = seasonsRaw[0];
        // Check if children are episodes (season-based collection)
        if (firstSeason.is_season || firstSeason.season_series || firstSeason.season_id !== undefined) {
          // Fetch episodes from the first (and usually only) season
          const epsData = await portal.request('vod', 'get_ordered_list', { movie_id: collectionId, season_id: firstSeason.id }, 0, 100);
          const epsRaw = epsData?.js?.data || epsData?.js || [];
          if (Array.isArray(epsRaw) && epsRaw.length > 0) {
            // Map episodes to movie-like objects for the UI
            movies = epsRaw.map(ep => ({
              ...ep,
              // Tag so the UI knows to play via episode-link with series/season context
              _collectionSeriesId: collectionId,
              _collectionSeasonId: firstSeason.id,
              _isCollectionEpisode: true
            }));
            console.log(`AUDIT: MOVIE_COLLECTION_EPISODES`, { collectionId, seasonId: firstSeason.id, count: movies.length });
          }
        } else {
          // Children are plain movies (simple folder)
          movies = seasonsRaw;
          console.log(`AUDIT: MOVIE_COLLECTION_PLAIN`, { collectionId, count: movies.length });
        }
      }
    } catch (e) {
      console.warn('MOVIE_COLLECTION_SERIES_INFO_FAILED', e.message);
    }

    // Strategy 2: Category fallback
    if (movies.length === 0) {
      const items = await fetchAll('vod', 'get_ordered_list', { category: collectionId }, 20);
      if (items && items.length > 0) movies = items;
    }

    res.json({ movies });
  } catch (error) { 
    console.error('MOVIE_COLLECTION_FAILED', { collectionId, error: error.message });
    res.json({ movies: [] }); 
  }
});

const findProviderForUrl = (streamUrl, providerIdParam = null) => {
  if (providerIdParam) {
     const prov = providerManager.data.providers.find(p => String(p.id) === String(providerIdParam));
     if (prov) return prov;
  }
  if (!streamUrl) return null;
  const decoded = decodeURIComponent(streamUrl).toLowerCase();
  
  // 1. Extract MAC address from query parameter if present
  const macMatch = decoded.match(/mac=([0-9a-f:]{17})/i);
  if (macMatch) {
     const matchedMac = macMatch[1].toUpperCase();
     const prov = providerManager.data.providers.find(p => p.MAC?.toUpperCase() === matchedMac);
     if (prov) return prov;
  }

  // 2. Extract host from streamUrl
  try {
     const urlObj = new URL(streamUrl);
     const host = urlObj.hostname.toLowerCase();
     
     // 3. Match against PORTAL_URL host
     for (const p of providerManager.data.providers) {
        if (!p.PORTAL_URL) continue;
        try {
           const portalHost = new URL(p.PORTAL_URL).hostname.toLowerCase();
           if (host === portalHost || host.endsWith('.' + portalHost) || portalHost.endsWith('.' + host)) {
              return p;
           }
        } catch(e){}
     }
     
     // 4. Hardcoded patterns for subdomains/CDNs of known providers
     if (host.includes('ssltv.net')) {
        const active = providerManager.getActiveProvider();
        if (active && (active.name?.toUpperCase() === 'JIOTV' || active.name?.toUpperCase() === 'ZONTV')) {
           return active;
        }
        return providerManager.data.providers.find(p => p.name?.toUpperCase() === 'ZONTV');
     }
     if (host.includes('airtel') || host.includes('airtel4k')) {
        return providerManager.data.providers.find(p => p.name?.toUpperCase() === 'AIRTEL');
     }
     if (host.includes('sbhgoldpro')) {
        return providerManager.data.providers.find(p => p.name?.toUpperCase() === 'SBH');
     }
     if (host.includes('jiotv')) {
        return providerManager.data.providers.find(p => p.name?.toUpperCase() === 'JIOTV');
     }
  } catch (e) {}

  // Fallback to active provider
  return providerManager.getActiveProvider();
};

app.get('/api/proxy-stream', async (req, res) => {
  let streamUrl = req.query.url;
  if (!streamUrl) return res.status(400).send('URL required');
  
  try {
    const provider = findProviderForUrl(streamUrl, req.query.providerId || req.query.provider);
    const providerId = provider ? provider.id : null;
    let usedToken = (providerId && portal.tokens[providerId]) || (provider ? await portal.authorize(false, 15, 'proxy-stream', provider) : null);
    
    const tryFetch = async (headers, useTokenInUrl) => {
      let finalUrl = streamUrl;
      const hasTokenParam = /[?&]token=/.test(finalUrl);
      if (useTokenInUrl && !hasTokenParam && usedToken) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `token=${usedToken}`;
      }

      const currentAgent = portal.getAgent(provider);

      // BRIDGE VIDEO STREAM THROUGH CLOUDFLARE WORKER FOR STRICT PROVIDERS
      // Only bridge if we DON'T have a VPN. VPN is always better than a Bridge.
      const name = (provider?.name || '').toUpperCase();
      if (!vpnAgent && (name.includes('JIO') || name.includes('AIRTEL') || finalUrl.includes('jiotv') || finalUrl.includes('airtel'))) {
          console.log(`[STREAM_BRIDGE] Routing ${name} stream through Cloudflare Worker`);
          finalUrl = `${CLOUDFLARE_WORKER_URL}?url=${encodeURIComponent(finalUrl)}`;
      }

      console.log(`PLAYBACK_URL_STAGE_2_PROXY_REQUEST_URL`, { url: finalUrl, agent: currentAgent === vpnAgent ? 'INDIAN_VPN' : (currentAgent ? 'WARP' : 'DIRECT') });
      
      const resp = await axios({ 
        method: 'get', 
        url: finalUrl, 
        headers: headers, 
        responseType: 'stream', 
        timeout: 15000, 
        validateStatus: false,
        ...(currentAgent ? { httpsAgent: currentAgent === vpnAgent ? vpnHttpsAgent : currentAgent, httpAgent: currentAgent } : {})
      });

      console.log(`PLAYBACK_URL_STAGE_3_PROXY_RESPONSE_STATUS`, { status: resp.status });
      return resp;
    };

    // --- STRATEGY: Header Preservation Audit ---
    // Mandatory headers for STB CDNs: X-STB-MAC, Cookie (mac=), Referer, Origin
    const baseStbHeaders = getHeaders({ token: usedToken, isCdn: true }, provider);
    
    // Attempt 1: Standard STB headers
    let response = await tryFetch(baseStbHeaders, false);

    // Immediate re-auth if first attempt fails with auth error (401/403/458)
    if ((response.status === 403 || response.status === 401 || response.status === 458) && provider) {
       console.log("AUDIT: TRIGGERING_PROACTIVE_REAUTH_ON_PROXY_FAILURE", { status: response.status, providerName: provider.name });
       const newToken = await portal.authorize(true, 20, 'proxy-failure-auth', provider);
       usedToken = newToken;

       // If we have original request parameters to regenerate a fresh play token, do it!
       const reqType = req.query.type;
       if (reqType) {
         console.log(`[PROXY_REGEN] Attempting to regenerate fresh link for type: ${reqType}`);
         let regenUrl = '';
         try {
           if (reqType === 'episode') {
             const { series_id, season_id, episode_id } = req.query;
             const regenRes = await axios.get(`http://localhost:${PORT}/api/episode-link`, {
               params: { series_id, season_id, episode_id },
               timeout: 15000
             });
             if (regenRes.data && regenRes.data.ok && regenRes.data.url) {
               regenUrl = regenRes.data.url;
             }
           } else if (reqType === 'vod') {
             const { movie_id } = req.query;
             const regenRes = await axios.get(`http://localhost:${PORT}/api/create-link`, {
               params: { type: 'vod', movie_id },
               timeout: 15000
             });
             if (regenRes.data && regenRes.data.url) {
               regenUrl = regenRes.data.url;
             }
           } else if (reqType === 'itv') {
             const { cmd: originalCmd } = req.query;
             const regenRes = await axios.get(`http://localhost:${PORT}/api/create-link`, {
               params: { type: 'itv', cmd: originalCmd },
               timeout: 15000
             });
             if (regenRes.data && regenRes.data.url) {
               regenUrl = regenRes.data.url;
             }
           }

           if (regenUrl) {
             const parsedRegen = new URL(regenUrl, `http://localhost:${PORT}`);
             const freshStreamUrl = parsedRegen.searchParams.get('url');
             if (freshStreamUrl) {
               console.log(`[PROXY_REGEN] Successfully regenerated fresh stream URL: ${freshStreamUrl}`);
               streamUrl = freshStreamUrl;
             }
           }
         } catch (regenErr) {
           console.error('[PROXY_REGEN] Error regenerating fresh link:', regenErr.message);
         }
       }

       const freshHeaders = getHeaders({ token: newToken, isCdn: true }, provider);
       response = await tryFetch(freshHeaders, false);
    }

    // Attempt 2: Standard STB headers WITH token in URL
    if (response.status === 403 || response.status === 401 || response.status === 458) {
      console.warn(`AUDIT: PROXY_STREAM_AUTH_FAIL_TRYING_WITH_TOKEN`, { status: response.status });
      response = await tryFetch(baseStbHeaders, true);
    }

    // Attempt 3: Bare MAG User-Agent (No MAC, No Cookie, No Referer)
    const magUA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
    if (response.status === 403 || response.status === 401 || response.status === 458) {
       console.warn(`AUDIT: PROXY_STREAM_AUTH_FAIL_TRYING_BARE_MAG_UA`, { status: response.status });
       const bareMagHeaders = { 'User-Agent': (provider && provider.STB_USER_AGENT) || magUA };
       response = await tryFetch(bareMagHeaders, false);
    }

    // Attempt 4: Rotate UA to Chrome, but PRESERVE STB IDENTITY (MAC, Cookies, Referer)
    if (response.status === 403 || response.status === 401 || response.status === 458) {
      console.warn(`AUDIT: PROXY_STREAM_AUTH_FAIL_TRYING_CHROME_UA_PRESERVE_STB`, { status: response.status });
      const chromeStbHeaders = { 
        ...baseStbHeaders,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      };
      response = await tryFetch(chromeStbHeaders, false);
    }
    
    // Attempt 5: Last resort — Bare minimum Chrome headers
    if (response.status === 403 || response.status === 401 || response.status === 458) {
       console.warn(`AUDIT: PROXY_STREAM_AUTH_FAIL_TRYING_BARE`, { status: response.status });
       const bareHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' };
       response = await tryFetch(bareHeaders, false);
    }

    if (response.status >= 400) {
       console.error(`AUDIT: PROXY_STREAM_FINAL_FAILURE`, { status: response.status });
       return res.status(response.status).send(`Upstream: ${response.status}`);
    }

    const contentType = response.headers['content-type'] || '';
    res.status(response.status);
    res.set('Content-Type', contentType);
    ['content-length', 'accept-ranges', 'content-range', 'cache-control'].forEach(h => { if(response.headers[h]) res.set(h, response.headers[h]); });

    if (contentType.includes('mpegurl') || streamUrl.split('?')[0].toLowerCase().endsWith('.m3u8')) {
      let content = '';
      for await (const chunk of response.data) content += chunk.toString();
      const pId = req.query.providerId || req.query.provider;
      const rewritten = content.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const parentUrl = new URL(response.request?.res?.responseUrl || streamUrl);
          const abs = new URL(trimmed, parentUrl);
          if (!abs.search && parentUrl.search) {
             abs.search = parentUrl.search;
          }
          return `/api/proxy-stream?url=${encodeURIComponent(abs.href)}${pId ? `&providerId=${pId}` : ''}`;
        } catch(e) { return line; }
      }).join('\n');
      res.send(rewritten);
    } else { await streamPipeline(response.data, res); }
  } catch (error) { 
    if (error.message === 'aborted' || error.code === 'ECONNRESET' || error.code === 'EPIPE') {
      console.log(`AUDIT: PROXY_STREAM_CLIENT_DISCONNECTED`, { error: error.message || error.code });
    } else {
      console.error(`AUDIT: PROXY_STREAM_CRITICAL_ERROR`, error.message);
      if (!res.headersSent) res.status(500).send(error.message); 
    }
  }
});

app.listen(PORT, () => console.log(`POOMANI BACKEND PROXY RUNNING ON PORT ${PORT}`));
