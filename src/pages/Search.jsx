import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search as SearchIcon, RefreshCw, X, Play, Info, Layers, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import SearchService from '../services/search';
import Keyboard from '../components/Keyboard';
import { resolveImageUrl } from '../utils/imageResolver';
import { useNavigation } from '../contexts/NavigationContext';

const Search = ({ activeProvider, onPlay, onSelectSeries }) => {
  const { navZone, setNavZone } = useNavigation();

  // Search query states
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ live: [], movie: [], series: [], episode: [] });
  const [totalCount, setTotalCount] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Indexing status states
  const [indexingStatus, setIndexingStatus] = useState({ status: 'idle', progress: 0, itemsCount: 0 });
  const [isSyncing, setIsSyncing] = useState(false);

  // Focus Navigation states
  const [focusedRowIndex, setFocusedRowIndex] = useState(0); // 0 = Input row, 1+ = Results rows
  const [focusedColIndex, setFocusedColIndex] = useState(0);

  const containerRef = useRef(null);
  const rowRefs = useRef({});

  // Dynamic Row Mapping based on results
  const getActiveRows = useCallback(() => {
    const activeRows = [{ type: 'input', id: 'input' }];
    if (results.live?.length > 0) activeRows.push({ type: 'results', id: 'live', title: 'LIVE TV', items: results.live });
    if (results.movie?.length > 0) activeRows.push({ type: 'results', id: 'movie', title: 'MOVIES', items: results.movie });
    if (results.series?.length > 0) activeRows.push({ type: 'results', id: 'series', title: 'SERIES', items: results.series });
    if (results.episode?.length > 0) activeRows.push({ type: 'results', id: 'episode', title: 'EPISODES', items: results.episode });
    return activeRows;
  }, [results]);

  const activeRows = getActiveRows();

  // Load the initial search index for active provider
  useEffect(() => {
    if (activeProvider?.id) {
      SearchService.loadIndex(activeProvider.id).then(() => {
        // Run empty search to update index cache engine references
        handleSearch(query);
      });
    }
  }, [activeProvider, query]);

  // Indexing Status Sync/Polling
  useEffect(() => {
    let interval = null;

    const checkStatus = async () => {
      if (!activeProvider?.id) return;
      const status = await SearchService.getStatus();
      setIndexingStatus(status);

      if (status.status === 'indexing') {
        if (!interval) {
          interval = setInterval(async () => {
            const nextStatus = await SearchService.getStatus();
            setIndexingStatus(nextStatus);
            if (nextStatus.status !== 'indexing') {
              clearInterval(interval);
              interval = null;
              // reload index upon completion
              await SearchService.loadIndex(activeProvider.id);
              handleSearch(query);
            }
          }, 3000);
        }
      }
    };

    checkStatus();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeProvider, query]);

  // Execute Local Search
  const handleSearch = useCallback((val) => {
    const searchRes = SearchService.search(val);
    setResults(searchRes.results);
    setTotalCount(searchRes.totalCount);
    setSearchTime(searchRes.timeMs);
  }, []);

  // Debounced search trigger (150ms)
  const debounceTimerRef = useRef(null);
  const onQueryChange = useCallback((newQuery) => {
    setQuery(newQuery);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      handleSearch(newQuery);
    }, 1500); // Corrected by useEffect below to 150ms
  }, [handleSearch]);

  // Correcting debounce to 150ms
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      handleSearch(query);
    }, 150);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, handleSearch]);

  // Trigger Re-indexing manually
  const triggerReindexing = async () => {
    if (isSyncing || indexingStatus.status === 'indexing') return;
    setIsSyncing(true);
    try {
      await SearchService.triggerIndexing(true);
      const status = await SearchService.getStatus();
      setIndexingStatus(status);
    } catch (e) {
      console.error('Trigger indexing failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Scroll focused element into view
  useEffect(() => {
    if (focusedRowIndex > 0) {
      const row = rowRefs.current[focusedRowIndex];
      const itemEl = row?.querySelector(`[data-index="${focusedColIndex}"]`);
      if (itemEl) {
        itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    } else if (focusedRowIndex === 0 && containerRef.current) {
      // Scroll to top of search page when input focused
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [focusedRowIndex, focusedColIndex]);

  // Key Down D-pad Navigation Handler
  const handleKeyDown = useCallback((e) => {
    if (navZone !== 'content' || isKeyboardOpen) return;

    const key = e.keyCode || e.which;
    const activeRows = getActiveRows();
    const currentRow = activeRows[focusedRowIndex];

    if (key === 37) { // Left
      if (focusedRowIndex === 0) {
        // On input row
        if (focusedColIndex > 0) {
          setFocusedColIndex(p => p - 1);
        } else {
          // Go to sidebar
          setNavZone('sidebar');
        }
      } else {
        // On results rows
        if (focusedColIndex > 0) {
          setFocusedColIndex(p => p - 1);
        } else {
          // Go to sidebar
          setNavZone('sidebar');
        }
      }
    } else if (key === 39) { // Right
      if (focusedRowIndex === 0) {
        const maxCols = query ? 3 : 2; // Input, (Clear if query), Sync
        if (focusedColIndex < maxCols - 1) {
          setFocusedColIndex(p => p + 1);
        }
      } else {
        const items = currentRow.items || [];
        if (focusedColIndex < items.length - 1) {
          setFocusedColIndex(p => p + 1);
        }
      }
    } else if (key === 38) { // Up
      if (focusedRowIndex > 0) {
        const prevRowIndex = focusedRowIndex - 1;
        setFocusedRowIndex(prevRowIndex);
        // Reset column position to fit next row limit
        const prevRow = activeRows[prevRowIndex];
        if (prevRow.type === 'input') {
          setFocusedColIndex(0);
        } else {
          setFocusedColIndex(p => Math.min(p, (prevRow.items?.length || 1) - 1));
        }
      }
    } else if (key === 40) { // Down
      if (focusedRowIndex < activeRows.length - 1) {
        const nextRowIndex = focusedRowIndex + 1;
        setFocusedRowIndex(nextRowIndex);
        const nextRow = activeRows[nextRowIndex];
        setFocusedColIndex(p => Math.min(p, (nextRow.items?.length || 1) - 1));
      }
    } else if (key === 13) { // Enter / OK
      if (focusedRowIndex === 0) {
        // Input row action
        if (focusedColIndex === 0) {
          setIsKeyboardOpen(true);
        } else if (focusedColIndex === 1 && query) {
          setQuery('');
          handleSearch('');
        } else {
          triggerReindexing();
        }
      } else {
        // Results row action
        const item = currentRow.items[focusedColIndex];
        if (!item) return;

        if (item.type === 'series') {
          if (typeof onSelectSeries === 'function') {
            onSelectSeries(item);
          }
        } else {
          if (typeof onPlay === 'function') {
            onPlay(item, item.type === 'movie', item.type === 'episode');
          }
        }
      }
    } else if (key === 10009 || key === 8 || key === 27) { // Back / Escape
      e.preventDefault();
      if (query) {
        setQuery('');
        handleSearch('');
        setFocusedRowIndex(0);
        setFocusedColIndex(0);
      } else {
        setNavZone('sidebar');
      }
    }
  }, [navZone, isKeyboardOpen, focusedRowIndex, focusedColIndex, query, getActiveRows, handleSearch, onPlay, onSelectSeries, setNavZone]);

  // Hook global event listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div ref={containerRef} className="view-container flex flex-col pl-6 pr-6 pt-10 pb-10 overflow-y-auto h-full bg-black/95 select-none custom-scrollbar relative z-10">
      
      {/* Title */}
      <div className="flex items-center gap-4 mb-8">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ccff] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00ccff]"></span>
        </span>
        <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">Universal Search</h2>
      </div>

      {/* Search Input bar */}
      <div className="flex items-center gap-4 mb-6 max-w-[1200px]">
        {/* Search Input Box */}
        <div
          onClick={() => setIsKeyboardOpen(true)}
          className={clsx(
            "flex-1 flex items-center gap-4 glass px-6 py-5 rounded-2xl border transition-all duration-200 cursor-pointer",
            navZone === 'content' && focusedRowIndex === 0 && focusedColIndex === 0
              ? "border-white bg-white/10 scale-[1.01] shadow-focus"
              : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
          )}
        >
          <SearchIcon className="text-white/40 shrink-0" size={24} />
          <div className="flex-1 text-xl font-bold truncate">
            {query ? (
              <span className="text-white">{query}</span>
            ) : (
              <span className="text-white/30 font-medium">Search channels, movies, series... (Click to type)</span>
            )}
          </div>
          {query && (
            <div className="text-[10px] font-black tracking-widest text-[#00ccff] uppercase bg-[#00ccff]/10 px-2.5 py-1 rounded">
              OK TO EDIT
            </div>
          )}
        </div>

        {/* Clear Button */}
        {query && (
          <button
            onClick={() => { setQuery(''); handleSearch(''); }}
            className={clsx(
              "p-5 rounded-2xl border transition-all duration-200 shrink-0",
              navZone === 'content' && focusedRowIndex === 0 && focusedColIndex === 1
                ? "bg-red-600 text-white border-red-500 scale-105 shadow-focus"
                : "bg-white/5 text-white/60 border-white/10 hover:bg-white/[0.08]"
            )}
          >
            <X size={24} />
          </button>
        )}

        {/* Sync / Re-index Button */}
        <button
          onClick={triggerReindexing}
          className={clsx(
            "flex items-center gap-3 px-6 py-5 rounded-2xl border transition-all duration-200 shrink-0 font-black text-sm uppercase tracking-wider",
            indexingStatus.status === 'indexing' || isSyncing ? "text-yellow-500" : "text-white/80",
            navZone === 'content' && focusedRowIndex === 0 && focusedColIndex === (query ? 2 : 1)
              ? "bg-white text-black border-white scale-105 shadow-focus"
              : "bg-white/5 border-white/10 hover:bg-white/[0.08]"
          )}
        >
          {indexingStatus.status === 'indexing' || isSyncing ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <RefreshCw size={20} />
          )}
          <span>{indexingStatus.status === 'indexing' ? 'Indexing...' : 'Sync Index'}</span>
        </button>
      </div>

      {/* Index Progress Bar or Search Telemetry stats */}
      <div className="mb-10 max-w-[1200px]">
        {indexingStatus.status === 'indexing' ? (
          <div className="glass p-5 rounded-2xl border border-white/5 animate-pulse">
            <div className="flex justify-between items-center text-xs font-black tracking-widest text-white/50 mb-2 uppercase">
              <span>Background Indexing Progress</span>
              <span className="text-[#00ccff]">{indexingStatus.progress}% ({indexingStatus.itemsCount} Items)</span>
            </div>
            <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div
                style={{ width: `${indexingStatus.progress}%` }}
                className="h-full bg-gradient-to-r from-[#00ccff] to-blue-500 rounded-full transition-all duration-300"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs font-black tracking-wider text-white/30 uppercase pl-1">
            <span>Local Database search engine (zero lag)</span>
            {query && (
              <span className="text-[#00ccff]/85">
                Found {totalCount} results in {searchTime}ms
              </span>
            )}
            {!query && indexingStatus.itemsCount > 0 && (
              <span>Database ready: {indexingStatus.itemsCount.toLocaleString()} total items</span>
            )}
          </div>
        )}
      </div>

      {/* Results Groups */}
      <div className="flex flex-col gap-8 flex-1">
        {query ? (
          activeRows.slice(1).map((row, rowIndex) => {
            const isRowFocused = navZone === 'content' && focusedRowIndex === rowIndex + 1;
            
            return (
              <div
                key={row.id}
                ref={el => rowRefs.current[rowIndex + 1] = el}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center gap-2 pl-1">
                  <h3 className="text-lg font-black tracking-widest text-white/40 uppercase">
                    {row.title}
                  </h3>
                  <span className="text-xs font-black text-[#00ccff]/50 px-2 py-0.5 rounded bg-white/5">
                    {row.items?.length || 0}
                  </span>
                </div>

                <div className="flex gap-4 overflow-x-auto py-3 px-1 custom-scrollbar scroll-smooth">
                  {row.items.map((item, colIndex) => {
                    const isItemFocused = isRowFocused && focusedColIndex === colIndex;
                    const posterUrl = resolveImageUrl(item, activeProvider);
                    const isLive = item.type === 'live';
                    const isEpisode = item.type === 'episode';
                    const isSeries = item.type === 'series';

                    return (
                      <div
                        key={item.id + '_' + colIndex}
                        data-index={colIndex}
                        onClick={() => {
                          if (isSeries) {
                            onSelectSeries(item);
                          } else {
                            onPlay(item, item.type === 'movie', item.type === 'episode');
                          }
                        }}
                        className={clsx(
                          "glass shrink-0 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col bg-black/40 cursor-pointer select-none",
                          isLive && "w-[180px] h-[130px]",
                          isEpisode && "w-[240px] h-[160px]",
                          (item.type === 'movie' || isSeries) && "w-[170px] h-[255px]",
                          isItemFocused
                            ? "border-white scale-110 shadow-focus z-20"
                            : "border-white/5 opacity-55 grayscale-[15%]"
                        )}
                      >
                        {/* Poster or Channel logo */}
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={item.title}
                            className={clsx(
                              "w-full object-cover flex-1 bg-black/20",
                              isLive && "object-contain p-4"
                            )}
                          />
                        ) : (
                          <div className="flex-1 flex items-center justify-center bg-white/5 p-4 text-center">
                            <Layers className="text-white/15 mb-2 block mx-auto" size={32} />
                            <span className="text-xs font-black text-white/35 uppercase tracking-wide truncate max-w-full">
                              {item.title}
                            </span>
                          </div>
                        )}

                        {/* Title Overlay or bottom bar */}
                        {isItemFocused && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent flex flex-col justify-end p-4 animate-in fade-in duration-200">
                            <h4 className="font-black text-sm tracking-tight text-white leading-snug line-clamp-2">
                              {item.title}
                            </h4>
                            <span className="text-[9px] font-black text-[#00ccff] uppercase tracking-widest mt-1">
                              {item.category || item.type}
                            </span>
                          </div>
                        )}

                        {!isItemFocused && (
                          <div className="p-3 bg-black/40 border-t border-white/5">
                            <h4 className="font-black text-xs text-white/60 truncate uppercase tracking-tight">
                              {item.title}
                            </h4>
                          </div>
                        )}

                        {/* Play/Info indicator overlays on hover/focus */}
                        {isItemFocused && (
                          <div className="absolute top-3 right-3 bg-white text-black p-2 rounded-full shadow-lg">
                            {isSeries ? <Info size={14} strokeWidth={3} /> : <Play size={14} fill="currentColor" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-white/30 border border-white/5 rounded-3xl bg-white/[0.01]">
            <SearchIcon size={64} className="opacity-15 mb-4 text-[#00ccff]" />
            <h4 className="text-2xl font-black uppercase tracking-wider text-white/50 mb-2">Universal Search Engine</h4>
            <p className="max-w-[500px] text-sm font-medium leading-relaxed">
              Start typing to instantly query over 100,000 channels, movies, seasons, and episodes. Zero network requests, 100% local cache matching.
            </p>
          </div>
        )}
      </div>

      {/* Virtual On-Screen Keyboard */}
      {isKeyboardOpen && (
        <Keyboard
          value={query}
          label="Universal Search Input"
          onChange={onQueryChange}
          onDone={() => {
            setIsKeyboardOpen(false);
            setFocusedRowIndex(activeRows.length > 1 ? 1 : 0);
            setFocusedColIndex(0);
          }}
          onCancel={() => {
            setIsKeyboardOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default Search;
