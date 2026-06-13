
import React from 'react';
import { Star, Clock, Calendar, Info, Play, User, Globe, Tag, Tv } from 'lucide-react';
import { clsx } from 'clsx';
import { resolveImageUrl } from '../utils/imageResolver';

const DetailsPanel = ({ item, type = 'movie', epg = [], activeProvider }) => {
  if (!item) return null;

  const isLive = type === 'live' || type === 'channel';
  const now = Math.floor(Date.now() / 1000);
  
  const nowPlaying = isLive ? epg.find(p => {
    return now >= p.start_timestamp && now < p.stop_timestamp;
  }) : null;

  const nextProgram = isLive ? epg.find(p => {
    return p.start_timestamp > now;
  }) : null;

  const calculateProgress = (start, end) => {
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const title = item.name || item.title || "Unknown Title";

  // --- LIVE TV LAYOUT ---
  if (type === 'live') {
    const logoUrl = resolveImageUrl(item, activeProvider);
    return (
      <div className="w-[500px] h-full glass border-l border-white/10 p-12 flex flex-col z-40 animate-in slide-in-from-right duration-500 overflow-y-auto custom-scrollbar">
        {/* Channel Logo Section */}
        <div className="w-full h-64 glass rounded-3xl overflow-hidden mb-10 border border-white/10 shadow-2xl relative flex items-center justify-center p-12 bg-white/5">
          {logoUrl ? (
            <img src={logoUrl} className="max-w-[80%] max-h-[80%] object-contain filter drop-shadow-2xl" alt={title} />
          ) : (
            <Tv size={100} className="text-white/10" />
          )}
          <div className="absolute top-6 left-6 px-4 py-2 glass rounded-full border border-white/20 text-[10px] font-black uppercase tracking-[3px]">
            Live TV
          </div>
        </div>

        {/* Channel Info */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-6">
             <div className="px-4 py-2 bg-accent text-white rounded-xl font-black text-xl tracking-tighter">
                CH {item.number || '000'}
             </div>
             <div className="px-4 py-2 glass rounded-xl border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-[2px]">
                {item.category_name || 'General'}
             </div>
          </div>
          <h1 className="text-5xl font-black mb-10 tracking-tighter uppercase italic leading-none drop-shadow-2xl">{title}</h1>
        </div>

        {/* EPG Section */}
        <div className="flex flex-col gap-6">
           {nowPlaying ? (
             <div className="p-8 glass rounded-[32px] border border-white/10 bg-accent/5 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-2 h-full bg-accent" />
                <p className="text-[10px] font-black text-accent uppercase tracking-[4px] mb-4">Now Playing</p>
                <h4 className="text-3xl font-black italic tracking-tighter uppercase mb-4 leading-tight">{nowPlaying.name}</h4>
                <p className="text-white/40 text-sm line-clamp-3 mb-6 leading-relaxed">{nowPlaying.descr || 'No description available.'}</p>
                
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-[10px] font-bold font-mono text-white/60">{formatTime(nowPlaying.start_timestamp)}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent shadow-focus transition-all duration-1000" 
                      style={{ width: `${calculateProgress(nowPlaying.start_timestamp, nowPlaying.stop_timestamp)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold font-mono text-white/60">{formatTime(nowPlaying.stop_timestamp)}</span>
                </div>
             </div>
           ) : (
             <div className="p-8 glass rounded-[32px] border border-white/10 bg-white/5 opacity-40">
                <p className="text-[10px] font-black text-white/20 uppercase tracking-[4px] mb-4">Live Stream</p>
                <h4 className="text-2xl font-black italic tracking-tighter uppercase leading-tight">{item.cur_playing?.replace(/^H:i\s+/, '') || 'No information available'}</h4>
             </div>
           )}

           {nextProgram && (
             <div className="p-8 glass rounded-[32px] border border-white/5 opacity-40">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[4px] mb-4">Next Program</p>
                <div className="flex justify-between items-center">
                  <h4 className="text-2xl font-black italic tracking-tighter uppercase leading-tight line-clamp-1 flex-1">{nextProgram.name}</h4>
                  <span className="text-sm font-black font-mono text-white/60 ml-4">{formatTime(nextProgram.start_timestamp)}</span>
                </div>
             </div>
           )}
        </div>

        {/* Actions */}
        <div className="mt-auto flex gap-4 pt-10 border-t border-white/5">
          <div className="flex-1 flex items-center justify-center gap-4 py-6 bg-white text-black font-black rounded-2xl text-2xl transition-all hover:scale-105 active:scale-95 shadow-focus cursor-pointer">
            <Play fill="black" size={28} /> WATCH LIVE
          </div>
          <div className="p-6 glass rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
            <Info size={28} />
          </div>
        </div>
      </div>
    );
  }

  // --- MOVIE / SERIES / EPISODE LAYOUT ---
  const backdropUrl = resolveImageUrl(item, activeProvider);
  const year = item.year;
  const rating = item.rating_imdb || item.rating_kinopoisk || item.rating;
  const genre = item.category_name || item.genre || item.genres_str;
  const description = item.description || item.descr;
  
  // Clean values - never show N/A or placeholders
  const hasRating = rating && rating !== '0' && rating !== 'N/A';
  const hasYear = year && year !== '0' && year !== 'N/A';
  const hasGenre = genre && genre !== 'N/A' && genre !== '0';
  const hasDescription = description && description.length > 5;

  return (
    <div className="w-[550px] h-full glass border-l border-white/5 p-10 flex flex-col z-40 animate-in slide-in-from-right duration-500 overflow-y-auto custom-scrollbar shadow-2xl">
      {/* Visual Header - High Quality Poster/Backdrop */}
      <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden mb-8 border border-white/10 shadow-2xl relative group bg-white/5">
        {backdropUrl ? (
          <img 
            src={backdropUrl} 
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
            alt={title} 
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-10">
            <Tv size={80} />
          </div>
        )}
        
        {/* Type Badge - Minimalist */}
        <div className="absolute top-4 left-4 px-3 py-1.5 glass rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-[2px] shadow-2xl text-accent">
          {type === 'movie' ? 'Cinema' : (type === 'series' ? 'Series' : (type === 'episode' ? 'Episode' : 'Live'))}
        </div>
      </div>

      {/* Title & Core Metadata */}
      <div className="mb-8">
        <h1 className="text-4xl font-black mb-4 tracking-tighter uppercase italic leading-tight drop-shadow-2xl text-white">
          {title}
        </h1>
        
        <div className="flex flex-wrap items-center gap-3">
          {hasRating && (
            <div className="flex items-center gap-1.5 bg-yellow-400/10 px-3 py-1 rounded-lg border border-yellow-400/20">
              <Star size={14} fill="#facc15" className="text-yellow-400" />
              <span className="text-white font-black text-sm">{rating}</span>
            </div>
          )}
          {hasYear && (
            <span className="px-2 py-1 glass rounded-lg border border-white/5 text-[10px] font-black text-white/60 tracking-wider">
              {year}
            </span>
          )}
          {item.quality && (
            <span className="px-2 py-1 glass rounded-lg border border-white/5 text-[10px] font-black text-accent/80 tracking-wider">
              {item.quality}
            </span>
          )}
        </div>
      </div>

      {/* Series Specific Metadata Section */}
      {type === 'series' && (
        <div className="grid grid-cols-1 gap-4 mb-8 bg-white/5 p-6 rounded-2xl border border-white/5">
          {item.series_count || item.count ? (
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <span className="text-[10px] font-black uppercase tracking-[3px] text-white/20">Total Episodes</span>
              <span className="text-sm font-black italic text-accent">{item.series_count || item.count}</span>
            </div>
          ) : null}
          
          {item.last_episode_index && (
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <span className="text-[10px] font-black uppercase tracking-[3px] text-white/20">Latest Episode</span>
              <span className="text-sm font-black italic text-white/60">EP {item.last_episode_index}</span>
            </div>
          )}

          {hasGenre && (
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <span className="text-[10px] font-black uppercase tracking-[3px] text-white/20">Category</span>
              <span className="text-sm font-bold text-white/60 truncate ml-4">{genre}</span>
            </div>
          )}

          {item.added || item.last_updated ? (
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-[3px] text-white/20">Last Updated</span>
              <span className="text-xs font-bold text-white/40">{item.added || item.last_updated}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Description - Modern Typography */}
      {hasDescription && (
        <div className="relative mb-10 overflow-hidden">
          <p className="text-lg text-white/60 leading-relaxed font-medium italic line-clamp-6">
            "{description}"
          </p>
          <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-bg-primary/20 to-transparent pointer-events-none" />
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-auto">
        {type !== 'series' ? (
          <div className="flex gap-4">
            <div className="flex-1 flex items-center justify-center gap-3 py-5 bg-white text-black font-black rounded-xl text-xl transition-all hover:scale-105 active:scale-95 shadow-focus cursor-pointer group">
              <Play fill="black" size={24} className="group-hover:animate-pulse" /> WATCH
            </div>
            <div className="p-5 glass rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <Info size={24} />
            </div>
          </div>
        ) : (
          <div className="py-4 glass rounded-xl border border-accent/20 text-center">
            <p className="text-[10px] font-black uppercase tracking-[4px] text-accent animate-pulse">
              Select Episode to Play
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailsPanel;
