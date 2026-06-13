import React, { useEffect, useRef, useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { resolveImageUrl } from '../utils/imageResolver';
import { LayoutGrid, Play, ChevronRight, Film, Folder, Star, ArrowLeft } from 'lucide-react';

/* ─── Tile ─────────────────────────────────────────────── */
const CollectionTile = React.memo(({ mv, index, isFocused, onClick, activeProvider, cols, rowHeight }) => {
  const img = resolveImageUrl(mv, activeProvider);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const tileRef = useRef(null);

  useEffect(() => {
    if (isFocused && tileRef.current) {
      tileRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  return (
    <div
      ref={tileRef}
      onClick={onClick}
      style={{
        position: 'absolute',
        top: `${row * rowHeight}px`,
        left: `${col * (100 / cols)}%`,
        width: `calc(${100 / cols}% - 16px)`,
        height: `${rowHeight - 20}px`,
      }}
      className={clsx(
        'rounded-2xl border-2 transition-all duration-300 relative overflow-hidden cursor-pointer group',
        isFocused
          ? 'border-[var(--accent)] shadow-[0_0_32px_var(--accent-glow)] scale-105 z-20'
          : 'border-white/5 opacity-70 hover:opacity-90 hover:border-white/20'
      )}
    >
      {/* Poster / Backdrop */}
      {img ? (
        <img
          src={img}
          alt={mv.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <Film size={48} className="text-white/10" />
        </div>
      )}

      {/* Always-on subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Focused overlay — full info */}
      <div
        className={clsx(
          'absolute inset-0 flex flex-col justify-end p-4 transition-opacity duration-300',
          isFocused ? 'opacity-100' : 'opacity-0'
        )}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }}
      >
        {/* Play badge */}
        <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-[0_0_16px_var(--accent-glow)]">
          <Play size={16} fill="black" className="text-black" />
        </div>

        <h3 className="font-black text-base leading-tight tracking-tight text-white drop-shadow-lg line-clamp-2 mb-1">
          {mv.name}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {mv.year && (
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{mv.year}</span>
          )}
          {(mv.rating_imdb || mv.rating) && (
            <span className="flex items-center gap-1 text-[10px] font-black text-yellow-400">
              <Star size={10} fill="#facc15" /> {mv.rating_imdb || mv.rating}
            </span>
          )}
          {mv.quality && (
            <span className="text-[10px] font-black text-[var(--accent)] uppercase">{mv.quality}</span>
          )}
        </div>
      </div>

      {/* Unfocused title at bottom */}
      {!isFocused && (
        <div className="absolute bottom-0 inset-x-0 px-3 pb-3">
          <p className="text-xs font-bold text-white/60 truncate">{mv.name}</p>
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.mv.id === next.mv.id &&
  prev.isFocused === next.isFocused &&
  prev.index === next.index
);

/* ─── Hero preview strip on right ─────────────────────── */
const HeroPreview = ({ movie, activeProvider }) => {
  const img = resolveImageUrl(movie, activeProvider);

  if (!movie) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[380px] pointer-events-none z-10">
      {/* Backdrop image */}
      {img && (
        <>
          <img src={img} alt="" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, black 0%, transparent 60%)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
        </>
      )}
    </div>
  );
};

/* ─── Main Component ───────────────────────────────────── */
const CollectionBrowser = ({
  collection,
  movies,
  focusedIndex,
  activeProvider,
  onSelectMovie,
  onBack,
}) => {
  const scrollContainerRef = useRef(null);
  const safeMovies = Array.isArray(movies) ? movies : [];
  const cols = 5;
  const rowHeight = 310;
  const totalRows = Math.ceil(safeMovies.length / cols);

  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 30 });

  const focusedMovie = safeMovies[focusedIndex] || null;

  /* Virtual scroll */
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const scrollTop = scrollContainerRef.current.scrollTop;
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
    const start = startRow * cols;
    const end = start + cols * 6;
    setVisibleRange({ start, end });
  }, [cols, rowHeight]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Keep visible range synchronized with focusedIndex so that the focused element is always mounted and scrollIntoView works
  useEffect(() => {
    if (focusedIndex < 0 || focusedIndex >= safeMovies.length) return;
    const startRow = Math.max(0, Math.floor(focusedIndex / cols) - 2);
    const start = startRow * cols;
    const end = start + cols * 8;
    setVisibleRange(prev => {
      if (focusedIndex < prev.start || focusedIndex >= prev.end) {
        return { start, end: Math.min(safeMovies.length, end) };
      }
      return prev;
    });
  }, [focusedIndex, cols, safeMovies.length]);

  const collectionName = collection?.name || collection?.title || 'Collection';

  return (
    <div className="view-container flex flex-col overflow-hidden h-full pl-0 relative" style={{ background: '#050508' }}>

      {/* ── Ambient background ── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 60% 20%, rgba(0,204,255,0.15) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Hero Preview (right side) */}
      {focusedMovie && <HeroPreview movie={focusedMovie} activeProvider={activeProvider} />}

      {/* ── Header ── */}
      <div className="relative z-20 flex items-center gap-6 px-12 pt-10 pb-6">
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            <ArrowLeft size={20} className="text-white/70" />
          </button>
        )}

        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-[0_0_32px_var(--accent-glow)]"
          style={{ background: 'linear-gradient(135deg, #00ccff 0%, #0066ff 100%)' }}
        >
          <Folder size={30} className="text-white" />
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1
              className="text-5xl font-black tracking-tighter uppercase truncate text-white"
              style={{ textShadow: '0 0 40px rgba(0,204,255,0.3)' }}
            >
              {collectionName}
            </h1>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] font-black uppercase tracking-[6px] text-[var(--accent)] opacity-70">
              Collection
            </span>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[10px] font-black uppercase tracking-[4px] text-white/40">
              {safeMovies.length} {safeMovies.length === 1 ? 'Title' : 'Titles'}
            </span>
          </div>
        </div>

        {/* Focused movie quick info */}
        {focusedMovie && (
          <div
            className="hidden xl:flex flex-col items-end gap-1 ml-auto mr-[400px] max-w-[300px]"
            key={focusedMovie.id}
            style={{ animation: 'fadeIn 300ms ease forwards' }}
          >
            <p className="text-lg font-black text-white truncate text-right">{focusedMovie.name}</p>
            <div className="flex items-center gap-2">
              {focusedMovie.year && <span className="text-xs text-white/40 font-bold">{focusedMovie.year}</span>}
              {(focusedMovie.rating_imdb || focusedMovie.rating) && (
                <span className="flex items-center gap-1 text-xs font-black text-yellow-400">
                  <Star size={11} fill="#facc15" />
                  {focusedMovie.rating_imdb || focusedMovie.rating}
                </span>
              )}
              <span className="text-[10px] font-black text-[var(--accent)] uppercase px-2 py-0.5 rounded-full border border-[var(--accent)]/30">
                {focusedMovie.quality || 'HD'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div
        className="mx-12 mb-4 h-px relative z-20"
        style={{ background: 'linear-gradient(to right, rgba(0,204,255,0.4), transparent)' }}
      />

      {/* ── Grid ── */}
      <div
        ref={scrollContainerRef}
        className="relative z-20 flex-1 px-12 overflow-y-auto pb-20"
        style={{ scrollbarWidth: 'none' }}
      >
        {safeMovies.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center gap-6 opacity-40">
            <div className="w-24 h-24 rounded-3xl border-2 border-white/10 flex items-center justify-center">
              <Film size={48} className="text-white/30" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-white/40 uppercase tracking-widest">No Titles</p>
              <p className="text-sm text-white/20 mt-1">This collection is empty</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="flex items-center gap-6 mb-8">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/8">
                <LayoutGrid size={14} className="text-[var(--accent)]" />
                <span className="text-xs font-black text-white/60 uppercase tracking-wider">
                  {totalRows} Row{totalRows !== 1 ? 's' : ''} • {cols} Per Row
                </span>
              </div>
              {focusedMovie && (
                <div className="flex items-center gap-2 text-xs font-black text-white/40 uppercase tracking-wider">
                  <ChevronRight size={14} className="text-[var(--accent)]" />
                  Press OK to Play
                </div>
              )}
            </div>

            {/* Virtual Grid */}
            <div
              className="relative"
              style={{ height: `${totalRows * rowHeight}px` }}
            >
              {safeMovies.slice(visibleRange.start, visibleRange.end).map((mv, relIdx) => {
                const index = visibleRange.start + relIdx;
                return (
                  <CollectionTile
                    key={mv.id}
                    mv={mv}
                    index={index}
                    isFocused={focusedIndex === index}
                    onClick={() => onSelectMovie && onSelectMovie(mv)}
                    activeProvider={activeProvider}
                    cols={cols}
                    rowHeight={rowHeight}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Bottom gradient fade ── */}
      <div
        className="absolute bottom-0 inset-x-0 h-24 pointer-events-none z-30"
        style={{ background: 'linear-gradient(to top, #050508 0%, transparent 100%)' }}
      />
    </div>
  );
};

export default CollectionBrowser;
