import React, { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { ChevronRight, Play, ArrowLeft, Star, Tag, User, Calendar } from 'lucide-react';
import { resolveImageUrl } from '../utils/imageResolver';
import StalkerService from '../services/stalker';

const SeriesTile = React.memo(({ item, index, isFocused, onClick, activeProvider }) => {
  const img = resolveImageUrl(item, activeProvider);
  const tileRef = useRef(null);

  useEffect(() => {
    if (isFocused && tileRef.current) {
      tileRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isFocused]);

  return (
    <div
      ref={tileRef}
      onClick={onClick}
      className={clsx(
        "aspect-[2/3] rounded-2xl overflow-hidden transition-all border-4 relative shadow-2xl glass bg-black/60",
        isFocused ? "border-white scale-110 shadow-focus z-20" : "border-transparent opacity-50 grayscale-[20%]"
      )}
    >
      {img ? <img src={img} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center p-4 text-center font-black text-white/20 italic">{item.name}</div>}
      <div className={clsx("absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent transition-opacity", isFocused ? "opacity-100" : "opacity-0")} />
      {isFocused && (
          <div className="absolute bottom-5 left-5 right-5">
             <p className="text-lg font-black text-white leading-tight truncate">{item.name}</p>
             <p className="text-[9px] font-bold text-accent uppercase tracking-widest mt-1">Press OK to Browse</p>
          </div>
      )}
    </div>
  );
}, (prev, next) => prev.item.id === next.item.id && prev.isFocused === next.isFocused);

const SeriesGrid = ({ 
  categories = [],
  series = [], 
  onSelectSeries, 
  onSelectEpisode,
  onSelectCategory,
  activeCategoryId,
  focusedCategoryIndex,
  focusedSeriesIndex,
  focusedSeasonIndex,
  focusedEpisodeIndex,
  activeSeries,
  seasons = [],
  episodes = [],
  activeSeasonId,
  isCategoryFocused,
  navZone,
  contentSubZone,
  activeProvider,
  metadataCache = {},
  setEnrichedData
}) => {
  const categoryRefs = useRef([]);
  const seriesRefs = useRef([]);
  const seasonRefs = useRef([]);
  const episodeRefs = useRef([]);

  const safeSeries = Array.isArray(series) ? series : [];

  useEffect(() => {
    if (isCategoryFocused && categoryRefs.current[focusedCategoryIndex]) {
      categoryRefs.current[focusedCategoryIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedCategoryIndex, isCategoryFocused]);

  useEffect(() => {
    if (navZone === 'content' && seriesRefs.current[focusedSeriesIndex]) {
      seriesRefs.current[focusedSeriesIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
      
      const item = safeSeries[focusedSeriesIndex];
      if (item && !metadataCache[item.id]) {
         console.log("SERIES_RAW", item);
         StalkerService.getSeriesInfo(item.id).then(info => {
            console.log("SERIES_INFO", info);
            if (info) {
               setEnrichedData(item.id, info);
            }
         }).catch(err => console.warn('[SeriesGrid] Failed to enrich series', item.id, err));
      }
    }
  }, [focusedSeriesIndex, navZone, safeSeries, metadataCache, setEnrichedData]);

  useEffect(() => {
    if (navZone === 'details' && contentSubZone === 'seasons' && seasonRefs.current[focusedSeasonIndex]) {
      seasonRefs.current[focusedSeasonIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedSeasonIndex, navZone, contentSubZone]);

  useEffect(() => {
    if (navZone === 'details' && contentSubZone === 'episodes' && episodeRefs.current[focusedEpisodeIndex]) {
      episodeRefs.current[focusedEpisodeIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [focusedEpisodeIndex, navZone, contentSubZone]);

  const baseActiveSeries = activeSeries;
  const currentSeries = baseActiveSeries 
    ? (metadataCache[baseActiveSeries.id] || baseActiveSeries) 
    : (navZone === 'content' ? (metadataCache[safeSeries[focusedSeriesIndex]?.id] || safeSeries[focusedSeriesIndex]) : null);
  
  console.log("SERIES_ENRICHED", currentSeries);
  console.log("SEASON_OBJECT", seasons?.[0]);

  // --- SCREEN 1: GRID VIEW ---
  if (navZone !== 'details') {
    return (
      <div className="view-container flex pl-0 overflow-hidden h-full bg-black/20">
        <div className="w-[320px] bg-[#0d0d0d] border-r border-white/[0.07] flex flex-col z-30 shadow-[4px_0_30px_rgba(0,0,0,0.6)] shrink-0">

          {/* Header */}
          <div className="px-6 pt-10 pb-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-3 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-400"></span>
              </span>
              <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">Series</h2>
            </div>
            <p className="text-[10px] font-black text-accent uppercase tracking-[5px] opacity-80 pl-[22px]">Library</p>
          </div>

          {/* Category list */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar py-4 px-4">
            <div className="flex flex-col gap-2 pb-20">
              {categories.map((cat, index) => {
                const isActive = activeCategoryId === cat.id;
                const isFocused = isCategoryFocused && focusedCategoryIndex === index;
                return (
                  <div
                    key={cat.id}
                    ref={el => categoryRefs.current[index] = el}
                    onClick={() => { if (typeof onSelectCategory === "function") onSelectCategory(cat.id); }}
                    className={clsx(
                      "py-5 px-5 rounded-2xl transition-all duration-200 cursor-pointer flex items-center justify-between gap-4 relative overflow-hidden select-none",
                      isFocused
                        ? "bg-white shadow-[0_0_30px_rgba(0,204,255,0.25)] z-10 scale-[1.03]"
                        : isActive
                        ? "bg-accent/[0.12] border border-accent/30"
                        : "bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.07]"
                    )}
                  >
                    {isFocused && (
                      <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-accent rounded-r-full shadow-[0_0_12px_rgba(0,204,255,0.9)]" />
                    )}
                    {isActive && !isFocused && (
                      <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-accent/70 rounded-r-full" />
                    )}

                    <span className={clsx(
                      "font-black text-xl tracking-tight truncate uppercase leading-tight flex-1 pl-1",
                      isFocused ? "text-black" : isActive ? "text-white" : "text-white/65"
                    )}>
                      {cat.name || cat.title}
                    </span>

                    {isActive && !isFocused && (
                      <span className="w-2 h-2 rounded-full bg-accent shrink-0 shadow-[0_0_8px_rgba(0,204,255,0.8)]" />
                    )}

                    {isFocused && (
                      <svg className="w-5 h-5 text-black shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer hint */}
          <div className="px-6 py-4 border-t border-white/[0.04]">
            <p className="text-[9px] font-black uppercase tracking-[4px] text-white/15 text-center">UP / DOWN Navigate  ·  OK Select</p>
          </div>
        </div>

        <div className="flex-1 bg-white/[0.02] pt-16 px-12 overflow-y-auto custom-scrollbar">
           <div className="mb-10">
             <p className="text-[10px] font-black text-white/30 uppercase tracking-[4px]">{safeSeries.length} Titles Available</p>
           </div>
           <div className="grid grid-cols-6 gap-6 pb-40">
              {safeSeries.map((item, index) => {
                const isFocused = navZone === 'content' && focusedSeriesIndex === index;
                return (
                  <SeriesTile
                    key={item.id}
                    item={item}
                    index={index}
                    isFocused={isFocused}
                    onClick={() => onSelectSeries(item)}
                    activeProvider={activeProvider}
                  />
                );
              })}
           </div>
        </div>
      </div>
    );
  }

  // --- SCREEN 2: DETAILS DRILL-DOWN ---
  const backdropUrl = resolveImageUrl(currentSeries, activeProvider);
  const description = currentSeries?.description || currentSeries?.descr || "No description available.";

  return (
    <div className="view-container flex flex-col overflow-hidden h-full bg-black animate-in fade-in zoom-in-95 duration-300">
       <div className="absolute inset-0 z-0 pointer-events-none">
          {backdropUrl && (
             <>
                <img src={backdropUrl} className="w-full h-full object-cover opacity-20" alt="" />
                <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-bg-primary" />
             </>
          )}
       </div>

       <div className="relative z-10 p-16 pb-8 flex items-center gap-6 text-white/40">
          <div className="p-3 glass rounded-xl"><ArrowLeft size={24}/></div>
          <span className="text-sm font-black uppercase tracking-[4px]">Press BACK to return to Library</span>
       </div>

       <div className="relative z-10 px-24 flex gap-20 h-full overflow-hidden pb-10">
          <div className="w-[400px] flex flex-col">
             <div className="w-full aspect-[2/3] glass rounded-3xl overflow-hidden shadow-2xl mb-8 border border-white/10 relative">
                {backdropUrl ? <img src={backdropUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-black/40"/>}
                {(currentSeries?.rating_imdb || currentSeries?.rating) && (
                   <div className="absolute top-4 left-4 bg-yellow-400/90 text-black px-3 py-1 rounded-lg font-black text-sm shadow-xl flex items-center gap-1">
                      ★ {currentSeries.rating_imdb || currentSeries.rating}
                   </div>
                )}
             </div>
             <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-tight text-white mb-4 drop-shadow-2xl">{currentSeries?.name}</h1>
             
             <div className="flex flex-wrap items-center gap-3 text-[10px] font-black text-white/50 tracking-[2px] uppercase mb-4">
                <span className="flex items-center gap-1.5"><Calendar size={12} className="text-accent" /> {currentSeries?.year || 'Series'}</span>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-accent flex items-center gap-1.5"><Tag size={12} /> {currentSeries?.genres_str || currentSeries?.genre || 'Drama'}</span>
                {currentSeries?.age && (
                   <>
                      <div className="w-1 h-1 rounded-full bg-white/20" />
                      <span className="border border-white/20 px-2 rounded">{currentSeries.age}</span>
                   </>
                )}
             </div>

             <p className="text-white/70 font-medium italic line-clamp-6 leading-relaxed text-lg mb-6">
                "{description}"
             </p>

             {(currentSeries?.director || currentSeries?.actors || currentSeries?.cast) && (
                <div className="flex flex-col gap-1 text-[11px] font-bold text-white/40 tracking-wider uppercase">
                   {currentSeries.director && <p><span className="text-white/20 mr-2">Director:</span> {currentSeries.director}</p>}
                   {(currentSeries.actors || currentSeries.cast) && <p className="line-clamp-2 flex items-center gap-2"><User size={12} className="text-accent" /> {currentSeries.actors || currentSeries.cast}</p>}
                </div>
             )}
          </div>

          <div className="flex-1 flex gap-10">
             <div className="w-[180px] flex flex-col border-r border-white/10 pr-6">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[4px] mb-8">Seasons</p>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                   {seasons.map((sn, index) => {
                      const isActive = activeSeasonId === sn.seasonId;
                      const isFocused = contentSubZone === 'seasons' && focusedSeasonIndex === index;
                      return (
                         <div 
                           key={sn.seasonId}
                           ref={el => seasonRefs.current[index] = el}
                           className={clsx(
                              "p-5 rounded-2xl font-black text-xl transition-all border-2 text-center",
                              isFocused ? "bg-white text-black border-white scale-110 shadow-focus" : (isActive ? "bg-accent text-white border-accent" : "bg-white/5 text-white/40 border-transparent opacity-60")
                           )}
                         >
                            Season {sn.number || index + 1}
                         </div>
                      );
                   })}
                </div>
             </div>

             <div className="flex-1 flex flex-col pl-4">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[4px] mb-8">{episodes.length} Episodes</p>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-10 pb-20">
                   <div className="flex flex-col gap-4">
                      {episodes.map((ep, index) => {
                          const isFocused = contentSubZone === 'episodes' && focusedEpisodeIndex === index;
                          return (
                            <div
                              key={ep.id}
                              ref={el => episodeRefs.current[index] = el}
                              className={clsx(
                                "p-6 rounded-3xl border-2 transition-all flex items-center justify-between",
                                isFocused ? "bg-white border-white scale-[1.02] shadow-focus text-black" : "glass border-white/5 text-white opacity-80"
                              )}
                            >
                               <div className="flex items-center gap-6">
                                  <div className={clsx("text-3xl font-black italic opacity-30 w-12 text-center", isFocused ? "text-black" : "text-white")}>
                                     {index + 1}
                                  </div>
                                  <div>
                                     <h4 className="text-xl font-black tracking-tight mb-1">{ep.name || ep.series_name || `Episode ${index + 1}`}</h4>
                                     <p className={clsx("text-xs font-bold uppercase tracking-widest", isFocused ? "text-black/50" : "text-white/40")}>Press OK to Play</p>
                                  </div>
                               </div>
                               <div className={clsx("p-4 rounded-2xl", isFocused ? "bg-accent text-white" : "bg-white/10")}>
                                  <Play size={24} fill="currentColor" />
                               </div>
                            </div>
                          );
                      })}
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};

export default React.memo(SeriesGrid);
