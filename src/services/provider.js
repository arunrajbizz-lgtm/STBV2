import axios from 'axios';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/constants';
import { API_BASE_URL } from './stalker';

/**
 * Service for managing IPTV providers.
 * Syncs directly with the Node.js backend proxy.
 */
class ProviderService {
  constructor() {
    this.providers = [];
    this.activeProviderId = null;
    
    this.axios = axios.create({
      baseURL: `${API_BASE_URL}/providers`,
      timeout: 10000
    });

    this.initialized = this.syncFromServer();
  }

  async ensureInitialized() {
    return this.initialized;
  }

  async syncFromServer() {
    try {
      // Phase 9: Storage Audit - Automatic Recovery & Migration
      let localProviders = [];
      let localActiveId = null;
      try {
        localProviders = storage.get(STORAGE_KEYS.PROVIDERS, []);
        if (!Array.isArray(localProviders)) localProviders = [];
        localActiveId = storage.get(STORAGE_KEYS.ACTIVE_PROVIDER_ID, null);
      } catch (e) {
        console.error("Local storage corrupted for providers, recovering to empty state");
        localProviders = [];
        localActiveId = null;
      }

      this.providers = localProviders;
      this.activeProviderId = localActiveId;

      const response = await this.axios.get('/');
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        this.providers = response.data;
        const active = this.providers.find(p => p.active);
        this.activeProviderId = active ? active.id : null;
        
        // Cache to local storage
        storage.set(STORAGE_KEYS.PROVIDERS, this.providers);
        storage.set(STORAGE_KEYS.ACTIVE_PROVIDER_ID, this.activeProviderId);
      } else if (response.data && Array.isArray(response.data) && response.data.length === 0) {
         console.warn("Server returned empty provider list. Ignoring to prevent destructive sync.");
      }
    } catch (e) {
      console.warn("Could not sync providers from server, using local cache", e);
    }
  }

  getProviders() {
    return this.providers || [];
  }

  getActiveProvider() {
    if (!this.activeProviderId) {
      return this.providers && this.providers.length > 0 ? this.providers[0] : null;
    }
    return this.providers.find(p => p.id === this.activeProviderId) || null;
  }

  async setActiveProvider(id) {
    try {
      await this.axios.post(`/activate/${id}`);
      const now = new Date().toISOString();
      
      this.activeProviderId = id;
      this.providers = this.providers.map(p => ({
        ...p,
        active: p.id === id,
        lastUsed: p.id === id ? now : p.lastUsed
      }));
      
      storage.set(STORAGE_KEYS.PROVIDERS, this.providers);
      storage.set(STORAGE_KEYS.ACTIVE_PROVIDER_ID, this.activeProviderId);
    } catch (error) {
      console.error("setActiveProvider failed:", error);
      throw error;
    }
  }

  async updateProviderStatus(id, status) {
    try {
      const provider = this.providers.find(p => p.id === id);
      if (!provider) return;
      
      await this.axios.put(`/${id}`, { ...provider, status });
      
      this.providers = this.providers.map(p => p.id === id ? { ...p, status } : p);
      storage.set(STORAGE_KEYS.PROVIDERS, this.providers);
    } catch (error) {
      console.error("updateProviderStatus failed:", error);
    }
  }

  async addProvider(provider) {
    try {
      const isFirst = this.providers.length === 0;
      const newProviderData = { ...provider, active: isFirst };
      
      const response = await this.axios.post('/', newProviderData);
      const newProvider = response.data;
      
      this.providers.push(newProvider);
      
      if (isFirst) {
        this.activeProviderId = newProvider.id;
        storage.set(STORAGE_KEYS.ACTIVE_PROVIDER_ID, this.activeProviderId);
      }
      
      storage.set(STORAGE_KEYS.PROVIDERS, this.providers);
      return newProvider;
    } catch (error) {
      console.error("addProvider failed:", error);
      throw error;
    }
  }

  async updateProvider(id, updates) {
    try {
      const provider = this.providers.find(p => p.id === id);
      if (!provider) return;
      
      const updated = { ...provider, ...updates };
      const response = await this.axios.put(`/${id}`, updated);
      
      this.providers = this.providers.map(p => p.id === id ? response.data : p);
      storage.set(STORAGE_KEYS.PROVIDERS, this.providers);
    } catch (error) {
      console.error("updateProvider failed:", error);
      throw error;
    }
  }

  async deleteProvider(id) {
    try {
      await this.axios.delete(`/${id}`);
      
      const wasActive = this.activeProviderId === id;
      this.providers = this.providers.filter(p => p.id !== id);
      
      if (wasActive) {
        if (this.providers.length > 0) {
          const newActiveId = this.providers[0].id;
          await this.setActiveProvider(newActiveId);
        } else {
          this.activeProviderId = null;
          storage.remove(STORAGE_KEYS.ACTIVE_PROVIDER_ID);
        }
      }
      
      storage.set(STORAGE_KEYS.PROVIDERS, this.providers);
    } catch (error) {
      console.error("deleteProvider failed:", error);
      throw error;
    }
  }

  async duplicateProvider(id) {
    const original = this.providers.find(p => p.id === id);
    if (original) {
      const copy = {
        ...original,
        name: `${original.name} (Copy)`,
        active: false
      };
      delete copy.id;
      return await this.addProvider(copy);
    }
    return null;
  }

  // Phase 9: Connection Test Diagnostics
  async testConnection(providerConfig) {
    console.log(`[Provider Test] Starting diagnostics...`);
    try {
      const res = await this.axios.post('/test', providerConfig, { timeout: 30000 });
      return res.data; // { success: boolean, message: string, profile: object, error: string }
    } catch (e) {
      console.error(`[Provider Test] Failed`, e);
      return { success: false, error: e.message };
    }
  }
}

export default new ProviderService();