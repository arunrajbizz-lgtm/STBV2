import React, { useEffect } from 'react';
import { Play, Clock, Star, History, LayoutGrid } from 'lucide-react';
import { clsx } from 'clsx';
import { APP_NAME } from '../utils/constants';

const Home = ({ onPlay, sections = [], focusedRowIndex, focusedColIndex }) => {
  
  useEffect(() => {
    console.log("[Home] Render Start");
    const continueWatching = sections.find(s => s.id === 'continue')?.items || [];
    const recentlyVisited = sections.find(s => s.id === 'recent')?.items || [];
    const favorites = sections.find(s => s.id === 'favorites')?.items || [];
    
    console.log("[Home] Continue Watching Count:", continueWatching.length);
    console.log("[Home] Recently Visited Count:", recentlyVisited.length);
    console.log("[Home] Favorites Count:", favorites.length);
    
    if (focusedRowIndex >= 0 && focusedColIndex >= 0) {
      console.log("[Home] Focus Initialized:", { row: focusedRowIndex, col: focusedColIndex });
    }
    
    console.log("[Home] Render Complete");
  }, [sections, focusedRowIndex, focusedColIndex]);

  const getImageUrl = (item) => {
    if (!item) return null;
    return item.screenshot_uri || item.poster || item.pic || item.logo || null;
  };

  const getBadge = (type) => {
    switch (type) {
      case 'channel': return 'LIVE';
      case 'series': return 'SERIES';
      default: return 'VOD';
    }
  };

  try {
    // Robust check for sections
    const safeSections = Array.isArray(sections) ? sections : [];

    return (
      <div className="view-container pt-16 px-16 overflow-y-auto custom-scrollbar h-full bg-black/20">
        <div className="mb-12">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-1 leading-none text-white opacity-90 drop-shadow-2xl">
            Welcome Back
          </h1>
          <p className="text-[9px] font-black text-accent uppercase tracking-[6px] opacity-50">
            Personalized Home Experience
          </p>
        </div>

        {safeSections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-10 italic">
            <LayoutGrid size={80} className="mb-6" />
            <p className="text-3xl font-black uppercase tracking-[15px]">Empty Home</p>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-widest opacity-60">Watch content to build your personalized experience</p>
          </div>
        ) : (
          <div className="flex flex-col gap-14 pb-40">
            {safeSections.map((section, rowIndex) => (
              <div key={section.id || rowIndex} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${rowIndex * 80}ms` }}>
                <div className="flex items-center gap-4 mb-6 px-1">
                  {section.id === 'continue' && <Clock size={16} className="text-accent/80" />}
                  {section.id === 'recent' && <History size={16} className="text-accent/80" />}
                  {section.id === 'favorites' && <Star size={16} className="text-accent/80" />}
                  <h2 className="text-xl font-black uppercase tracking-[4px] text-white opacity-80">
                    {section.id === 'favorites' ? 'Curated Collections' : (section.title || 'Section')}
                  </h2>
                  <div className="h-[1px] flex-1 bg-white/5 ml-4" />
                </div>

                <div className="flex gap-5 overflow-x-hidden p-3 -m-3">
                  {(section.items || []).map((item, colIndex) => {
                    const isFocused = focusedRowIndex === rowIndex && focusedColIndex === colIndex;
                    const img = getImageUrl(item);
                    const type = item.type || 'vod';

                    return (
                      <div
                        key={`${section.id}_${item?.id || colIndex}_${colIndex}`}
                        onClick={() => onPlay && onPlay(item, type !== 'channel', type === 'series')}
                        className={clsx(
                          "w-[300px] aspect-video glass rounded-xl border-2 transition-all duration-300 relative group overflow-hidden shrink-0 shadow-xl bg-black/40",
                          isFocused ? "border-white scale-110 shadow-focus z-10" : "border-white/5 opacity-50 grayscale-[20%]"
                        )}
                      >
                        {img ? (
                          <img src={img} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full bg-slate-900/50 flex items-center justify-center p-6 text-center">
                            <span className="font-black text-white/5 uppercase italic tracking-tighter text-xl truncate px-4">
                              {item?.name || item?.title || 'Unknown'}
                            </span>
                          </div>
                        )}

                        {/* Content Overlay */}
                        <div className={clsx(
                          "absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-4 transition-opacity duration-300",
                          isFocused ? "opacity-100" : "opacity-0"
                        )}>
                          <div className="flex items-center gap-2 mb-1.5">
                             <span className={clsx(
                               "px-1.5 py-0.5 rounded-md text-[7px] font-black text-white shadow-lg",
                               type === 'channel' ? "bg-red-600/90" : "bg-accent/90"
                             )}>
                               {getBadge(type)}
                             </span>
                             {item?.quality && <span className="bg-white/10 px-1.5 py-0.5 rounded-md text-[7px] font-bold text-white/60 border border-white/5">4K HDR</span>}
                          </div>
                          <h3 className="font-black text-base text-white leading-tight truncate">{item?.name || item?.title || 'Unknown'}</h3>
                          <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1 truncate">
                            {item?.category_name || item?.genre || 'Recently Viewed'}
                          </p>
                        </div>

                        {/* Simple Play Icon for Focus */}
                        {isFocused && (
                          <div className="absolute top-3 right-3 animate-in zoom-in-50 duration-300">
                             <div className="w-7 h-7 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                               <Play size={14} fill="white" className="text-white ml-0.5" />
                             </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("[Home] Render Error:", error);
    return (
      <div className="view-container pt-16 px-16 flex flex-col items-center justify-center h-full bg-black/20 opacity-10">
        <LayoutGrid size={80} className="mb-6" />
        <p className="text-3xl font-black uppercase tracking-[15px]">Empty Home</p>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-widest opacity-60">A temporary error occurred while loading Home</p>
      </div>
    );
  }
};

export default Home;
