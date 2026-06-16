import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, Square, SkipBack, SkipForward, Clock, Languages, Subtitles, 
  Maximize, Heart, Monitor, Volume2, Info, List, Search, Settings, 
  Tv, Film, PlayCircle, Calendar, ChevronRight, ChevronLeft, ChevronUp, ChevronDown 
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatClock } from '../utils/stalker';
import PlayerService from '../services/player';
import { resolveImageUrl } from '../utils/imageResolver';
import StalkerService from '../services/stalker';

const Player = ({ 
  item, 
  url,
  engine,
  onClose, 
  onNext, 
  onPrev,
  onToggleFavorite,
  isFavorite,
  channels = [],
  epg = [],
  activeProvider
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [showHud, setShowHud] = useState(true);
  const [playerState, setPlayerState] = useState("IDLE");
  const [bufferingPercent, setBufferingPercent] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);
  
  const [menuMode, setMenuMenuMode] = useState(null); // 'audio', 'subtitle', 'miniguide', 'guide'
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [focusedControlIdx, setFocusedControlIdx] = useState(1); 
  const [focusedMenuIdx, setFocusedMenuIdx] = useState(0);
  const [seekOverlay, setSeekOverlay] = useState(null); 
  const [activeHudZone, setActiveHudZone] = useState('bar'); // 'bar' or 'controls'
  const [guideFocusZone, setGuideFocusZone] = useState('channels'); // 'channels', 'programs'
  const [focusedProgramIdx, setFocusedProgramIdx] = useState(0);

  const [currentEpg, setCurrentEpg] = useState([]);
  const [focusedChannelEpg, setFocusedChannelEpg] = useState([]);
  const [focusedChannelEpgLoading, setFocusedChannelEpgLoading] = useState(false);

  const getMockEpgList = useCallback((baseTs) => {
     const rounded = Math.floor(baseTs / 3600) * 3600;
     return [
        { name: "Live Broadcast", start_timestamp: rounded, stop_timestamp: rounded + 3600, descr: "Continuous live broadcast directly from the source portal." },
        { name: "Scheduled Programming", start_timestamp: rounded + 3600, stop_timestamp: rounded + 7200, descr: "Upcoming general variety programming and entertainment." },
        { name: "Entertainment Special", start_timestamp: rounded + 7200, stop_timestamp: rounded + 10800, descr: "Special curated movie block or general entertainment show." },
        { name: "Nightly News & Sports", start_timestamp: rounded + 10800, stop_timestamp: rounded + 14400, descr: "Daily summary of local and international news, highlights, and sports events." }
     ];
  }, []);

  useEffect(() => {
     if (menuMode !== 'guide') {
        setGuideFocusZone('channels');
        setFocusedProgramIdx(0);
     }
  }, [menuMode]);

  useEffect(() => {
     setFocusedProgramIdx(0);
  }, [focusedMenuIdx]);

  const formatMediaTime = (ms) => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    const pad = (num) => String(num).padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
  };

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hudTimerRef = useRef(null);
  const menuTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const seekOverlayTimerRef = useRef(null);
  const feedbackTimerRef = useRef(null);

  const ASPECT_MODES = ["Fit", "Fill", "Stretch", "Original"];
  const isLive = item?.type === 'channel';

  const CONTROLS = [
    { id: 'prev', icon: SkipBack, label: 'Prev' },
    { id: 'play', icon: isPlaying ? Pause : Play, label: isPlaying ? 'Pause' : 'Play' },
    { id: 'stop', icon: Square, label: 'Stop' },
    { id: 'next', icon: SkipForward, label: 'Next' },
    { id: 'audio', icon: Languages, label: 'Audio' },
    { id: 'subtitle', icon: Subtitles, label: 'Subs' },
    { id: 'aspect', icon: Maximize, label: 'Aspect' },
  ];

  const nowTs = Math.floor(Date.now() / 1000);
  const activeChannelEpg = (currentEpg && currentEpg.length > 0) ? currentEpg : ((epg && epg.length > 0) ? epg : (item?.epg || []));
  const nowPlaying = isLive ? activeChannelEpg.find(p => nowTs >= p.start_timestamp && nowTs < p.stop_timestamp) : null;
  const nextProgram = isLive ? activeChannelEpg.find(p => p.start_timestamp > nowTs) : null;

  const calculateProgress = (start, end) => {
    if (!start || !end) return 0;
    const total = end - start;
    const elapsed = nowTs - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const formatTimeStr = (ts) => {
    if (!ts) return '--:--';
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const showFeedback = (text, Icon) => {
    setActionFeedback({ text, icon: Icon });
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActionFeedback(null), 3000);
  };

  const getLogoUrl = (ch) => resolveImageUrl(ch, activeProvider);

  const resetHudTimer = useCallback((duration = 5000) => {
    setShowHud(true);
    clearTimeout(hudTimerRef.current);
    if (menuMode === null) {
      hudTimerRef.current = setTimeout(() => setShowHud(false), duration);
    }
  }, [menuMode]);

  const resetMenuTimer = useCallback(() => {
    clearTimeout(menuTimerRef.current);
    if (menuMode === 'miniguide' || menuMode === 'guide') {
       menuTimerRef.current = setTimeout(() => setMenuMenuMode(null), 5000);
    }
  }, [menuMode]);

  const handleSeek = (amount) => {
    if (isLive) return;
    PlayerService.seek(amount * 1000);
    setCurrentTime(PlayerService.getCurrentTime()); // Instantly update HUD progress bar time
    setSeekOverlay({ type: amount > 0 ? 'forward' : 'backward', amount: Math.abs(amount) });
    clearTimeout(seekOverlayTimerRef.current);
    seekOverlayTimerRef.current = setTimeout(() => setSeekOverlay(null), 1000);
    resetHudTimer();
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
      showFeedback("Fullscreen Enabled", Maximize);
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.();
      setIsFullscreen(false);
      showFeedback("Windowed Mode", Monitor);
    }
  }, []);

  // INITIALIZATION EFFECT
  useEffect(() => {
    console.log("FORENSIC: PLAYER_MOUNT_INITIALIZE", { itemKey: item?.id, url, engine });
    PlayerService.initialize(videoRef.current, {
      onStateChange: (state) => setPlayerState(state),
      onbufferingprogress: (percent) => setBufferingPercent(percent),
      onerror: () => setPlayerState("ERROR"),
      onstreamcompleted: () => onClose()
    });

    const fsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fsChange);

    return () => {
      console.log("FORENSIC: PLAYER_UNMOUNT_DESTROY", { itemKey: item?.id, url, engine });
      PlayerService.destroy();
      document.removeEventListener('fullscreenchange', fsChange);
    };
  }, [onClose]);

  // PLAYBACK EFFECT
  useEffect(() => {
    if (!url) return;
    
    console.log("FORENSIC: PLAYER_PLAYBACK_TRIGGER", { url, type: item?.type, engine });
    PlayerService.play(url, { type: item?.type, engine: engine });

    progressTimerRef.current = setInterval(() => {
      setCurrentTime(PlayerService.getCurrentTime());
      setDuration(PlayerService.getDuration());
    }, 1000);

    resetHudTimer();

    return () => {
      clearInterval(progressTimerRef.current);
    };
  }, [url, item?.id, engine]);

  // Fetch EPG for active playing channel
  useEffect(() => {
     if (isLive && item?.id) {
        setCurrentEpg([]);
        StalkerService.getEPG(item.id).then(data => {
           if (Array.isArray(data)) {
              setCurrentEpg(data);
           }
        }).catch(err => {
           console.error("Failed to fetch EPG for active channel", err);
        });
     } else {
        setCurrentEpg([]);
     }
  }, [item?.id, isLive]);

  // Fetch EPG for highlighted channel in EPG / Mini Guide
  useEffect(() => {
     if ((menuMode === 'guide' || menuMode === 'miniguide') && channels[focusedMenuIdx]?.id) {
        const targetId = channels[focusedMenuIdx].id;
        setFocusedChannelEpgLoading(true);
        setFocusedChannelEpg([]);
        StalkerService.getEPG(targetId).then(data => {
           if (Array.isArray(data)) {
              setFocusedChannelEpg(data);
           }
           setFocusedChannelEpgLoading(false);
        }).catch(err => {
           console.error("Failed to fetch EPG for focused channel", err);
           setFocusedChannelEpgLoading(false);
        });
     } else {
        setFocusedChannelEpg([]);
        setFocusedChannelEpgLoading(false);
     }
  }, [focusedMenuIdx, menuMode, channels]);

  const handleAction = useCallback((id) => {
    switch (id) {
      case 'play':
        if (isPlaying) PlayerService.pause();
        else PlayerService.resume();
        setIsPlaying(!isPlaying);
        resetHudTimer();
        break;
      case 'stop':
        onClose();
        break;
      case 'prev':
        if (onPrev) { onPrev(); resetHudTimer(3000); }
        break;
      case 'next':
        if (onNext) { onNext(); resetHudTimer(3000); }
        break;
      case 'audio':
        const tracks = PlayerService.getAudioTracks();
        setAudioTracks(tracks);
        setMenuMenuMode('audio');
        setFocusedMenuIdx(0);
        break;
      case 'subtitle':
        setSubtitleTracks(PlayerService.getSubtitleTracks());
        setMenuMenuMode('subtitle');
        setFocusedMenuIdx(0);
        break;
      case 'miniguide':
        const currIdx = channels.findIndex(c => c.id === item.id);
        setFocusedMenuIdx(currIdx >= 0 ? currIdx : 0);
        setMenuMenuMode('miniguide');
        resetMenuTimer();
        break;
      case 'guide':
        const cIdx = channels.findIndex(c => c.id === item.id);
        setFocusedMenuIdx(cIdx >= 0 ? cIdx : 0);
        setMenuMenuMode('guide');
        break;
      case 'aspect':
        const curIdx = ASPECT_MODES.indexOf(PlayerService.aspectRatio);
        const nextIdx = (curIdx + 1) % ASPECT_MODES.length;
        const nextMode = ASPECT_MODES[nextIdx];
        PlayerService.applyAspectRatio(nextMode);
        showFeedback(`Screen Mode: ${nextMode}`, Monitor);
        break;
      case 'favorite':
        if (onToggleFavorite) {
           onToggleFavorite(item);
           // Notification handled via App toast if implemented, or local feedback
           showFeedback(isFavorite ? "Removed from Favorites" : "Added to Favorites", Heart);
        }
        break;
    }
  }, [isPlaying, onClose, onNext, onPrev, resetHudTimer, resetMenuTimer, ASPECT_MODES, channels, item, onToggleFavorite, isFavorite]);

  const handleKeyDown = useCallback((e) => {
    let key = e.keyCode || e.which;
    
    // PC Keyboard Mappings to simulate remote control keys during browser testing
    if (key === 33) key = 427; // PageUp -> CH+
    if (key === 34) key = 428; // PageDown -> CH-
    if (key === 82 || key === 114) key = 403; // R/r -> RED
    if (key === 71 || key === 103) key = 404; // G/g -> GREEN
    if (key === 89 || key === 121) key = 405; // Y/y -> YELLOW
    if (key === 66 || key === 98)  key = 406; // B/b -> BLUE
    
    if (menuMode) {
      resetMenuTimer();
      if (menuMode === 'audio' || menuMode === 'subtitle') {
         if (key === 38) setFocusedMenuIdx(p => Math.max(0, p - 1));
         if (key === 40) {
           const max = menuMode === 'audio' ? audioTracks.length : subtitleTracks.length;
           setFocusedMenuIdx(p => Math.min(max - 1, p + 1));
         }
         if (key === 13) {
           if (menuMode === 'audio' && audioTracks[focusedMenuIdx]) { 
             PlayerService.setAudioTrack(audioTracks[focusedMenuIdx].index);
             showFeedback(`Audio: ${audioTracks[focusedMenuIdx].language || 'Track ' + (focusedMenuIdx+1)}`, Volume2);
           } else if (menuMode === 'subtitle' && subtitleTracks[focusedMenuIdx]) {
             PlayerService.setSubtitleTrack(subtitleTracks[focusedMenuIdx].index);
             showFeedback(`Subtitle: ${subtitleTracks[focusedMenuIdx].language || 'Track ' + (focusedMenuIdx+1)}`, Subtitles);
           }
           setMenuMenuMode(null);
         }
      } else if (menuMode === 'miniguide') {
         if (key === 37) setFocusedMenuIdx(p => Math.max(0, p - 1)); // LEFT
         if (key === 39) setFocusedMenuIdx(p => Math.min(channels.length - 1, p + 1)); // RIGHT
         if (key === 38 || key === 40) { setMenuMenuMode(null); return; } // UP/DOWN closes miniguide
         
         if (key === 13) {
            const target = channels[focusedMenuIdx];
            if (target && target.id !== item.id) {
               window.dispatchEvent(new CustomEvent('tune_channel', { detail: target }));
               resetHudTimer(3000);
            }
            setMenuMenuMode(null);
         }
      } else if (menuMode === 'guide') {
         const channel = channels[focusedMenuIdx];
         const epgList = channel?.epg && channel.epg.length > 0 ? channel.epg : getMockEpgList(nowTs);
         
         if (guideFocusZone === 'channels') {
            if (key === 38) setFocusedMenuIdx(p => Math.max(0, p - 1)); // UP
            if (key === 40) setFocusedMenuIdx(p => Math.min(channels.length - 1, p + 1)); // DOWN
            if (key === 39) { // RIGHT
               if (epgList.length > 0) {
                  setGuideFocusZone('programs');
                  setFocusedProgramIdx(0);
               }
            }
            if (key === 13) {
               const target = channels[focusedMenuIdx];
               if (target && target.id !== item.id) {
                  window.dispatchEvent(new CustomEvent('tune_channel', { detail: target }));
                  resetHudTimer(3000);
               }
               setMenuMenuMode(null);
            }
         } else if (guideFocusZone === 'programs') {
            if (key === 38) setFocusedProgramIdx(p => Math.max(0, p - 1)); // UP
            if (key === 40) setFocusedProgramIdx(p => Math.min(epgList.length - 1, p + 1)); // DOWN
            if (key === 37) { // LEFT
               setGuideFocusZone('channels');
            }
            if (key === 13) {
               const prog = epgList[focusedProgramIdx];
               if (prog) {
                  showFeedback(`Selected: ${prog.name || prog.title}`, Calendar);
               }
            }
         }
      }
      
      if (key === 10009 || key === 27 || key === 405 || (key === 404 && menuMode === 'audio')) setMenuMenuMode(null); // Back, Esc, Yellow, or Green (for audio) closes the menu
      return;
    }

    switch(key) {
      case 13: // OK
        if (showHud && activeHudZone === 'controls') {
          const ctrl = CONTROLS[focusedControlIdx];
          if (ctrl) {
            handleAction(ctrl.id);
          }
        } else if (showHud && activeHudZone === 'bar') {
          // Force apply debounced seek immediately
          PlayerService.confirmSeek();
          resetHudTimer();
        } else {
          const nextShowHud = !showHud;
          setShowHud(nextShowHud);
          if (nextShowHud) {
             setActiveHudZone('bar');
             resetHudTimer();
          }
        }
        break;
      case 10009: case 27: // Back
        onClose();
        break;
      case 403: // RED
        handleAction('favorite');
        break;
      case 404: // GREEN
        handleAction('audio');
        break;
      case 405: // YELLOW
        handleAction('guide');
        break;
      case 406: // BLUE
        handleAction('aspect');
        break;
      case 427: // CH+
        if (isLive) handleAction('next');
        break;
      case 428: // CH-
        if (isLive) handleAction('prev');
        break;
      case 38: // UP
        if (isLive) handleAction('miniguide');
        else {
          if (showHud) {
            if (activeHudZone === 'controls') {
              setActiveHudZone('bar');
            } else if (onPrev) {
              onPrev();
            }
          } else if (onPrev) {
            onPrev();
          }
        }
        break;
      case 40: // DOWN
        if (isLive) handleAction('miniguide');
        else {
          if (showHud) {
            if (activeHudZone === 'bar') {
              setActiveHudZone('controls');
            } else if (onNext) {
              onNext();
            }
          } else if (onNext) {
            onNext();
          }
        }
        break;
      case 37: // LEFT
        if (isLive) { handleAction('prev'); }
        else { 
          if (!showHud) {
            setShowHud(true);
            setActiveHudZone('bar');
            handleSeek(-10);
          } else {
            if (activeHudZone === 'bar') {
              handleSeek(-10);
            } else {
              setFocusedControlIdx(p => Math.max(0, p - 1));
            }
          }
        }
        break;
      case 39: // RIGHT
        if (isLive) { handleAction('next'); }
        else { 
          if (!showHud) {
            setShowHud(true);
            setActiveHudZone('bar');
            handleSeek(10);
          } else {
            if (activeHudZone === 'bar') {
              handleSeek(10);
            } else {
              setFocusedControlIdx(p => Math.min(CONTROLS.length - 1, p + 1));
            }
          }
        }
        break;
    }
    if (showHud) resetHudTimer();
  }, [menuMode, showHud, isLive, onNext, onPrev, item, isFavorite, handleAction, resetHudTimer, resetMenuTimer, audioTracks, focusedMenuIdx, channels, subtitleTracks, activeHudZone, isPlaying, focusedControlIdx, guideFocusZone, focusedProgramIdx, getMockEpgList, nowTs]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
     if (menuMode === 'guide' && guideFocusZone === 'channels') {
        const activeEl = containerRef.current?.querySelector('.guide-channel-focused');
        if (activeEl) {
           activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
     }
  }, [focusedMenuIdx, menuMode, guideFocusZone]);

  useEffect(() => {
     if (menuMode === 'guide' && guideFocusZone === 'programs') {
        const activeEl = containerRef.current?.querySelector('.guide-program-focused');
        if (activeEl) {
           activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
     }
  }, [focusedProgramIdx, menuMode, guideFocusZone]);



  // MINI GUIDE SLIDING WINDOW (P26A)
  const visibleChannels = useMemo(() => {
     if (channels.length <= 10) return channels;
     const start = Math.max(0, Math.min(focusedMenuIdx - 4, channels.length - 10));
     return channels.slice(start, start + 10);
  }, [channels, focusedMenuIdx]);

  console.log("FORENSIC: PLAYER_RENDER", { url, itemKey: item?.id, engine, showHud, isPlaying });

  return (
    <div 
      ref={containerRef} 
      className={clsx("fixed inset-0 z-[200] overflow-hidden", PlayerService.isTizen ? "bg-transparent" : "bg-black")}
      data-state={playerState}
    >
      <div className="w-full h-full flex items-center justify-center">
         {!PlayerService.isTizen && <video ref={videoRef} className="w-full h-full object-contain" autoPlay />}
      </div>

      {actionFeedback && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[300] animate-in zoom-in fade-in duration-300">
           <div className="glass p-12 rounded-[40px] flex flex-col items-center gap-6 border border-white/20 shadow-2xl scale-110">
              <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                 <actionFeedback.icon size={50} />
              </div>
              <span className="text-3xl font-black uppercase tracking-tighter italic text-white">{actionFeedback.text}</span>
           </div>
        </div>
      )}

      {/* CLOCK */}
      <div className="absolute top-12 right-12 z-[250]">
         <div className="glass px-10 py-4 rounded-full border border-white/10 shadow-xl">
            <span className="text-3xl font-black font-mono tracking-tighter text-white">{formatClock()}</span>
         </div>
      </div>

      {/* PREMIUM HUD (P27) */}
      <div className={clsx(
        "absolute inset-0 transition-opacity duration-500 bg-gradient-to-t from-black/95 via-black/40 to-transparent",
        showHud && !menuMode ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {isLive ? (
          <div className="absolute bottom-0 left-0 right-0 p-12 animate-in slide-in-from-bottom duration-500">
             <div className="max-w-[1200px] mx-auto glass p-10 rounded-[40px] border border-white/10 shadow-2xl flex gap-10 items-center">
                <div className="w-[200px] h-[200px] glass rounded-3xl p-6 flex items-center justify-center border border-white/10 relative">
                   <img 
                     src={getLogoUrl(item)} 
                     className="w-full h-full object-contain" alt="" 
                     onError={(e) => { e.target.src = 'https://via.placeholder.com/240x240/111/444?text=CH'; }}
                   />
                   <div className="absolute top-4 right-4 bg-red-600 px-3 py-1 rounded text-xs font-black text-white">LIVE</div>
                </div>
                
                <div className="flex-1 flex flex-col gap-4">
                   <div className="flex items-center gap-4">
                      <span className="text-accent text-3xl font-black italic">CH {item?.number || '000'}</span>
                      <h1 className="text-5xl font-black italic tracking-tighter uppercase text-white truncate">{item?.name}</h1>
                      {isFavorite && <Heart fill="#ff3b30" stroke="none" size={32} className="ml-2 animate-pulse" />}
                   </div>

                   <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-end">
                         <h2 className="text-3xl font-bold text-white/90">
                            {nowPlaying ? nowPlaying.name : 'NOW PLAYING'}
                         </h2>
                         <span className="text-xl font-bold font-mono text-white/40 italic">
                            {nowPlaying ? `${formatTimeStr(nowPlaying.start_timestamp)} - ${formatTimeStr(nowPlaying.stop_timestamp)}` : 'No EPG Data'}
                         </span>
                      </div>
                      <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                         <div 
                           className="h-full bg-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.6)] transition-all duration-1000"
                           style={{ width: `${nowPlaying ? calculateProgress(nowPlaying.start_timestamp, nowPlaying.stop_timestamp) : 50}%` }}
                         />
                      </div>
                      {!nowPlaying && (
                         <div className="flex justify-between text-xs font-black text-white/20 uppercase tracking-widest mt-1">
                            <span>Start: --:--</span>
                            <span>End: --:--</span>
                         </div>
                      )}
                      {nowPlaying && (
                         <div className="flex justify-between text-xs font-black text-white/40 uppercase tracking-widest mt-1">
                            <span>Start: {formatTimeStr(nowPlaying.start_timestamp)}</span>
                            <span>End: {formatTimeStr(nowPlaying.stop_timestamp)}</span>
                         </div>
                      )}
                   </div>

                   <div className="flex items-center gap-4 opacity-50 mt-2">
                      <span className="text-xs font-black text-accent border border-accent/30 px-2 py-0.5 rounded italic">NEXT</span>
                      <span className="text-xl font-bold text-white truncate">{nextProgram ? nextProgram.name : 'Schedule Unavailable'}</span>
                      <span className="text-lg font-mono text-white/40 ml-auto italic">
                         {nextProgram ? formatTimeStr(nextProgram.start_timestamp) : '--:--'}
                      </span>
                   </div>
                </div>
             </div>
             
             {/* COLOR LEGEND */}
             <div className="flex justify-center gap-12 mt-8">
                <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-red-600" /><span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Favorite</span></div>
                <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-green-600" /><span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Audio</span></div>
                <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-yellow-400" /><span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Guide</span></div>
                <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-blue-600" /><span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Aspect</span></div>
             </div>
          </div>
        ) : (
          /* VOD HUD - UNCHANGED EXCEPT TIMEOUT */
          <div className="absolute bottom-12 left-12 right-12">
             <div className="mb-12 flex gap-8 items-center">
                <div className="w-24 h-36 glass rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                   <img src={item?.poster || item?.screenshot} className="w-full h-full object-cover" alt="" />
                </div>
                <div>
                   <h1 className="text-7xl font-black italic tracking-tighter uppercase leading-none mb-4 text-white">{item?.name || item?.title}</h1>
                   <div className="flex items-center gap-6 text-white/40 font-black uppercase tracking-[4px] text-lg">
                      <span className="bg-white/10 px-3 py-1 rounded text-sm">{item?.year || '2024'}</span>
                      <span>{item?.season_number ? `Season ${item.season_number} • Episode ${item.number}` : 'Media Library'}</span>
                   </div>
                </div>
             </div>
             <div className="flex items-center gap-6 mb-12">
                 <span className="text-2xl font-mono font-bold text-white/60">{formatMediaTime(currentTime)}</span>
                 <div className={clsx("flex-1 h-3 bg-white/5 rounded-full relative overflow-hidden transition-all duration-200", activeHudZone === 'bar' ? "ring-2 ring-accent/50 scale-y-125" : "border border-white/5")}>
                    <div 
                      className="absolute left-0 top-0 h-full bg-accent shadow-focus transition-all duration-500" 
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    />
                    {activeHudZone === 'bar' && (
                       <div 
                         className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-accent shadow-[0_0_10px_rgba(255,255,255,0.8)] -ml-2.5 transition-all duration-500"
                         style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
                       />
                    )}
                 </div>
                 <span className="text-2xl font-mono font-bold text-white/60">{"-" + formatMediaTime(Math.max(0, duration - currentTime))}</span>
              </div>
             <div className="flex justify-between items-center">
                <div className="flex gap-6">
                   {CONTROLS.map((ctrl, i) => {
                      const Icon = ctrl.icon;
                      const isFocused = activeHudZone === 'controls' && focusedControlIdx === i;
                      return (
                         <div key={ctrl.id} className={clsx("flex flex-col items-center gap-3 p-6 rounded-[32px] transition-all border-2", isFocused ? "bg-white text-black border-white scale-110 shadow-focus" : "glass text-white/60 border-white/5")}>
                            <Icon size={32} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{ctrl.label}</span>
                         </div>
                      );
                   })}
                </div>
             </div>
          </div>
        )}
      </div>

      {/* COMPACT AUDIO/CC (P30) */}
      {(menuMode === 'audio' || menuMode === 'subtitle') && (
         <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[400] animate-in fade-in duration-300">
            <div className="w-[450px] glass p-10 rounded-[50px] border border-white/10 shadow-2xl">
               <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-8 text-accent border-b border-white/5 pb-6 flex items-center gap-4">
                  {menuMode === 'audio' ? <Languages size={32} /> : <Subtitles size={32} />}
                  {menuMode === 'audio' ? 'Audio Selection' : 'Subtitles'}
               </h2>
               <div className="flex flex-col gap-3">
                  {(menuMode === 'audio' ? audioTracks : subtitleTracks).length > 0 ? (menuMode === 'audio' ? audioTracks : subtitleTracks).map((entry, index) => (
                    <div 
                      key={index} 
                      className={clsx(
                        "p-6 rounded-2xl font-bold text-xl transition-all border-2 flex items-center justify-between", 
                        focusedMenuIdx === index ? "bg-white text-black border-white scale-105 shadow-focus" : 
                        entry.active ? "bg-accent/20 text-accent border-accent/40" : "bg-white/5 text-white/40 border-transparent"
                      )}
                    >
                       <span className="truncate flex-1">
                          {entry.language || (menuMode === 'audio' ? `Audio Track ${index + 1}` : `Subtitle ${index + 1}`)}
                       </span>
                       {entry.active && (
                          <div className={clsx("w-3 h-3 rounded-full", focusedMenuIdx === index ? "bg-black" : "bg-accent")} />
                       )}
                    </div>
                  )) : <div className="text-white/20 text-xl font-bold text-center py-6">None available</div>}
               </div>
            </div>
         </div>
      )}

      {/* COMPACT MINI GUIDE (P26) */}
      {menuMode === 'miniguide' && (
         <div className="absolute inset-x-0 bottom-0 z-[500] animate-in slide-in-from-bottom duration-300 bg-gradient-to-t from-black via-black/95 to-black/85 backdrop-blur-3xl border-t border-white/10 p-8 flex flex-col gap-5 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
            {/* EPG Preview Row at Top of Mini Guide */}
            {(() => {
               const ch = channels[focusedMenuIdx];
               const currentProg = focusedChannelEpg.find(p => nowTs >= p.start_timestamp && nowTs < p.stop_timestamp);
               const nextProg = focusedChannelEpg.find(p => p.start_timestamp > nowTs);
               const curPlayingName = currentProg?.name || currentProg?.title || ch?.cur_playing || 'Live Broadcast';
               const nextPlayingName = nextProg?.name || nextProg?.title || ch?.epg?.[1]?.name || 'Next Program';
               
               return (
                  <div className="max-w-[1700px] mx-auto w-full flex items-center justify-between border-b border-white/5 pb-4 px-2">
                     <div className="flex items-center gap-6 flex-1 min-w-0">
                        <span className="text-accent text-3xl font-black italic shrink-0">CH {ch?.number || '000'}</span>
                        <span className="text-2xl font-black italic uppercase text-white tracking-tight shrink-0">{ch?.name}</span>
                        <span className="text-lg font-bold text-white/50 truncate pr-4">{curPlayingName}</span>
                     </div>
                     <div className="text-[10px] font-black tracking-widest text-accent uppercase bg-accent/15 px-3 py-1.5 rounded-xl border border-accent/20 shrink-0 max-w-[40%] truncate">
                        NEXT: {nextPlayingName}
                     </div>
                  </div>
               );
            })()}

            {/* Sliding Carousel Row */}
            <div className="max-w-[1700px] mx-auto w-full overflow-hidden relative py-3 px-2 flex items-center justify-center">
               <div 
                  className="flex gap-6 transition-transform duration-300 py-1"
                  style={{
                     transform: `translateX(calc(50vw - 180px - ${(focusedMenuIdx - Math.max(0, Math.min(focusedMenuIdx - 4, channels.length - 10))) * 344}px))`
                  }}
               >
                  {visibleChannels.map((ch, index) => {
                     const globalIdx = channels.findIndex(c => c.id === ch.id);
                     const isFocused = focusedMenuIdx === globalIdx;
                     const isActive = item.id === ch.id;
                     
                     return (
                        <div 
                           key={ch.id} 
                           className={clsx(
                              "w-[320px] p-4 rounded-2xl flex items-center gap-4 transition-all border shrink-0 select-none",
                              isFocused 
                                ? "bg-white text-black border-white scale-110 shadow-focus z-10" 
                                : (isActive 
                                    ? "bg-accent/10 border-accent/30 text-accent" 
                                    : "bg-white/5 text-white/45 border-white/5 hover:bg-white/10"
                                  )
                           )}
                        >
                           <div className="w-12 h-12 glass rounded-lg flex items-center justify-center p-1.5 border border-white/10">
                              <img 
                                src={getLogoUrl(ch)} 
                                className="w-full h-full object-contain" 
                                alt="" 
                                onError={(e) => { e.target.src = 'https://via.placeholder.com/64x64/111/444?text=CH'; }} 
                              />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                 <span className={clsx("font-black text-[10px]", isFocused ? "text-black/40" : "text-white/30")}>
                                    CH {ch.number}
                                 </span>
                                 <span className="font-black italic uppercase truncate text-sm">
                                    {ch.name}
                                 </span>
                              </div>
                              <p className={clsx("text-[10px] font-bold truncate opacity-50 uppercase tracking-tighter", isFocused ? "text-black/60" : "text-white/50")}>
                                 {ch.cur_playing || 'Live Broadcast'}
                              </p>
                              {isFocused && ch.epg?.[0] && (
                                 <div className="w-full h-1 bg-black/10 rounded-full mt-1.5 overflow-hidden">
                                    <div 
                                       className="h-full bg-accent"
                                       style={{ width: `${calculateProgress(ch.epg[0].start_timestamp, ch.epg[0].stop_timestamp)}%` }}
                                    />
                                 </div>
                              )}
                           </div>
                        </div>
                     );
                  })}
               </div>
            </div>
         </div>
      )}

      {/* FULL EPG GUIDE (P28) */}
      {menuMode === 'guide' && (() => {
         const channel = channels[focusedMenuIdx];
         const epgList = (focusedChannelEpg && focusedChannelEpg.length > 0)
            ? focusedChannelEpg
            : (channel?.epg && channel.epg.length > 0 ? channel.epg : getMockEpgList(nowTs));
         const selectedProgram = epgList[guideFocusZone === 'programs' ? focusedProgramIdx : 0] || epgList[0];

         return (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-[600] flex flex-col p-20 animate-in fade-in duration-300">
               {/* Header Row */}
               <div className="flex items-center justify-between mb-12">
                  <div className="flex items-center gap-8">
                     <div className="w-20 h-20 bg-accent/15 rounded-3xl flex items-center justify-center text-accent border border-accent/25">
                        <Calendar size={40} />
                     </div>
                     <div>
                        <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none text-white">Program Guide</h1>
                        <p className="text-lg font-black text-white/30 mt-2 uppercase tracking-[4px]">{activeProvider?.name} • {formatClock()}</p>
                     </div>
                  </div>
                  
                  <div className="flex flex-col items-end text-right">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 glass rounded-lg flex items-center justify-center p-1">
                           <img src={getLogoUrl(channel)} className="w-full h-full object-contain" alt="" />
                        </div>
                        <h3 className="text-3xl font-black text-accent italic uppercase">{channel?.name}</h3>
                     </div>
                     <p className="text-lg font-bold text-white/40 mt-1 uppercase tracking-wider">CH {channel?.number || '000'}</p>
                  </div>
               </div>

               <div className="flex-1 flex gap-12 overflow-hidden">
                  {/* CHANNEL LIST (LEFT COLUMN) */}
                  <div className="w-[500px] flex flex-col gap-4 overflow-y-auto pr-4 custom-scrollbar">
                     {channels.map((ch, index) => {
                        const isFocused = guideFocusZone === 'channels' && focusedMenuIdx === index;
                        const isSelected = focusedMenuIdx === index; // Visual marker if program list is focused
                        const isActive = item.id === ch.id;

                        return (
                           <div 
                              key={ch.id} 
                              className={clsx(
                                 "p-5 rounded-2xl flex items-center gap-5 transition-all border select-none",
                                 isFocused && "guide-channel-focused",
                                 isFocused 
                                   ? "bg-white text-black border-white scale-[1.02] shadow-focus z-10" 
                                   : (isSelected 
                                       ? "bg-white/10 border-white/20 text-white" 
                                       : (isActive ? "bg-accent/10 border-accent/20 text-accent" : "bg-white/5 border-transparent text-white/40 hover:bg-white/[0.08]")
                                     )
                              )}
                           >
                              <span className="w-12 font-black text-lg opacity-40">{ch.number}</span>
                              <div className="w-10 h-10 glass rounded-lg flex items-center justify-center p-1.5">
                                 <img src={getLogoUrl(ch)} className="w-full h-full object-contain" alt="" />
                              </div>
                              <span className="flex-1 font-black italic uppercase truncate text-lg">{ch.name}</span>
                              {isFocused && (
                                 <svg className="w-5 h-5 text-black shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                 </svg>
                              )}
                           </div>
                        );
                     })}
                  </div>

                  {/* PROGRAM DETAILS & TIMELINE (RIGHT COLUMN) */}
                  <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                     {/* Preview details of currently highlighted program */}
                     <div className="glass p-8 rounded-[30px] border border-white/10 flex flex-col gap-4 bg-black/40">
                        <div className="flex justify-between items-center">
                           <span className="text-accent font-black tracking-[8px] text-[10px] uppercase">
                              {guideFocusZone === 'programs' ? 'SELECTED SHOW INFO' : 'CURRENTLY BROADCASTING'}
                           </span>
                           {guideFocusZone === 'programs' && (
                              <span className="text-[10px] font-black tracking-wider text-white/40 uppercase bg-white/5 px-2.5 py-1 rounded">
                                 PRESS LEFT TO BACK
                              </span>
                           )}
                        </div>
                        <h2 className="text-3xl font-black italic tracking-tighter uppercase text-white leading-tight">
                           {selectedProgram?.name || selectedProgram?.title}
                        </h2>
                        <div className="flex items-center gap-4 text-lg font-bold text-white/40 italic">
                           <Clock size={18} /> 
                           {selectedProgram ? `${formatTimeStr(selectedProgram.start_timestamp)} - ${formatTimeStr(selectedProgram.stop_timestamp)}` : 'Continuous Broadcast'}
                        </div>
                        <p className="text-base text-white/60 leading-relaxed font-medium line-clamp-3">
                           {selectedProgram?.descr || selectedProgram?.description || "No details available. Watch high-definition streaming directly from the portal."}
                        </p>
                     </div>

                     {/* EPG Timeline list */}
                     <div className="glass p-6 rounded-[30px] border border-white/10 flex-1 flex flex-col overflow-hidden bg-black/20">
                        <h3 className="text-xs font-black tracking-widest text-white/40 uppercase mb-4 pl-1 flex justify-between items-center">
                           <span>PROGRAM TIMELINE</span>
                           {focusedChannelEpgLoading && <span className="text-[10px] text-accent animate-pulse font-bold tracking-widest uppercase">Fetching Live Schedule...</span>}
                        </h3>
                        <div className="flex-1 overflow-y-auto flex flex-col gap-3 custom-scrollbar">
                           {epgList.map((prog, idx) => {
                              const isProgFocused = guideFocusZone === 'programs' && focusedProgramIdx === idx;
                              const isCurrent = idx === 0;

                              return (
                                 <div
                                    key={idx}
                                    className={clsx(
                                       "p-4 rounded-xl flex items-center justify-between transition-all border select-none",
                                       isProgFocused && "guide-program-focused",
                                       isProgFocused 
                                         ? "bg-white text-black border-white scale-[1.01] shadow-focus z-10" 
                                         : (isCurrent 
                                             ? "bg-accent/15 border-accent/20 text-accent font-black" 
                                             : "bg-white/5 border-transparent text-white/50 hover:bg-white/[0.08]"
                                           )
                                    )}
                                 >
                                    <div className="flex items-center gap-4 min-w-0">
                                       <span className={clsx("font-bold text-xs shrink-0 font-mono", isProgFocused ? "text-black/50" : "text-white/30")}>
                                          {formatTimeStr(prog.start_timestamp)}
                                       </span>
                                       <span className="font-black italic uppercase truncate text-base">
                                          {prog.name || prog.title}
                                       </span>
                                    </div>
                                    {isCurrent && (
                                       <span className="text-[9px] font-black tracking-widest uppercase bg-red-600 text-white px-2 py-0.5 rounded shrink-0">
                                          LIVE
                                       </span>
                                    )}
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  </div>
               </div>

               {/* COLOR LEGEND BOTTOM */}
               <div className="flex justify-center gap-12 mt-12 pt-8 border-t border-white/5">
                   <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-red-600" /><span className="text-xs font-black text-white/40 uppercase tracking-widest">Favorite</span></div>
                   <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-green-600" /><span className="text-xs font-black text-white/40 uppercase tracking-widest">Audio / CC</span></div>
                   <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-yellow-400" /><span className="text-xs font-black text-white/40 uppercase tracking-widest">Close Guide</span></div>
                   <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-blue-600" /><span className="text-xs font-black text-white/40 uppercase tracking-widest">Screen Mode</span></div>
               </div>
            </div>
         );
      })()}

      {/* BUFFERING OVERLAY */}
      {playerState === "BUFFERING" && (
         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-[350]">
            <div className="w-32 h-32 border-[12px] border-accent/20 border-t-accent rounded-full animate-spin mb-10 shadow-[0_0_50px_rgba(var(--accent-rgb),0.3)]" />
            <p className="text-4xl font-black uppercase tracking-[15px] italic animate-pulse text-white">Buffering {bufferingPercent}%</p>
         </div>
      )}
    </div>
  );
};

export default Player;
