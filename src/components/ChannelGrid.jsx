import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { Tv, Search, Info } from 'lucide-react';
import { resolveImageUrl } from '../utils/imageResolver';

const ChannelTile = React.memo(({ ch, index, isFocused, onClick, activeProvider }) => {
  console.log("CHANNEL_TILE", ch.number, ch.name, "CUR:", ch.cur_playing, "EPG:", !!ch.epg);
  const logo = resolveImageUrl(ch, activeProvider);
  const tileRef = useRef(null);

  useEffect(() => {
    if (isFocused && tileRef.current) {
      tileRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const curStr = ch.cur_playing || 'NOW PLAYING';
  const nextStr = ch.epg?.[1]?.name || 'Schedule Unavailable';
  
  const formatTimeStr = (ts) => {
    if (!ts) return '--:--';
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const startTime = ch.epg?.[0]?.start_timestamp ? formatTimeStr(ch.epg[0].start_timestamp) : '--:--';
  const stopTime = ch.epg?.[0]?.stop_timestamp ? formatTimeStr(ch.epg[0].stop_timestamp) : '--:--';

  const channelName = String(ch.name || "").toUpperCase();
  const isHD = ch.hd == 1 || ch.hd === true || channelName.includes('HD');
  const is4K = channelName.includes('4K') || channelName.includes('UHD');

  console.log("CHANNELGRID_ITEM", index, ch);

  return (
    <div
      ref={tileRef}
      onClick={onClick}
      className={clsx(
        "rounded-xl border-2 transition-all duration-200 relative overflow-hidden bg-[#1a1a1a] flex flex-row items-center cursor-pointer select-none",
        isFocused ? "border-accent scale-[1.01] shadow-[0_10px_30px_rgba(0,204,255,0.2)] z-20" : "border-white/5 opacity-90"
      )}
    >
       {/* LEFT: SQUARE LOGO BOX */}
       <div className="w-32 h-32 bg-black/40 flex items-center justify-center overflow-hidden border-r border-white/5 shrink-0">
          {logo ? (
             <img src={logo} alt="" className="w-full h-full object-cover" />
          ) : (
             <Tv size={36} className="text-white/10" />
          )}
       </div>

       {/* RIGHT: DETAILS */}
       <div className="flex-1 flex flex-col justify-between h-full p-4 min-w-0">
          {/* TOP ROW: CH NO, NAME & BADGES */}
          <div className="flex items-center gap-3 mb-2 min-w-0">
             <span className="text-accent font-black text-xl tracking-tighter shrink-0">CH {ch.number}</span>
             <h3 className="flex-1 font-black text-md tracking-tight truncate text-white uppercase leading-none">{ch.name}</h3>
             
             <div className="flex gap-1.5 shrink-0 items-center">
                {is4K && <div className="bg-yellow-500/20 border border-yellow-500/40 px-1.5 py-0.5 rounded text-[8px] font-black text-yellow-500">4K</div>}
                {isHD && <div className="bg-white/10 border border-white/20 px-1.5 py-0.5 rounded text-[8px] font-black text-white/60">HD</div>}
                <div className="bg-red-600 px-1.5 py-0.5 rounded text-[8px] font-black text-white animate-pulse">LIVE</div>
             </div>
          </div>
          
          {/* MID/EPG ROW: PROGRESS BAR & TIMES */}
          <div className="bg-white/5 p-3 rounded-lg border border-white/5 flex items-center gap-4">
             <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                   <p className="text-[11px] font-bold text-white/90 truncate">{curStr}</p>
                   <span className="text-[9px] font-mono text-white/40 italic">{startTime} - {stopTime}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-accent" style={{ width: `${ch.percentage || 50}%` }} />
                </div>
             </div>
             
             {/* NEXT INFO */}
             <div className="w-1/3 hidden lg:block border-l border-white/5 pl-3">
                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-0.5">Next</p>
                <p className="text-[10px] font-bold text-white/50 truncate italic leading-tight">{nextStr}</p>
             </div>
          </div>
       </div>
    </div>
  );
}, (prev, next) => prev.ch.id === next.ch.id && prev.isFocused === next.isFocused);

const ChannelGrid = ({ 
  categories, 
  channels, 
  activeCategoryId, 
  onSelectCategory, 
  onSelectChannel, 
  onPlay,
  focusedCategoryIndex, 
  focusedChannelIndex,
  isCategoryFocused,
  activeProvider
}) => {
  console.log("CHANNELGRID_RENDER_PATH", "STB_3_PANE");
  console.log("CHANNELGRID_RENDER_MODE", "STB_CARD_MODE");
  const safeChannels = Array.isArray(channels) ? channels : [];
  const categoryRefs = useRef([]);
  const selectedChannel = safeChannels[focusedChannelIndex] || null;

  useEffect(() => {
    if (isCategoryFocused && categoryRefs.current[focusedCategoryIndex]) {
      categoryRefs.current[focusedCategoryIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedCategoryIndex, isCategoryFocused]);

  return (
    <div className="view-container flex pl-0 overflow-hidden h-full bg-black">
      {/* PANE 1: CATEGORIES */}
      <div className="w-[380px] h-full bg-[#0d0d0d] border-r border-white/[0.07] flex flex-col z-30 shadow-[4px_0_30px_rgba(0,0,0,0.6)] shrink-0">

        {/* Header */}
        <div className="px-6 pt-10 pb-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">Live TV</h2>
          </div>
          <p className="text-[10px] font-black text-accent uppercase tracking-[5px] opacity-80 pl-[22px]">Select a Category</p>
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
                {/* Focused: left accent glow bar */}
                {isFocused && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-accent rounded-r-full shadow-[0_0_12px_rgba(0,204,255,0.9)]" />
                )}
                {/* Active: left accent bar */}
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

      {/* PANE 2: CHANNELS LIST — expands to fill all space between categories and preview */}
      <div className="flex-1 h-full pt-12 px-6 overflow-y-auto bg-white/[0.015] custom-scrollbar">
         <div className="flex items-center gap-3 mb-6 bg-white/[0.04] p-3.5 rounded-xl border border-white/[0.06] max-w-[480px]">
            <Search size={20} className="text-white/25 shrink-0" />
            <input type="text" placeholder="Search Channels..." className="bg-transparent outline-none w-full font-bold text-white/30 tracking-widest uppercase text-sm" readOnly />
         </div>

         <div className="flex flex-col gap-3 pb-32">
            {safeChannels.map((ch, index) => {
               const isFocused = !isCategoryFocused && focusedChannelIndex === index;
               return (
                  <ChannelTile
                     key={ch.id}
                     ch={ch}
                     index={index}
                     isFocused={isFocused}
                     onClick={() => {
                        console.log("CHANNEL_SELECTED", ch.id);
                        if (typeof onSelectChannel === "function") onSelectChannel(ch);
                        else if (typeof onPlay === "function") onPlay(ch, false);
                     }}
                     activeProvider={activeProvider}
                  />
               );
            })}
         </div>
      </div>

      {/* PANE 3: PASSIVE EPG PREVIEW — width adjusted to 380px to balance the wider category panel */}
      <div className="w-[380px] h-full bg-[#0a0a0a] border-l border-white/[0.06] pt-14 px-7 shadow-2xl z-20 flex flex-col shrink-0">
         {selectedChannel ? (
            <div className="animate-in fade-in duration-300">
               <div className="w-full aspect-video bg-black rounded-2xl mb-8 flex items-center justify-center p-8 border border-white/10 shadow-2xl">
                  {resolveImageUrl(selectedChannel, activeProvider) ? (
                    <img src={resolveImageUrl(selectedChannel, activeProvider)} className="max-w-full max-h-full object-contain filter drop-shadow-2xl" />
                  ) : (
                    <Tv size={80} className="text-white/10"/>
                  )}
               </div>
               
               <div className="mb-8">
                  <div className="flex items-center gap-4 mb-4">
                     <span className="px-4 py-1 bg-accent text-black font-black rounded-lg text-2xl tracking-tighter shadow-lg">CH {selectedChannel.number}</span>
                     <h2 className="text-3xl font-black italic uppercase leading-tight text-white">{selectedChannel.name}</h2>
                  </div>
                  <div className="h-px w-full bg-white/10 mb-6" />
               </div>

               <div className="bg-[#111] p-6 rounded-3xl border border-white/5">
                  <div className="mb-6">
                    <p className="text-[10px] font-black text-accent uppercase tracking-[4px] mb-3">Now Playing</p>
                    <p className="text-2xl font-black italic text-white mb-3 leading-tight">{selectedChannel.cur_playing || 'Live Broadcast'}</p>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-4">
                       <div className="h-full bg-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ width: `${selectedChannel.percentage || 50}%` }} />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[4px] mb-3">Coming Up Next</p>
                    <div className="flex items-start gap-4">
                       <div className="p-3 bg-white/5 rounded-xl"><Info size={20} className="text-white/20"/></div>
                       <p className="text-lg font-bold text-white/70 leading-snug">{selectedChannel.epg?.[1]?.name || 'Schedule Unavailable'}</p>
                    </div>
                  </div>
               </div>
            </div>
         ) : (
            <div className="flex-1 flex items-center justify-center text-white/10 font-black italic tracking-widest text-4xl">NO SIGNAL</div>
         )}
      </div>
    </div>
  );
};

export default React.memo(ChannelGrid);
