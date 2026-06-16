import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Search from './pages/Search';
import ChannelGrid from './components/ChannelGrid';
import MovieGrid from './components/MovieGrid';
import SeriesGrid from './components/SeriesGrid';
import CollectionBrowser from './components/CollectionBrowser';
import Player from './components/Player';
import ProviderEditor from './components/ProviderEditor';
import StalkerService from './services/stalker';
import PlayerService from './services/player';
import ProviderService from './services/provider';
import { storage } from './utils/storage';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './utils/constants';
import { useNavigation } from './contexts/NavigationContext';
import { usePlayer } from './contexts/PlayerContext';
import { clsx } from 'clsx';

const MENU_ITEMS = [
  { id: 'search', icon: 'Search', label: 'Search' },
  { id: 'home', icon: 'Home', label: 'Home' },
  { id: 'live', icon: 'Tv', label: 'Live TV' },
  { id: 'library', icon: 'Film', label: 'Series' },
  { id: 'cinema', icon: 'PlayCircle', label: 'Cinema' },
  { id: 'favorites', icon: 'Heart', label: 'Collections' },
  { id: 'settings', icon: 'Settings', label: 'Settings' },
];

const App = () => {
  // Contexts
  const { isPlaying, setIsPlaying, currentItem, setCurrentItem, playUrl, setPlayUrl } = usePlayer();
  const {
    navZone, setNavZone,
    contentSubZone, setContentSubZone,
    focusMemory, setFocusMemory,
    sidebarFocusedIndex, setSidebarFocusedIndex,
    categoryFocusedIndex, setCategoryFocusedIndex,
    contentFocusedIndex, setContentFocusedIndex,
    focusedSubIndex, setFocusedSubIndex,
    focusedSeasonIndex, setFocusedSeasonIndex,
    focusedEpisodeIndex, setFocusedEpisodeIndex
  } = useNavigation();

  // State
  const [activePage, setActivePage] = useState('home');
  const [playerEngine, setPlayerEngine] = useState(() => storage.get(STORAGE_KEYS.PLAYER_ENGINE, 'auto'));
  const [screenMode, setScreenMode] = useState(() => storage.get(STORAGE_KEYS.SYSTEM_SETTINGS, DEFAULT_SETTINGS).screenMode || 'Fit');
  const [diagnostics, setDiagnostics] = useState({ isReady: false });
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [homeSections, setHomeSections] = useState([]);
  const [providers, setProviders] = useState(() => ProviderService.getProviders());
  const [activeProvider, setActiveProvider] = useState(() => ProviderService.getActiveProvider());

  const [liveCategories, setLiveCategories] = useState([]);
  const [liveChannels, setLiveChannels] = useState([]);
  const [activeLiveCategoryId, setActiveLiveCategoryId] = useState(null);
  
  const [cinemaCategories, setCinemaCategories] = useState([]);
  const [cinemaMovies, setCinemaMovies] = useState([]);
  const [activeCinemaCategoryId, setActiveCinemaCategoryId] = useState(null);

  const [libraryCategories, setLibraryCategories] = useState([]);
  const [seriesItems, setSeriesItems] = useState([]);
  const [activeLibraryCategoryId, setActiveLibraryCategoryId] = useState(null);
  const [activeSeries, setActiveSeries] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [activeSeasonId, setActiveSeasonId] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [favorites, setFavorites] = useState(() => storage.get(STORAGE_KEYS.FAVORITES) || []);

  const [activeCollection, setActiveCollection] = useState(null);
  const [collectionMovies, setCollectionMovies] = useState([]);

  const [zapBuffer, setZapBuffer] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  
  // Refs
  const zapTimeout = useRef(null);
  const initializedRef = useRef(false);
  const syncIntervalRef = useRef(null);
  const stableCountRef = useRef(0);
  const lastSyncCountRef = useRef(0);
  
  // Resume Prompt State
  const [resumePrompt, setResumePrompt] = useState(null);
  const [toast, setToast] = useState(null);

  const lastCategoryRequestRef = useRef({});

  // Focus Enrichment Cache
  const metadataCacheRef = useRef({});

  const handleClosePlayer = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  // Callbacks
  const setEnrichedData = useCallback((id, data) => {
     metadataCacheRef.current[id] = { ...metadataCacheRef.current[id], ...data };
  }, []);

  const loadContentForCategory = useCallback(async (page, categoryId) => {
    console.log(`AUDIT: LOAD_CONTENT_START`, { page, categoryId });
    const now = Date.now();
    const lastRequest = lastCategoryRequestRef.current[`${page}:${categoryId}`];

    if (lastRequest && (now - lastRequest < 10000)) {
        console.log(`AUDIT: CONTENT_DEDUP_HIT`, { page, categoryId });
        return;
    }
    lastCategoryRequestRef.current[`${page}:${categoryId}`] = now;

    try {
      if (page === 'live') {
        setActiveLiveCategoryId(categoryId);
        if (categoryId === 'favs') {
            const favs = storage.get(STORAGE_KEYS.FAVORITES) || [];
            console.log("AUDIT: LOAD_FAVORITES", { count: favs.length });
            setLiveChannels(favs);
        } else {
            const channels = await StalkerService.getChannels(categoryId);
            console.log("AUDIT: CHANNELS_RECEIVED", { categoryId, count: channels?.length });
            setLiveChannels(channels || []);
        }
      } else if (page === 'cinema') {
        setActiveCinemaCategoryId(categoryId);
        const movies = await StalkerService.getMovies(categoryId);
        console.log("AUDIT: MOVIES_RECEIVED", { categoryId, count: movies?.length });
        setCinemaMovies(movies || []);
      } else if (page === 'library') {
        setActiveLibraryCategoryId(categoryId);
        const series = await StalkerService.getSeries(categoryId);
        console.log("AUDIT: SERIES_RECEIVED", { categoryId, count: series?.length });
        setSeriesItems(series || []);
      }
    } catch (e) {
      console.error("AUDIT: CONTENT_LOAD_FAILED", { page, categoryId, error: e.message });
    }
  }, []);

  const loadDataForPage = useCallback(async (page) => {
    try {
      setIsPageLoading(true);
      if (page === 'home') {
        const catsData = await StalkerService.fetchCached('/live-categories');
        const cats = StalkerService.sortTamilFirst(Array.isArray(catsData) ? catsData : (catsData?.data || []));
        const firstCatId = cats.length > 0 ? cats[0].id : '0';
        const [moviesRes, channelsRes] = await Promise.all([ StalkerService.getMovies(), StalkerService.getChannels(firstCatId) ]);
        setHomeSections([
          { id: 'trending', title: 'Trending Channels', items: (Array.isArray(channelsRes) ? channelsRes : []).slice(0, 10) },
          { id: 'movies', title: 'New Movies', items: (Array.isArray(moviesRes) ? moviesRes : []).slice(0, 10) },
        ]);
      } else if (page === 'live') {
        const cats = StalkerService.sortTamilFirst(await StalkerService.getLiveCategories());
        const catsWithFavs = [{ id: 'favs', title: '★ Favorites' }, ...cats];
        setLiveCategories(catsWithFavs);
        const initialCat = (cats.length > 0) ? cats[0].id : 'favs';
        if (catsWithFavs.length > 0) loadContentForCategory('live', initialCat);
      } else if (page === 'cinema') {
        const cats = StalkerService.sortTamilFirst(await StalkerService.getMovieCategories());
        setCinemaCategories(cats || []);
        if (cats && cats.length > 0) {
           loadContentForCategory('cinema', cats[0].id);
        }
      } else if (page === 'library') {
        const cats = StalkerService.sortTamilFirst(await StalkerService.getSeriesCategories());
        setLibraryCategories(cats);
        if (cats.length > 0) loadContentForCategory('library', cats[0].id);
      }
    } catch (error) {
      console.error(`Page load failed: ${page}`, error);
    } finally {
      setIsPageLoading(false);
    }
  }, [loadContentForCategory]);

  const handlePlay = async (item, isMovie = true, isSeries = false, resumePos = 0, fromCollection = false) => {
    try {
      if (!item) return;

      // COLLECTION DETECTION — skipped when already inside a collection (fromCollection=true)
      // 1. Explicit folder type
      // 2. has_files=0 with no playable cmd (true empty folder)  
      // 3. is_series="1" with multiple files (has_files > 1) — collection folders like "Arnold Schwarzenegger Collection"
      const hasPlayableCmd = item.cmd && (
        item.cmd.startsWith('http') ||
        item.cmd.startsWith('/media') ||
        item.cmd.startsWith('ffrt') ||
        item.cmd.startsWith('auto') ||
        item.cmd.startsWith('ffmpeg') ||
        item.cmd.startsWith('ey')
      );
      const isCollectionFolder = !fromCollection && isMovie && (
        item.type === 'folder' ||
        String(item.is_series) === '1' ||
        (parseInt(item.has_files) === 0 && !hasPlayableCmd)
      );
      if (isCollectionFolder) {
         setActiveCollection(item);
         setNavZone('collection');
         setContentFocusedIndex(0);
         const movies = await StalkerService.getMovieCollection(item.id);
         setCollectionMovies(movies || []);
         return;
      }

      // Collection episode playback — tagged by the server with series/season context
      if (isMovie && item._isCollectionEpisode && item._collectionSeriesId) {
         isSeries = true;
         // Re-route to series episode playback path with the collection's series/season IDs
         const url = (await StalkerService.getEpisodeLink(
           item._collectionSeriesId,
           item._collectionSeasonId,
           item.id
         ))?.url;
         if (url) {
           const normalizedItem = { ...item, type: 'movie', isLive: false };
           setCurrentItem(normalizedItem);
           setPlayUrl(url);
           setIsPlaying(true);
           if (resumePos) setTimeout(() => PlayerService.seek(resumePos), 2000);
         }
         return;
      }

      if (!resumePos && (isSeries || isMovie)) {
         const key = isSeries ? `episode_${item.id}` : `movie_${item.id}`;
         const resumeData = JSON.parse(localStorage.getItem('poomani_resume') || '{}');
         const pos = resumeData[key];
         if (pos && pos > 60000) {
            setResumePrompt({ item, isMovie, isSeries, pos });
            return;
         }
      }

      let normalizedItem = null;
      if (isPlaying) setPlayUrl(null);

      const isSeriesPlay = isSeries || item.type === 'episode';

      if (isSeriesPlay) {
         const sId = item.seriesId || activeSeries?.id;
         const seriesMeta = metadataCacheRef.current[sId] || { id: sId, name: item.category };
         normalizedItem = { 
            ...seriesMeta,
            ...item, 
            series_name: seriesMeta.name || seriesMeta.title || item.category,
            type: "episode", 
            isLive: false 
         };
      } else if (isMovie) {
         const movieMeta = metadataCacheRef.current[item.id] || item;
         normalizedItem = { ...movieMeta, type: "movie", isLive: false };
      } else {
         normalizedItem = { ...item, type: "channel", streamType: "live", isLive: true };
      }
      
      setCurrentItem(normalizedItem);
      
      let url = null;
      const itemId = item.episodeId || item.id;
      
      if (isSeriesPlay) {
         const sId = item.seriesId || activeSeries?.id;
         const snId = item.seasonId || activeSeasonId;
         url = (await StalkerService.getEpisodeLink(sId, snId, itemId))?.url;
      }
      else if (isMovie) {
         url = (await StalkerService.getMovieLink(itemId, item.cmd))?.url;
      }
      else {
         url = await StalkerService.createLink(item.cmd || item.id);
      }

      if (url) { 
         setPlayUrl(url); 
         setIsPlaying(true); 
         if (resumePos) setTimeout(() => PlayerService.seek(resumePos), 2000);
      }
    } catch (e) { console.error("Playback error", e); }
  };

  const handleSelectSeriesFromSearch = useCallback(async (seriesItem) => {
     setActivePage('library');
     setActiveSeries(seriesItem);
     setNavZone('details');
     setContentSubZone('seasons');
     setFocusedSeasonIndex(0);
     
     try {
       const res = await StalkerService.getSeriesInfo(seriesItem.id);
       const seriesSeasons = res?.seasons || [];
       setSeasons(seriesSeasons);
       if (seriesSeasons.length > 0) {
          setActiveSeasonId(seriesSeasons[0].seasonId);
          setEpisodes(seriesSeasons[0].episodes || []);
       }
     } catch (err) {
       console.error("Failed to load series info from search selection", err);
       setSeasons([]);
       setEpisodes([]);
     }
  }, [setActivePage, setActiveSeries, setNavZone, setContentSubZone, setFocusedSeasonIndex, setSeasons, setActiveSeasonId, setEpisodes]);

  const handleNextChannel = useCallback(() => {
    if (activePage === 'live') {
      const idx = liveChannels.findIndex(c => c.id === currentItem.id);
      if (idx < liveChannels.length - 1) handlePlay(liveChannels[idx + 1], false, false);
    }
  }, [activePage, liveChannels, currentItem, handlePlay]);

  const handlePrevChannel = useCallback(() => {
    if (activePage === 'live') {
      const idx = liveChannels.findIndex(c => c.id === currentItem.id);
      if (idx > 0) handlePlay(liveChannels[idx - 1], false, false);
    }
  }, [activePage, liveChannels, currentItem, handlePlay]);

  const handleToggleFavorite = useCallback((ch) => {
    if (!ch) return;
    const favs = storage.get(STORAGE_KEYS.FAVORITES) || [];
    const isFav = favs.some(f => f.id === ch.id);
    const newFavs = isFav ? favs.filter(f => f.id !== ch.id) : [...favs, ch];
    storage.set(STORAGE_KEYS.FAVORITES, newFavs);
    setFavorites(newFavs);
    window.dispatchEvent(new CustomEvent('show_toast', { detail: isFav ? 'Removed from Favorites' : 'Added to Favorites' }));
    window.dispatchEvent(new CustomEvent('favorites_updated'));
  }, []);

  const handleKeyDown = useCallback(async (e) => {
    const key = e.keyCode;
    if (showEditor) return;

    if (isPlaying) {
      if (key === 27 || key === 8 || key === 10009) {
         setIsPlaying(false);
      }
      return; 
    }

    if (activePage === 'search' && navZone === 'content') {
       return;
    }

    const colsMap = { home: 1, live: 1, cinema: 6, library: 6 };
    let cols = colsMap[activePage] || 1;
    if (navZone === 'collection') {
      cols = 5;
    }

    if (key === 27 || key === 8 || key === 10009) {
      if (navZone === 'collection') {
         setActiveCollection(null);
         setCollectionMovies([]);
         setNavZone('content');
         return;
      }
      if (navZone === 'details') { setNavZone('content'); return; }
      if (navZone === 'content') { setNavZone('category'); return; }
      if (navZone === 'category') { setNavZone('sidebar'); return; }
      return;
    }

    if (navZone === 'sidebar') {
      if (key === 38) setSidebarFocusedIndex(p => Math.max(0, p - 1));
      if (key === 40) setSidebarFocusedIndex(p => Math.min(MENU_ITEMS.length - 1, p + 1));
      if (key === 13) {
        const pageId = MENU_ITEMS[sidebarFocusedIndex].id;
        setActivePage(pageId);
        setNavZone(pageId === 'search' || pageId === 'home' || pageId === 'settings' ? 'content' : 'category');
        setCategoryFocusedIndex(0);
        setContentFocusedIndex(0);
        loadDataForPage(pageId);
      }
      if (key === 39) {
         setNavZone(activePage === 'home' || activePage === 'settings' || activePage === 'search' ? 'content' : 'category');
         if (activePage === 'home' || activePage === 'settings' || activePage === 'search') {
             const memKey = `${activePage}_home`;
             setContentFocusedIndex(focusMemory[memKey] || 0);
         }
      }
    } 
    else if (navZone === 'category') {
      const cats = activePage === 'live' ? liveCategories : activePage === 'cinema' ? cinemaCategories : libraryCategories;
      if (key === 38) setCategoryFocusedIndex(p => Math.max(0, p - 1));
      if (key === 40) setCategoryFocusedIndex(p => Math.min(cats.length - 1, p + 1));
      if (key === 37) setNavZone('sidebar');
      if (key === 39) {
         setNavZone('content');
         const catId = activePage === 'live' ? activeLiveCategoryId : activePage === 'cinema' ? activeCinemaCategoryId : activePage === 'library' ? activeLibraryCategoryId : null;
         setContentFocusedIndex(catId ? (focusMemory[`${activePage}_${catId}`] || 0) : 0);
      }
      if (key === 13) {
         if (cats[categoryFocusedIndex]) {
            loadContentForCategory(activePage, cats[categoryFocusedIndex].id);
            setNavZone('content');
            setContentFocusedIndex(focusMemory[`${activePage}_${cats[categoryFocusedIndex].id}`] || 0);
         }
      }
    } 
    else if (navZone === 'content') {
      const items = activePage === 'live' ? liveChannels : activePage === 'cinema' ? cinemaMovies : seriesItems;
      
      if (activePage === 'settings') {
        const totalProviders = providers.length;
        const isProviderRow = contentFocusedIndex < totalProviders;
        const isAddProviderRow = contentFocusedIndex === totalProviders;
        const isOptionRow = contentFocusedIndex > totalProviders;

        if (key === 38) { setContentFocusedIndex(p => Math.max(0, p - 1)); setFocusedSubIndex(0); }
        if (key === 40) { setContentFocusedIndex(p => Math.min(totalProviders + 2, p + 1)); setFocusedSubIndex(0); }
        if (key === 37) {
          if (isProviderRow) setFocusedSubIndex(p => Math.max(0, p - 1));
          else if (isOptionRow) {
             const optIdx = contentFocusedIndex - totalProviders - 1;
             if (optIdx === 0) {
                const engines = ['auto', 'html5', 'avplayer', 'hlsjs'];
                const idx = engines.indexOf(playerEngine);
                if (idx > 0) { setPlayerEngine(engines[idx - 1]); storage.set(STORAGE_KEYS.PLAYER_ENGINE, engines[idx - 1]); }
             } else if (optIdx === 1) {
                const modes = ['Fit', 'Fill', 'Stretch'];
                const idx = modes.indexOf(screenMode);
                if (idx > 0) { setScreenMode(modes[idx - 1]); storage.set(STORAGE_KEYS.SYSTEM_SETTINGS, { ...DEFAULT_SETTINGS, screenMode: modes[idx - 1] }); }
             }
          } else {
             setNavZone('sidebar');
          }
        }
        if (key === 39) {
          if (isProviderRow) setFocusedSubIndex(p => Math.min(2, p + 1));
          else if (isOptionRow) {
             const optIdx = contentFocusedIndex - totalProviders - 1;
             if (optIdx === 0) {
                const engines = ['auto', 'html5', 'avplayer', 'hlsjs'];
                const idx = engines.indexOf(playerEngine);
                if (idx < engines.length - 1) { 
                   const next = engines[idx + 1];
                   setPlayerEngine(next); 
                   storage.set(STORAGE_KEYS.PLAYER_ENGINE, next);
                }
             } else if (optIdx === 1) {
                const modes = ['Fit', 'Fill', 'Stretch'];
                const idx = modes.indexOf(screenMode);
                if (idx < modes.length - 1) { setScreenMode(modes[idx + 1]); storage.set(STORAGE_KEYS.SYSTEM_SETTINGS, { ...DEFAULT_SETTINGS, screenMode: modes[idx + 1] }); }
             }
          }
        }
        if (key === 13) {
            if (isProviderRow) {
                const provider = providers[contentFocusedIndex];
                if (focusedSubIndex === 0) { // Activate
                    if (provider.id !== activeProvider?.id) {
                        setDiagnostics({ isReady: false }); 
                        ProviderService.setActiveProvider(provider.id).then(() => {
                           setLiveCategories([]);
                           setLiveChannels([]);
                           setActiveLiveCategoryId(null);
                           setCinemaCategories([]);
                           setCinemaMovies([]);
                           setActiveCinemaCategoryId(null);
                           setLibraryCategories([]);
                           setSeriesItems([]);
                           setActiveLibraryCategoryId(null);
                           setHomeSections([]);
                           metadataCacheRef.current = {};
                           
                           StalkerService.metadataCache = {};
                           StalkerService.contentCache = {};
                           StalkerService.pending = {};
                           StalkerService._contentCache = {}; // clear 30s content cache on provider switch
                           lastCategoryRequestRef.current = {}; // BUG#1 FIX: clear dedup guard on provider switch

                           const newActive = ProviderService.getActiveProvider();
                           setActiveProvider(newActive);
                           setProviders([...ProviderService.getProviders()]);
                           
                           loadDataForPage('home').then(() => {
                              setDiagnostics({ isReady: true });
                              setNavZone('sidebar');
                              setSidebarFocusedIndex(1); 
                           });
                        }).catch(() => setDiagnostics({ isReady: true }));
                    }
                } else if (focusedSubIndex === 1) { 
                   setEditingProvider(provider);
                   setShowEditor(true);
                } else if (focusedSubIndex === 2) { 
                    if (provider.id !== activeProvider?.id) {
                        ProviderService.deleteProvider(provider.id).then(() => {
                            setProviders([...ProviderService.getProviders()]);
                            setActiveProvider(ProviderService.getActiveProvider());
                        });
                    }
                }
            } else if (isAddProviderRow) {
               setEditingProvider(null);
               setShowEditor(true);
            }
        }
        return;
      }

      if (key === 37) {
        if (contentFocusedIndex === 0) setNavZone(activePage === 'home' ? 'sidebar' : 'category');
        else setContentFocusedIndex(p => Math.max(0, p - 1));
      }
      if (key === 39) setContentFocusedIndex(p => Math.min(items.length - 1, p + 1));
      if (key === 38) {
         const nextIdx = contentFocusedIndex - cols;
         if (nextIdx >= 0) setContentFocusedIndex(nextIdx);
      }
      if (key === 40) {
         const nextIdx = contentFocusedIndex + cols;
         if (nextIdx < items.length) setContentFocusedIndex(nextIdx);
      }
      if (key === 13) {
         const item = items[contentFocusedIndex];
         if (!item) return;
         if (activePage === 'library') {
             const isRealSeries = item && (
                item.is_series === '1' || 
                item.is_series === 1 || 
                item.is_season || 
                item.season_series || 
                item.is_episode || 
                item.season_id || 
                (Array.isArray(item.series) && item.series.length > 0) || 
                (item.series && !Array.isArray(item.series))
             );

             if (!isRealSeries) {
                // Play directly as a movie
                handlePlay(item, true, false);
             } else {
                setActiveSeries(item);
                setNavZone('details');
                setContentSubZone('seasons');
                setFocusedSeasonIndex(0);
                
                StalkerService.getSeriesInfo(item.id).then(res => {
                   const seriesSeasons = res?.seasons || [];
                   setSeasons(seriesSeasons);
                   if (seriesSeasons.length > 0) {
                      setActiveSeasonId(seriesSeasons[0].seasonId);
                      setEpisodes(seriesSeasons[0].episodes || []);
                   }
                }).catch(err => {
                   console.error("Failed to load series info", err);
                   setSeasons([]);
                   setEpisodes([]);
                });
             }
         } else {
            handlePlay(item, activePage === 'cinema');
         }
      }
    }
    else if (navZone === 'collection') {
      if (key === 37) {
        setContentFocusedIndex(p => Math.max(0, p - 1));
      }
      if (key === 39) setContentFocusedIndex(p => Math.min(collectionMovies.length - 1, p + 1));
      if (key === 38) {
         const nextIdx = contentFocusedIndex - cols;
         if (nextIdx >= 0) setContentFocusedIndex(nextIdx);
      }
      if (key === 40) {
         const nextIdx = contentFocusedIndex + cols;
         if (nextIdx < collectionMovies.length) setContentFocusedIndex(nextIdx);
      }
      if (key === 13) {
         const item = collectionMovies[contentFocusedIndex];
         if (item) {
            handlePlay(item, true, false, 0, true); // fromCollection=true: skip re-detection as folder
         }
      }
    }
    else if (navZone === 'details') {
      if (key === 37) { if (contentSubZone === 'episodes') setContentSubZone('seasons'); else setNavZone('content'); }
      if (key === 39) { if (contentSubZone === 'seasons' && episodes.length > 0) setContentSubZone('episodes'); }
      if (key === 38 || key === 40) {
         if (contentSubZone === 'seasons') {
            const newIdx = key === 38 ? Math.max(0, focusedSeasonIndex - 1) : Math.min(seasons.length - 1, focusedSeasonIndex + 1);
            if (newIdx !== focusedSeasonIndex) {
               setFocusedSeasonIndex(newIdx);
               const sn = seasons[newIdx];
               if (sn) {
                  setActiveSeasonId(sn.seasonId);
                  setEpisodes(sn.episodes || []);
               }
            }
         } else {
            setFocusedEpisodeIndex(p => key === 38 ? Math.max(0, p - 1) : Math.min(episodes.length - 1, p + 1));
         }
      }
      if (key === 13) {
         if (contentSubZone === 'seasons' && seasons[focusedSeasonIndex]) {
            const sn = seasons[focusedSeasonIndex];
            setActiveSeasonId(sn.seasonId);
            setFocusedEpisodeIndex(0);
            setEpisodes(sn.episodes || []);
            setContentSubZone('episodes');
         } else if (contentSubZone === 'episodes' && episodes[focusedEpisodeIndex]) {
            handlePlay(episodes[focusedEpisodeIndex], false, true);
         }
      }
    }
  }, [navZone, contentSubZone, activePage, isPlaying, sidebarFocusedIndex, categoryFocusedIndex, contentFocusedIndex, focusedSeasonIndex, focusedEpisodeIndex, liveCategories, cinemaCategories, libraryCategories, liveChannels, cinemaMovies, seriesItems, seasons, episodes, activeSeries, activeSeasonId, loadDataForPage, loadContentForCategory, currentItem, zapBuffer, resumePrompt, focusedSubIndex, playerEngine, screenMode, providers, activeProvider, focusMemory, setFocusMemory, setIsPlaying, setCurrentItem, setPlayUrl, setPlayerEngine, setScreenMode, setActivePage, setNavZone, setContentSubZone, setSidebarFocusedIndex, setCategoryFocusedIndex, setContentFocusedIndex, setFocusedSubIndex, setFocusedSeasonIndex, setFocusedEpisodeIndex]);

  // Effects
  useEffect(() => {
    const onToast = (e) => {
       setToast(e.detail);
       setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener('show_toast', onToast);
    return () => window.removeEventListener('show_toast', onToast);
  }, []);

  useEffect(() => {
    if (typeof window.tizen !== 'undefined') {
       try {
          const keys = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
          keys.forEach(k => window.tizen.tvinputdevice.registerKey(k));
       } catch (e) {}
    }

    const onTune = (e) => {
       if (e.detail) handlePlay(e.detail, false, false);
    };
    window.addEventListener('tune_channel', onTune);
    return () => window.removeEventListener('tune_channel', onTune);
  }, [handlePlay]);

  useEffect(() => {
    const onFavUpdate = () => {
       const favs = storage.get(STORAGE_KEYS.FAVORITES) || [];
       setFavorites(favs);
       if (activePage === 'live' && activeLiveCategoryId === 'favs') {
          setLiveChannels(favs);
       }
    };
    window.addEventListener('favorites_updated', onFavUpdate);
    return () => window.removeEventListener('favorites_updated', onFavUpdate);
  }, [activePage, activeLiveCategoryId]);

  // STATE SYNCHRONIZATION LOGIC — only runs while actively browsing content lists
  // Stops during: playback, collection browsing, series details, or after 2+ consecutive errors
  useEffect(() => {
    const activeZone = navZone; // snapshot at effect run time
    const shouldSync = !isPlaying 
      && ['live', 'cinema', 'library'].includes(activePage)
      && !['collection', 'details', 'sidebar'].includes(activeZone);
    
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (!shouldSync) return;

    const currentCategoryId = 
      activePage === 'live' ? activeLiveCategoryId :
      activePage === 'cinema' ? activeCinemaCategoryId :
      activePage === 'library' ? activeLibraryCategoryId : null;

    if (!currentCategoryId || currentCategoryId === 'favs') return;

    stableCountRef.current = 0;
    const initialCount = 
      activePage === 'live' ? liveChannels.length :
      activePage === 'cinema' ? cinemaMovies.length :
      seriesItems.length;
    
    lastSyncCountRef.current = initialCount;
    let consecutiveErrors = 0;

    syncIntervalRef.current = setInterval(async () => {
      // Stop if we've entered collection/details zone since the interval started
      if (['collection', 'details'].includes(navZone)) return;

      try {
        let newData = [];
        if (activePage === 'live') newData = await StalkerService.getChannels(currentCategoryId);
        else if (activePage === 'cinema') newData = await StalkerService.getMovies(currentCategoryId);
        else if (activePage === 'library') newData = await StalkerService.getSeries(currentCategoryId);

        consecutiveErrors = 0; // reset on success
        const newCount = newData.length;
        const oldCount = lastSyncCountRef.current;

        if (newCount > oldCount) {
          if (activePage === 'live') setLiveChannels(newData);
          else if (activePage === 'cinema') setCinemaMovies(newData);
          else setSeriesItems(newData);

          lastSyncCountRef.current = newCount;
          stableCountRef.current = 0;
        } else {
          stableCountRef.current++;
          if (stableCountRef.current >= 2) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
          }
        }
      } catch (e) {
        consecutiveErrors++;
        console.warn(`Sync failed (${consecutiveErrors}/2)`, e.message);
        if (consecutiveErrors >= 2) {
          console.warn('Sync stopped after repeated errors');
          clearInterval(syncIntervalRef.current);
          syncIntervalRef.current = null;
        }
      }
    }, 15000); // 15s interval — was 5s which flooded the portal

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [activePage, navZone, activeLiveCategoryId, activeCinemaCategoryId, activeLibraryCategoryId, isPlaying, liveChannels.length, cinemaMovies.length, seriesItems.length]);


  useEffect(() => {
     if (navZone === 'content' && activePage !== 'settings') {
        const catId = activePage === 'live' ? activeLiveCategoryId : activePage === 'cinema' ? activeCinemaCategoryId : activePage === 'library' ? activeLibraryCategoryId : 'home';
        if (catId) {
           setFocusMemory(p => ({ ...p, [`${activePage}_${catId}`]: contentFocusedIndex }));
        }
     }
  }, [contentFocusedIndex, navZone, activePage, activeLiveCategoryId, activeCinemaCategoryId, activeLibraryCategoryId, setFocusMemory]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const startTime = Date.now();
      console.log("AUDIT: APP_STARTUP_INIT");
      
      ProviderService.ensureInitialized().then(() => {
        const providers = ProviderService.getProviders();
        const active = ProviderService.getActiveProvider();
        console.log("AUDIT: PROVIDERS_LOADED", { 
            count: providers.length, 
            activeId: active?.id,
            activeName: active?.name,
            duration: Date.now() - startTime 
        });
        
        setProviders(providers);
        setActiveProvider(active);
        setDiagnostics({ isReady: true });
        loadDataForPage('home');
      });
    }
  }, [loadDataForPage]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!diagnostics.isReady) return <div className="bg-black w-full h-full flex items-center justify-center text-white font-black text-2xl tracking-[10px]">INITIALIZING TV ENGINE</div>;
  
  return (
    <div className={clsx("w-full h-full relative overflow-hidden text-white font-inter transition-colors duration-500", isPlaying ? "bg-transparent" : "bg-black")}>
      {/* GLOBAL TOAST */}
      {toast && (
         <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[2000] px-8 py-4 bg-accent text-black font-black text-xl rounded-2xl shadow-focus animate-in fade-in slide-in-from-top-4 duration-300 uppercase tracking-widest">
            {toast}
         </div>
      )}

      {/* RESUME PROMPT MODAL */}
      {resumePrompt && (
         <div className="fixed inset-0 z-[1500] bg-black/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
            <div className="w-[800px] bg-[#1a1a1a] border border-white/10 rounded-[40px] p-16 shadow-2xl text-center">
               <h2 className="text-5xl font-black italic uppercase tracking-widest text-white mb-6">Resume Playback?</h2>
               <p className="text-xl text-white/50 mb-12 font-medium">We found a saved position for this title. Would you like to continue where you left off?</p>
               <div className="flex items-center justify-center gap-8">
                  <div className={clsx("px-12 py-6 rounded-2xl font-black text-2xl transition-all border-4", focusedSubIndex === 0 ? "bg-white text-black border-white scale-110 shadow-focus" : "bg-white/5 text-white/40 border-transparent")}>RESUME</div>
                  <div className={clsx("px-12 py-6 rounded-2xl font-black text-2xl transition-all border-4", focusedSubIndex === 1 ? "bg-white text-black border-white scale-110 shadow-focus" : "bg-white/5 text-white/40 border-transparent")}>START OVER</div>
               </div>
               <p className="mt-12 text-[10px] font-black text-white/20 uppercase tracking-[4px]">Use LEFT/RIGHT to select, OK to confirm</p>
            </div>
         </div>
      )}

      {zapBuffer && (
         <div className="absolute top-10 right-10 z-[1000] glass px-8 py-4 rounded-2xl border-2 border-accent shadow-[0_0_30px_rgba(0,204,255,0.4)]">
            <span className="text-6xl font-black font-mono text-white tracking-widest">{zapBuffer}</span>
         </div>
      )}
      {isPlaying ? (
        <Player 
          url={playUrl} 
          item={currentItem} 
          engine={playerEngine} 
          onClose={() => setIsPlaying(false)} 
          activeProvider={activeProvider} 
          channels={activePage === 'live' ? liveChannels : []} 
          onNext={() => { if(activePage==='live') { const idx = liveChannels.findIndex(c=>c.id===currentItem.id); if(idx < liveChannels.length-1) handlePlay(liveChannels[idx+1], false, false); } }} 
          onPrev={() => { if(activePage==='live') { const idx = liveChannels.findIndex(c=>c.id===currentItem.id); if(idx > 0) handlePlay(liveChannels[idx-1], false, false); } }} 
          onToggleFavorite={handleToggleFavorite}
          isFavorite={favorites.some(f => f.id === currentItem?.id)}
        />
      ) : (

        <>
          <Sidebar activeId={activePage} onSelect={(id) => { setActivePage(id); loadDataForPage(id); }} focusedIndex={navZone === 'sidebar' ? sidebarFocusedIndex : -1} />
          <main className="w-full h-full pl-[80px]">
            {activePage === 'home' && <Home sections={homeSections} onPlay={handlePlay} focusedRowIndex={navZone === 'content' ? 0 : -1} focusedColIndex={navZone === 'content' ? contentFocusedIndex : -1} />}
            {activePage === 'live' && <ChannelGrid categories={liveCategories} channels={liveChannels} activeCategoryId={activeLiveCategoryId} onSelectCategory={(id) => loadContentForCategory('live', id)} onSelectChannel={(ch) => handlePlay(ch, false)} onPlay={handlePlay} focusedCategoryIndex={categoryFocusedIndex} focusedChannelIndex={contentFocusedIndex} isCategoryFocused={navZone === 'category'} activeProvider={activeProvider} />}
            {activePage === 'cinema' && (
               <MovieGrid 
                  categories={cinemaCategories} 
                  movies={cinemaMovies} 
                  activeCategoryId={activeCinemaCategoryId} 
                  onSelectCategory={(id) => loadContentForCategory('cinema', id)} 
                  onSelectMovie={(mv) => handlePlay(mv, true)} 
                  focusedCategoryIndex={categoryFocusedIndex} 
                  focusedMovieIndex={contentFocusedIndex} 
                  isCategoryFocused={navZone === 'category'} 
                  activeProvider={activeProvider} 
                  metadataCache={metadataCacheRef.current} 
                  setEnrichedData={setEnrichedData} 
               />
            )}
            {activePage === 'library' && <SeriesGrid categories={libraryCategories} series={seriesItems} activeCategoryId={activeLibraryCategoryId} focusedCategoryIndex={categoryFocusedIndex} focusedSeriesIndex={contentFocusedIndex} focusedSeasonIndex={focusedSeasonIndex} focusedEpisodeIndex={focusedEpisodeIndex} activeSeries={activeSeries} seasons={seasons} episodes={episodes} activeSeasonId={activeSeasonId} isCategoryFocused={navZone === 'category'} navZone={navZone} contentSubZone={contentSubZone} activeProvider={activeProvider} metadataCache={metadataCacheRef.current} setEnrichedData={setEnrichedData} />}
            {activePage === 'search' && (
               <Search 
                  activeProvider={activeProvider} 
                  onPlay={handlePlay} 
                  onSelectSeries={handleSelectSeriesFromSearch} 
               />
            )}
            {activePage === 'settings' && <Settings providers={providers} settings={{ playerEngine, screenMode }} focusedIndex={contentFocusedIndex} focusedSubIndex={focusedSubIndex} isFocused={navZone === 'content'} activeProvider={activeProvider} />}
          </main>
        </>
      )}

      {navZone === 'collection' && activeCollection && !isPlaying && (
         <div className="fixed inset-0 z-[1000] bg-black">
            <CollectionBrowser 
               collection={activeCollection} 
               movies={collectionMovies} 
               focusedIndex={contentFocusedIndex} 
               activeProvider={activeProvider}
               onSelectMovie={(mv) => handlePlay(mv, true, false, 0, true)} // fromCollection=true: skip re-detection as folder
               onBack={() => { setActiveCollection(null); setCollectionMovies([]); setNavZone('content'); }}
            />
         </div>
      )}

      {showEditor && (
        <ProviderEditor 
          initialData={editingProvider}
          onTest={async (formData) => {
             window.dispatchEvent(new CustomEvent('show_toast', { detail: 'Testing connection...' }));
             try {
                const res = await ProviderService.testConnection(formData);
                if (res.success) {
                   window.dispatchEvent(new CustomEvent('show_toast', { detail: 'SUCCESS: ' + res.message }));
                } else {
                   window.dispatchEvent(new CustomEvent('show_toast', { detail: 'FAILED: ' + res.error }));
                }
             } catch (e) {
                window.dispatchEvent(new CustomEvent('show_toast', { detail: 'ERROR: ' + e.message }));
             }
          }}
          onSave={async (formData) => {
             try {
                if (editingProvider) {
                   await ProviderService.updateProvider(editingProvider.id, formData);
                } else {
                   await ProviderService.addProvider(formData);
                }
                setProviders([...ProviderService.getProviders()]);
                setActiveProvider(ProviderService.getActiveProvider());
                setShowEditor(false);
             } catch (e) {
                console.error("Save failed", e);
             }
          }}
          onCancel={() => {
             setShowEditor(false);
          }}
        />
      )}
    </div>
  );
};

export default App;
