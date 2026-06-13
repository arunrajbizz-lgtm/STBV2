import React, { useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { Calendar, Play, Star, Clock, Tag, User } from 'lucide-react';
import { resolveImageUrl } from '../utils/imageResolver';
import StalkerService from '../services/stalker';

const MovieTile = React.memo(({ mv, index, isFocused, onClick, activeProvider, rowHeight, cols }) => {
  const img = resolveImageUrl(mv, activeProvider);
  const row = Math.floor(index / cols);
  const col = index % cols;
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
      style={{ position: 'absolute', top: `${row * rowHeight}px`, left: `${col * 16.66}%`, width: '15.66%', height: '320px' }}
      className={clsx(
         "glass rounded-2xl border-4 transition-all duration-300 relative group overflow-hidden shadow-2xl bg-black/60",
         isFocused ? "border-white scale-110 shadow-focus z-20" : "border-transparent opacity-50 grayscale-[20%]"
      )}
    >
       {img ? (
          <img src={img} alt={mv.name} className="w-full h-full object-cover" />
       ) : (
          <div className="w-full h-full flex items-center justify-center italic text-white/10 font-black text-2xl text-center p-4">
             {mv.name}
          </div>
       )}
       {isFocused && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-5">
             <h3 className="font-black text-lg mb-1 tracking-tight truncate text-white">{mv.name}</h3>
          </div>
       )}
    </div>
  );
}, (prev, next) => prev.mv.id === next.mv.id && prev.isFocused === next.isFocused && prev.index === next.index);
const MovieGrid = ({ 
  categories, 
  movies, 
  activeCategoryId, 
  onSelectCategory, 
  onSelectMovie, 
  focusedCategoryIndex, 
  focusedMovieIndex,
  isCategoryFocused,
  activeProvider,
  metadataCache,
  setEnrichedData
}) => {
  console.log("STEP 8 — MOVIEGRID RECEIPT");
  console.log("MOVIEGRID_PROPS", movies?.length);
  console.log("ACTIVE_CATEGORY", activeCategoryId);
  console.log("MOVIEGRID_RECEIVED_MOVIES", {
     typeof: typeof movies,
     isArray: Array.isArray(movies),
     length: movies?.length,
     firstItem: movies?.[0]
  });

  const categoryRefs = useRef([]);
  const movieRefs = useRef([]);
  const scrollContainerRef = useRef(null);

  console.log("STEP 9 — GRID FILTERING");
  console.log("FILTER_STAGE_START", { moviesLength: movies?.length });
  const safeMovies = Array.isArray(movies) ? movies : [];
  console.log("FILTER_STAGE_SAFE", { safeMoviesLength: safeMovies.length });

  // Currently no extra filtering or grouping logic here, but logging boundary
  const filteredMovies = safeMovies; 
  console.log("FILTER_STAGE_COMPLETE", { filteredMoviesLength: filteredMovies.length });

  const [visibleRange, setVisibleRange] = React.useState({ start: 0, end: 40 });
  const rowHeight = 350; 
  const cols = 6;
  
  const visibleMovies = filteredMovies.slice(visibleRange.start, visibleRange.end);
  console.log("MOVIEGRID_VISIBLE", visibleMovies?.length);
  console.log("FILTER_STAGE_VISIBLE", { visibleMoviesLength: visibleMovies.length, range: visibleRange });

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const scrollTop = scrollContainerRef.current.scrollTop;
      const startRow = Math.floor(scrollTop / rowHeight);
      const start = Math.max(0, startRow * cols - cols * 2);
      const end = start + 60;
      setVisibleRange({ start, end });
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  useEffect(() => {
    if (isCategoryFocused && categoryRefs.current[focusedCategoryIndex]) {
      categoryRefs.current[focusedCategoryIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedCategoryIndex, isCategoryFocused]);

  useEffect(() => {
    if (!isCategoryFocused && movieRefs.current[focusedMovieIndex]) {
      movieRefs.current[focusedMovieIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [focusedMovieIndex, isCategoryFocused]);

  const lastCategoryRequestRef = useRef({});

  const baseSelectedMovie = safeMovies[focusedMovieIndex] || null;
  console.log("CACHE_LOOKUP", baseSelectedMovie?.id || 'null');
  const selectedMovie = baseSelectedMovie ? (metadataCache[baseSelectedMovie.id] || baseSelectedMovie) : null;
  console.log("MOVIE_ENRICHED", selectedMovie);
  
  const backdropUrl = resolveImageUrl(selectedMovie, activeProvider);
  const showHero = !isCategoryFocused && selectedMovie;

  const description = selectedMovie?.description || selectedMovie?.descr || selectedMovie?.plot || selectedMovie?.movie_description || selectedMovie?.summary || "No description available.";

  return (
    <div className="view-container flex pl-0 overflow-hidden h-full bg-black">
      
      {/* Dynamic Hero Backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700">
         {showHero && backdropUrl && (
            <>
               <img src={backdropUrl} className="w-full h-full object-cover opacity-30" alt="" />
               <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
               <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            </>
         )}
      </div>

      <div className="w-[300px] h-full bg-[#0d0d0d] border-r border-white/[0.07] flex flex-col z-30 shadow-[4px_0_30px_rgba(0,0,0,0.6)] shrink-0">

        {/* Header */}
        <div className="px-6 pt-10 pb-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400"></span>
            </span>
            <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">Cinema</h2>
          </div>
          <p className="text-[10px] font-black text-accent uppercase tracking-[5px] opacity-80 pl-[22px]">Film Library</p>
        </div>

        {/* Category list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar py-4 px-4">
          {categories.map((cat, index) => {
            const isFocused = isCategoryFocused && focusedCategoryIndex === index;
            const isActive = activeCategoryId === cat.id;

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
                  {cat.title || cat.name}
                </span>

                {isActive && !isFocused && (
                  <span className="w-2 h-2 rounded-full bg-accent shrink-0 shadow-[0_0_8px_rgba(0,204,255,0.8)]" />
                )}

                {isFocused && (
                  <svg className="w-5 h-5 text-black shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}

                {!isFocused && !isActive && cat.count !== undefined && cat.count > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 bg-white/[0.06] text-white/25">
                    {cat.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-4 border-t border-white/[0.04]">
          <p className="text-[9px] font-black uppercase tracking-[4px] text-white/15 text-center">UP / DOWN Navigate  ·  OK Select</p>
        </div>
      </div>

      <div className="flex-1 h-full flex flex-col z-20">
         {/* Hero Area */}
         <div className="h-[45%] p-16 flex flex-col justify-end">
            {showHero ? (
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[900px]">
                  <h1 className="text-6xl font-black tracking-tighter uppercase italic leading-tight text-white mb-4 drop-shadow-2xl">
                     {selectedMovie.name || selectedMovie.title}
                  </h1>
                  <div className="flex items-center gap-4 mb-3">
                     {(selectedMovie.rating_imdb || selectedMovie.rating_kinopoisk || selectedMovie.rating) && (
                        <div className="flex items-center gap-1.5 bg-yellow-400/20 px-3 py-1 rounded-lg border border-yellow-400/30">
                           <Star size={16} fill="#facc15" className="text-yellow-400" />
                           <span className="text-white font-black text-sm">{selectedMovie.rating_imdb || selectedMovie.rating_kinopoisk || selectedMovie.rating}</span>
                        </div>
                     )}
                     <span className="px-3 py-1 glass rounded-lg border border-white/10 text-[10px] font-black text-white/80 uppercase tracking-widest">{selectedMovie.quality || '4K HDR'}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[10px] font-black text-white/50 tracking-[2px] uppercase mb-4">
                     <span className="flex items-center gap-1.5"><Calendar size={14} className="text-accent" /> {selectedMovie.year || '2024'}</span>
                     <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                     <span className="flex items-center gap-1.5"><Clock size={14} className="text-accent" /> {selectedMovie.time ? `${selectedMovie.time} MIN` : '120 MIN'}</span>
                     <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                     <span className="border border-white/20 px-2 py-0.5 rounded-full text-white/60">{selectedMovie.age || 'U/A 16+'}</span>
                     <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                     <span className="text-accent flex items-center gap-1.5"><Tag size={14} /> {selectedMovie.genres_str || selectedMovie.genre || selectedMovie.category_name}</span>
                  </div>

                  <p className="text-lg text-white/70 font-medium italic line-clamp-3 leading-relaxed w-full mb-4">
                     "{description}"
                  </p>

                  {(selectedMovie.director || selectedMovie.actors) && (
                     <div className="flex flex-col gap-1 text-[11px] font-bold text-white/40 tracking-wider uppercase mb-6">
                        {selectedMovie.director && <p><span className="text-white/20 mr-2">Director:</span> {selectedMovie.director}</p>}
                        {selectedMovie.actors && <p className="line-clamp-1 flex items-center gap-2"><User size={12} className="text-accent" /> {selectedMovie.actors}</p>}
                     </div>
                  )}

                  <div className="flex items-center gap-4">
                     <div className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-xl font-black text-xl shadow-focus">
                        <Play fill="black" size={24} /> PLAY MOVIE
                     </div>
                  </div>
               </div>
            ) : (
               <div className="h-full flex items-center justify-center opacity-0"><Play/></div>
            )}
         </div>

         {/* Scrollable Grid Area */}
         <div 
            ref={scrollContainerRef}
            className="flex-1 px-12 overflow-y-auto custom-scrollbar pt-8"
         >
            <div 
               className="grid grid-cols-6 gap-6 pb-40"
               style={{ height: `${Math.ceil(safeMovies.length / cols) * rowHeight}px`, position: 'relative' }}
            >
               {safeMovies.slice(visibleRange.start, visibleRange.end).map((mv, relativeIndex) => {
                  const index = visibleRange.start + relativeIndex;
                  const isFocused = !isCategoryFocused && focusedMovieIndex === index;

                  return (
                     <MovieTile
                        key={mv.id}
                        mv={mv}
                        index={index}
                        isFocused={isFocused}
                        onClick={() => { if (typeof onSelectMovie === "function") onSelectMovie(mv); }}
                        activeProvider={activeProvider}
                        rowHeight={rowHeight}
                        cols={cols}
                     />
                  );
               })}
            </div>
         </div>
      </div>
    </div>
  );
};

export default React.memo(MovieGrid);
