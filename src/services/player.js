/**
 * Service for controlling media playback on Samsung Tizen (AVPlay)
 * and standard browsers (HLS.js / HTML5)
 */
class PlayerService {
  constructor() {
    this.isTizen = typeof window.webapis !== 'undefined' && !!window.webapis.avplay;
    this.isNative = false; // Tracks if native hardware (AVPlay) is being used
    this.currentState = "IDLE";
    this.listeners = {};
    this.aspectRatio = "Fit";
    this.watchdogTimer = null;
    this.recoveryAttempts = 0;
    this.bufferingStartTime = null;
    this.hls = null;
    this.mpegtsPlayer = null;
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
    console.log(`[PlayerService][${timestamp}] ${message}`, data || "");
  }

  clearWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  resetWatchdog() {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (this.currentState === "BUFFERING") {
          this.performRecovery();
      }
    }, 15000); // 15s safety timeout for slow streams / 4K content
  }

  initialize(videoElement, listeners = {}) {
    this.videoElement = videoElement;
    this.listeners = listeners;
    this.currentUrl = null;

    if (this.isTizen) {
      this.log("Tizen AVPlay initialized");
    } else {
      this.log("Browser Player initialized (HLS.js Fallback Available)");
    }
  }

  async performRecovery() {
    if (this.recoveryAttempts >= 3) {
      this.log("[AVPLAY RECOVERY FAILED] Max attempts reached");
      this.setState("ERROR");
      if (this.listeners.onerror) this.listeners.onerror("Max recovery attempts reached");
      return;
    }

    this.recoveryAttempts++;
    this.log(`[AVPLAY RECOVERY ATTEMPT #${this.recoveryAttempts}]`);
    
    try {
      const avplay = window.webapis.avplay;
      const currentTime = avplay.getCurrentTime();
      this.log(`[AVPLAY STALL DETECTED] original position: ${currentTime}`);
      
      avplay.seekTo(currentTime + 1000);
      this.log(`[AVPLAY RECOVERY SUCCESS] recovery position: ${currentTime + 1000}`);
    } catch (e) {
      this.log("[AVPLAY RECOVERY FAILED] seek error", e.message);
    }
  }

  async play(url, options = {}) {
    console.log("PLAYER_OPEN_URL", url);
    if (!url) {
      this.log("Error: No URL provided for playback");
      return;
    }

    const engine = options.engine || 'auto';
    console.log("PLAYBACK_ENGINE_ACTUAL", engine);
    console.log("PLAY_START", url);

    if (this.currentUrl === url && (this.currentState === "PREPARING" || this.currentState === "PLAYING")) {
      this.log("Ignoring duplicate playback request for same URL");
      return;
    }
    
    this.log("PLAY URL", url);
    this.currentUrl = url;
    this.stop();
    
    this.setState("PREPARING");
    console.log("PLAYER_PREPARE");
    
    this.log(`Engine preference: ${engine}`);
    console.log("PLAYBACK_ENGINE_ACTUAL", engine);

    if (this.isTizen && window.webapis?.avplay) {
      if (engine === 'avplayer' || engine === 'auto') {
        this.isNative = true;
        return this.playAVPlay(url, options);
      }
    }
    
    this.isNative = false;
    return this.playHTML5(url, options);
  }

  async playHTML5(url, options = {}) {
    try {
      this.log(`HTML5 Play: ${url}`);
      if (!this.videoElement) {
        this.log("Error: Video element not initialized");
        this.setState("ERROR");
        return false;
      }

      const decodedUrl = decodeURIComponent(url);
      const isTs = decodedUrl.includes('extension=ts') || decodedUrl.includes('.ts') || decodedUrl.includes('type=itv');
      let engine = options.engine || 'auto';
      if (isTs && window.mpegts && window.mpegts.isSupported()) {
        this.log("Forcing mpegts engine for TS stream");
        engine = 'mpegts';
      } else if (engine === 'auto') {
        if (window.Hls && window.Hls.isSupported()) {
          engine = 'hlsjs';
        } else {
          engine = 'html5';
        }
      }

      console.log("FINAL_PLAY_URL", url);
      console.log("PLAYER_ENGINE", engine);
      console.log("IS_NATIVE", false);

      if (engine === 'mpegts' && window.mpegts && window.mpegts.isSupported()) {
        this.log("Using mpegts.js engine");
        if (this.mpegtsPlayer) {
          try {
            this.mpegtsPlayer.unload();
            this.mpegtsPlayer.detachMediaElement();
            this.mpegtsPlayer.destroy();
          } catch(e){}
          this.mpegtsPlayer = null;
        }

        this.mpegtsPlayer = window.mpegts.createPlayer({
          type: 'mpegts',
          isLive: true,
          url: url
        }, {
          enableStashBuffer: false,
          liveBufferLatencyChasing: true
        });

        this.mpegtsPlayer.attachMediaElement(this.videoElement);
        this.mpegtsPlayer.load();

        console.log("PLAYER_PLAY");
        this.mpegtsPlayer.play().catch(e => {
          if (e.name !== 'AbortError') console.error("PLAYER_ERROR", e);
        });
        this.setState("PLAYING");

        this.mpegtsPlayer.on(window.mpegts.Events.ERROR, (type, detail, info) => {
          console.error("MPEGTS_ERROR", { type, detail, info });
          this.log(`mpegts.js error: ${type} - ${detail}`, info);
          this.setState("ERROR");
        });
      } else if (engine === 'hlsjs' && window.Hls && window.Hls.isSupported()) {
        this.log("Using HLS.js engine");
        if (this.hls) {
          this.hls.destroy();
        }

        this.hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true
        });

        this.hls.loadSource(url);
        this.hls.attachMedia(this.videoElement);

        this.hls.on(window.Hls.Events.MEDIA_ATTACHING, (event, data) => console.log('HLS_EVENT: MEDIA_ATTACHING', JSON.stringify(data, null, 2)));
        this.hls.on(window.Hls.Events.MEDIA_ATTACHED, (event, data) => console.log('HLS_EVENT: MEDIA_ATTACHED', JSON.stringify(data, null, 2)));
        this.hls.on(window.Hls.Events.MANIFEST_LOADING, (event, data) => console.log('HLS_EVENT: MANIFEST_LOADING', JSON.stringify(data, null, 2)));
        this.hls.on(window.Hls.Events.MANIFEST_LOADED, (event, data) => console.log('HLS_EVENT: MANIFEST_LOADED', JSON.stringify({ url: data.url, levels: data.levels?.length }, null, 2)));
        
        this.hls.on(window.Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log('HLS_EVENT: MANIFEST_PARSED', JSON.stringify(data, null, 2));
          console.log("PLAYER_PLAY");
          this.videoElement.play().catch(e => {
             if (e.name !== 'AbortError') console.error("PLAYER_ERROR", e);
          });
          this.setState("PLAYING");
        });

        this.hls.on(window.Hls.Events.LEVEL_LOADING, (event, data) => console.log('HLS_EVENT: LEVEL_LOADING', JSON.stringify(data, null, 2)));
        this.hls.on(window.Hls.Events.LEVEL_LOADED, (event, data) => console.log('HLS_EVENT: LEVEL_LOADED', JSON.stringify({ level: data.level, details: data.details }, null, 2)));
        
        this.hls.on(window.Hls.Events.AUDIO_TRACK_LOADING, (event, data) => console.log('HLS_EVENT: AUDIO_TRACK_LOADING', JSON.stringify(data, null, 2)));
        this.hls.on(window.Hls.Events.AUDIO_TRACK_LOADED, (event, data) => console.log('HLS_EVENT: AUDIO_TRACK_LOADED', JSON.stringify(data, null, 2)));
        
        this.hls.on(window.Hls.Events.SUBTITLE_TRACK_LOADING, (event, data) => console.log('HLS_EVENT: SUBTITLE_TRACK_LOADING', JSON.stringify(data, null, 2)));
        this.hls.on(window.Hls.Events.SUBTITLE_TRACK_LOADED, (event, data) => console.log('HLS_EVENT: SUBTITLE_TRACK_LOADED', JSON.stringify(data, null, 2)));
        
        this.hls.on(window.Hls.Events.FRAG_LOADING, (event, data) => console.log('HLS_EVENT: FRAG_LOADING', JSON.stringify({ sn: data.frag?.sn, url: data.frag?.url }, null, 2)));
        this.hls.on(window.Hls.Events.FRAG_LOADED, (event, data) => console.log('HLS_EVENT: FRAG_LOADED', JSON.stringify({ sn: data.frag?.sn, url: data.frag?.url }, null, 2)));
        
        this.hls.on(window.Hls.Events.BUFFER_APPENDING, (event, data) => console.log('HLS_EVENT: BUFFER_APPENDING', JSON.stringify({ type: data.type }, null, 2)));
        this.hls.on(window.Hls.Events.BUFFER_APPENDED, (event, data) => console.log('HLS_EVENT: BUFFER_APPENDED', JSON.stringify({ type: data.type }, null, 2)));

        this.hls.on(window.Hls.Events.ERROR, (event, data) => {
          console.log('HLS_EVENT: ERROR', JSON.stringify(data, null, 2));
          if (data.fatal) {
            console.error("PLAYER_ERROR", data);
            this.log("HLS.js: Fatal error", data.type);
            this.setState("ERROR");
            this.hls.destroy();
          }
        });
      } else {
        this.log("Using Native HTML5 engine");
        this.videoElement.src = url;
        try {
          await this.videoElement.play();
          console.log("PLAYER_PLAY");
          this.setState("PLAYING");
        } catch (e) {
          if (e.name !== 'AbortError') {
             console.error("PLAYER_ERROR", e.message);
             this.setState("ERROR");
          }
        }
      }

      return true;
    } catch (err) {
      this.log("HTML5 Play Error", err.message);
      console.error("PLAYER_ERROR", err.message);
      this.setState("ERROR");
      return false;
    }
  }

  async playAVPlay(url, options) {
    this.recoveryAttempts = 0;
    try {
      if (!this.isTizen || !window.webapis.avplay) {
        this.log("AVPlay: Not supported");
        this.setState("ERROR");
        return false;
      }

      const avplay = window.webapis.avplay;
      
      let finalUrl = url;
      let isHls = false;
      if (finalUrl.includes('proxy-stream')) {
          const decoded = decodeURIComponent(finalUrl).toLowerCase();
          isHls = decoded.includes('m3u8');
          const isTs = decoded.includes('extension=ts') || decoded.includes('.ts') || decoded.includes('type=itv');
          
          let extension = '.ts';
          if (isHls) {
              extension = '.m3u8';
          } else if (isTs) {
              extension = '.ts';
          } else if (options?.type === 'channel') {
              extension = '.ts';
          }
          
          if (!finalUrl.includes('#')) {
              finalUrl += `#${extension}`;
          }
      }

      console.log("[OPEN_URL]", finalUrl);
      console.log("FINAL_PLAY_URL", finalUrl);
      console.log("PLAYER_ENGINE", "AVPlay");
      console.log("IS_NATIVE", true);

      console.log("[AVPLAY] open");
      console.log(`[AVPLAY_OPEN] url: ${finalUrl}`);
      this.log("AVPlay: Calling open()", finalUrl);
      avplay.open(finalUrl);
      
      this.applyAspectRatio(this.aspectRatio);

      // Fast startup buffering optimization
      try {
        avplay.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", 2000);
        avplay.setBufferingParam("PLAYER_BUFFER_FOR_RESUME", 1000);
        
        if (finalUrl.includes('proxy-stream') && isHls) {
           avplay.setStreamingProperty("COMPONENT", "HLS");
        }

        avplay.setStreamingProperty("ADAPTIVE_INFO", "STARTBITRATE=HIGHEST");

        if (options.mac) {
           const mac = options.mac;
           const magUA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
           const headers = `User-Agent: ${magUA}|X-STB-MAC: ${mac}|Cookie: mac=${mac}`;
           avplay.setStreamingProperty("HTTP_HEADERS", headers);
        }

        this.log("AVPlay: Streaming properties configured");
      } catch (e) {
        this.log("AVPlay: Failed to set buffering/streaming params", e.message);
      }
      
      const listener = {
        onbufferingstart: () => {
          this.log("[AVPLAY BUFFER START]");
          this.setState("BUFFERING");
          this.bufferingStartTime = Date.now();
          this.resetWatchdog();
          if (this.listeners.onbufferingstart) this.listeners.onbufferingstart();
        },
        onbufferingprogress: (percent) => {
          this.log(`[AVPLAY BUFFER PROGRESS] ${percent}%`);
          this.resetWatchdog();
          if (this.listeners.onbufferingprogress) this.listeners.onbufferingprogress(percent);
        },
        onbufferingcomplete: () => {
          this.log("[AVPLAY BUFFER COMPLETE]");
          this.setState("PLAYING");
          this.clearWatchdog();
          this.bufferingStartTime = null;
          this.recoveryAttempts = 0;
          if (this.listeners.onbufferingcomplete) this.listeners.onbufferingcomplete();
        },
        oncurrentplaytime: (time) => {
          if (this.listeners.ontimeupdate) this.listeners.ontimeupdate(time);
        },
        onstreamcompleted: () => {
          this.log("[AVPLAY STREAM COMPLETED]");
          this.stop();
          if (this.listeners.onstreamcompleted) this.listeners.onstreamcompleted();
        },
        onerror: (error) => {
          this.log("[AVPLAY ERROR]", error);
          console.error("PLAYER_ERROR", error);
          this.setState("ERROR");
          if (this.listeners.onerror) this.listeners.onerror(error);
        }
      };
      
      avplay.setListener(listener);
      
      console.log("[AVPLAY_PREPARE]");
      this.log("AVPlay: Calling prepareAsync()");
      this.setState("PREPARING");
      
      return new Promise((resolve, reject) => {
        avplay.prepareAsync(() => {
          console.log("[AVPLAY_PREPARE_SUCCESS]");
          this.log("AVPlay: prepareAsync SUCCESS -> Performing Track Audit");

          // FORENSIC TRACK ANALYSIS
          try {
            const tracks = avplay.getTotalTrackInfo();
            const stream = avplay.getCurrentStreamInfo();
            
            console.log("AVPLAY_STATE", avplay.getState());
            console.log("AVPLAY_TOTAL_TRACKS", JSON.stringify(tracks));
            console.log("AVPLAY_STREAM_INFO", JSON.stringify(stream));
            console.log("VIDEO_TRACK_COUNT", tracks.filter(t => t.type === "VIDEO").length);
            console.log("AUDIO_TRACK_COUNT", tracks.filter(t => t.type === "AUDIO").length);
            
            const videoTrack = tracks.find(t => t.type === "VIDEO");
            if (videoTrack) {
              console.log("AVPLAY_SELECTING_VIDEO_TRACK", videoTrack.index);
              avplay.setSelectTrack("VIDEO", videoTrack.index);
            }
          } catch (e) { 
            console.error("Forensic Log Failure", e);
            this.log("AVPlay: Forensic Log Failure", e.message);
          }

          console.log("[AVPLAY_PLAY]");
          console.log("PLAYER_PLAY");
          this.log("AVPlay: Calling play()");
          avplay.play();
          this.setState("PLAYING");
          this.applyAspectRatio(this.aspectRatio);
          resolve(true);
        }, (err) => {
          this.log("AVPlay: prepareAsync FAILED", err);
          console.error("PLAYER_ERROR", err);
          this.setState("ERROR");
          try { avplay.close(); } catch (e) {}
          reject(err);
        });
      });
      
    } catch (e) {
      this.log("AVPlay: Critical Exception", e.message);
      console.error("PLAYER_ERROR", e.message);
      this.setState("ERROR");
      try { 
        if (window.webapis && window.webapis.avplay) window.webapis.avplay.close(); 
      } catch (closeErr) {}
      return false;
    }
  }

  setState(state) {
    if (this.currentState !== state) {
      this.log(`STATE_CHANGE: ${this.currentState} -> ${state}`);
      this.currentState = state;
      if (this.listeners.onStateChange) this.listeners.onStateChange(state);
    }
  }

  pause() {
    if (this.isTizen && window.webapis.avplay) {
      try { window.webapis.avplay.pause(); this.setState("PAUSED"); } catch (e) {}
    } else if (this.videoElement) {
      this.videoElement.pause();
      this.setState("PAUSED");
    }
  }

  resume() {
    if (this.isTizen && window.webapis.avplay) {
      try { window.webapis.avplay.play(); this.setState("PLAYING"); } catch (e) {}
    } else if (this.videoElement) {
      this.videoElement.play();
      this.setState("PLAYING");
    }
  }

  stop() {
    clearTimeout(this.watchdogTimer);
    clearTimeout(this.seekDebounceTimer);
    this.seekDebounceTimer = null;
    this.virtualSeekTime = undefined;
    this.lastSeekTime = undefined;
    
    if (this.hls) {
      this.log("Destroying HLS instance");
      this.hls.destroy();
      this.hls = null;
    }

    if (this.mpegtsPlayer) {
      this.log("Destroying mpegts player instance");
      try {
        this.mpegtsPlayer.unload();
        this.mpegtsPlayer.detachMediaElement();
        this.mpegtsPlayer.destroy();
      } catch (e) {
        this.log("Error destroying mpegts player:", e.message);
      }
      this.mpegtsPlayer = null;
    }

    if (this.isTizen && window.webapis.avplay) {
      const avplay = window.webapis.avplay;
      try {
        if (this.currentState !== "IDLE" && this.currentState !== "NONE") {
          avplay.stop();
        }
        avplay.close();
        this.setState("IDLE");
      } catch (e) {}
    } else if (this.videoElement) {
      this.log("[VIDEO RESET]");
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
      this.setState("IDLE");
    }
  }

  seek(deltaMs) {
    console.log("SEEK_REQUEST", deltaMs);
    const now = Date.now();
    const duration = this.getDuration() || 0;

    let baseTime;
    if (this.lastSeekTime && (now - this.lastSeekTime < 2000) && this.virtualSeekTime !== undefined) {
      baseTime = this.virtualSeekTime;
    } else {
      baseTime = this.getCurrentTime();
    }

    let targetTime = baseTime + deltaMs;
    if (duration > 0) {
      targetTime = Math.max(0, Math.min(duration - 1000, targetTime));
    } else {
      targetTime = Math.max(0, targetTime);
    }

    this.virtualSeekTime = targetTime;
    this.lastSeekTime = now;
    this.log(`Virtual Seek: ${baseTime} -> ${targetTime} (delta: ${deltaMs})`);

    // Debounce the actual native seek by 600ms
    clearTimeout(this.seekDebounceTimer);
    this.seekDebounceTimer = setTimeout(() => {
      this.executeNativeSeek();
    }, 600);
  }

  confirmSeek() {
    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
      this.seekDebounceTimer = null;
      this.executeNativeSeek();
    }
  }

  executeNativeSeek() {
    if (this.virtualSeekTime === undefined) return;
    const targetTime = this.virtualSeekTime;
    this.log(`Executing Native Seek to: ${targetTime}`);

    if (this.isTizen && window.webapis.avplay) {
      try {
        const state = window.webapis.avplay.getState();
        this.log(`AVPlay Native Seek Attempt: State=${state}`);
        if (state === "PLAYING" || state === "PAUSED") {
           window.webapis.avplay.seekTo(targetTime);
        }
      } catch (e) { this.log("AVPlay Native Seek Error", e.message); }
    } else if (this.videoElement) {
      this.videoElement.currentTime = targetTime / 1000;
    }
  }

  getDuration() {
    if (this.isTizen && window.webapis.avplay) {
      try { return window.webapis.avplay.getDuration(); } catch (e) { return 0; }
    } else if (this.videoElement) {
      return this.videoElement.duration * 1000;
    }
    return 0;
  }

  getCurrentTime() {
    const now = Date.now();
    if (this.lastSeekTime && (now - this.lastSeekTime < 2000) && this.virtualSeekTime !== undefined) {
      return this.virtualSeekTime;
    }
    if (this.isTizen && window.webapis.avplay) {
      try { return window.webapis.avplay.getCurrentTime(); } catch (e) { return 0; }
    } else if (this.videoElement) {
      return this.videoElement.currentTime * 1000;
    }
    return 0;
  }

  applyAspectRatio(mode) {
    this.aspectRatio = mode;
    this.log(`Applying Aspect Ratio: ${mode}`);
    console.log("ASPECT_MODE", mode);
    
    if (this.isTizen && window.webapis.avplay) {
      const avplay = window.webapis.avplay;
      try {
        const w = window.innerWidth || 1920;
        const h = window.innerHeight || 1080;
        
        const rects = {
          Fit: [0, 0, w, h],
          Fill: [0, 0, w, h],
          Stretch: [0, 0, w, h],
          Original: [Math.floor(w/4), Math.floor(h/4), Math.floor(w/2), Math.floor(h/2)]
        };
        const rect = rects[mode] || rects.Fit;
        console.log("[AVPLAY] setDisplayRect");
        console.log(`[AVPLAY_RECT] Mapping to physical viewport: ${rect.join(',')}`);
        avplay.setDisplayRect(...rect);
        
        let method = "";
        if (mode === "Stretch") {
          method = "PLAYER_DISPLAY_MODE_STRETCH";
        } else if (mode === "Fill") {
          method = "PLAYER_DISPLAY_MODE_FULL_SCREEN";
        } else {
          method = "PLAYER_DISPLAY_MODE_LETTER_BOX";
        }
        console.log("[AVPLAY] setDisplayMethod");
        console.log(`[AVPLAY_METHOD] ${method}`);
        console.log("DISPLAY_METHOD", method);
        avplay.setDisplayMethod(method);
      } catch (e) {
        console.log("[AVPLAY API ERROR]", e.name, e.message);
        this.log("AVPlay Aspect Ratio Error", e.message);
      }
    } else if (this.videoElement) {
      if (mode === "Stretch") this.videoElement.style.objectFit = "fill";
      else if (mode === "Fill") this.videoElement.style.objectFit = "cover";
      else if (mode === "Original") this.videoElement.style.objectFit = "none";
      else this.videoElement.style.objectFit = "contain";
    }
  }

  getAudioTracks() {
    if (this.isTizen && window.webapis.avplay) {
      try {
        const tracks = window.webapis.avplay.getTotalTrackInfo();
        return tracks
          .filter(t => t.type === "AUDIO")
          .map(t => {
            let lang = "";
            if (t.extra_info) {
              try {
                const info = typeof t.extra_info === 'string' ? JSON.parse(t.extra_info) : t.extra_info;
                lang = info.language || info.lang || "";
              } catch (e) {}
            }
            return {
              index: t.index,
              language: lang ? lang.toUpperCase() : `Audio Track ${t.index}`
            };
          });
      } catch (e) { return []; }
    } else if (this.hls) {
      try {
        return this.hls.audioTracks.map((t, idx) => ({
          index: idx,
          language: t.name || t.lang || `Audio Track ${idx + 1}`
        }));
      } catch (e) { return []; }
    } else if (this.videoElement && this.videoElement.audioTracks) {
      try {
        const tracks = [];
        for (let i = 0; i < this.videoElement.audioTracks.length; i++) {
          const t = this.videoElement.audioTracks[i];
          tracks.push({
            index: i,
            language: t.label || t.language || `Audio Track ${i + 1}`
          });
        }
        return tracks;
      } catch (e) { return []; }
    }
    return [];
  }

  setAudioTrack(index) {
    this.log(`Select Audio Track: index=${index}`);
    if (this.isTizen && window.webapis.avplay) {
      try { window.webapis.avplay.setSelectTrack("AUDIO", index); } catch (e) { this.log("AVPlay Select Audio Track Error", e.message); }
    } else if (this.hls) {
      try { this.hls.audioTrack = index; } catch (e) {}
    } else if (this.videoElement && this.videoElement.audioTracks) {
      try {
        for (let i = 0; i < this.videoElement.audioTracks.length; i++) {
          this.videoElement.audioTracks[i].enabled = (i === index);
        }
      } catch (e) {}
    }
  }

  getSubtitleTracks() {
    if (this.isTizen && window.webapis.avplay) {
      try {
        const tracks = window.webapis.avplay.getTotalTrackInfo();
        const subtitleTracks = tracks
          .filter(t => t.type === "SUBTITLE")
          .map(t => {
            let lang = "";
            if (t.extra_info) {
              try {
                const info = typeof t.extra_info === 'string' ? JSON.parse(t.extra_info) : t.extra_info;
                lang = info.language || info.lang || "";
              } catch (e) {}
            }
            return {
              index: t.index,
              language: lang ? lang.toUpperCase() : `Subtitle ${t.index}`
            };
          });
        subtitleTracks.unshift({ index: -1, language: 'Off' });
        return subtitleTracks;
      } catch (e) { return []; }
    } else if (this.hls) {
      try {
        const tracks = this.hls.subtitleTracks.map((t, idx) => ({
          index: idx,
          language: t.name || t.lang || `Subtitle ${idx + 1}`
        }));
        tracks.unshift({ index: -1, language: 'Off' });
        return tracks;
      } catch (e) { return []; }
    } else if (this.videoElement && this.videoElement.textTracks) {
      try {
        const tracks = [];
        const textTracks = Array.from(this.videoElement.textTracks).filter(t => t.kind === 'subtitles' || t.kind === 'captions');
        textTracks.forEach((t, idx) => {
          tracks.push({
            index: idx,
            language: t.label || t.language || `Subtitle ${idx + 1}`
          });
        });
        tracks.unshift({ index: -1, language: 'Off' });
        return tracks;
      } catch (e) { return []; }
    }
    return [];
  }

  setSubtitleTrack(index) {
    this.log(`Select Subtitle Track: index=${index}`);
    if (this.isTizen && window.webapis.avplay) {
      try {
        if (index === -1) {
          window.webapis.avplay.setSilentSubtitle(true);
        } else {
          window.webapis.avplay.setSilentSubtitle(false);
          window.webapis.avplay.setSelectTrack("SUBTITLE", index);
        }
      } catch (e) { this.log("AVPlay Select Subtitle Error", e.message); }
    } else if (this.hls) {
      try { this.hls.subtitleTrack = index; } catch (e) {}
    } else if (this.videoElement && this.videoElement.textTracks) {
      try {
        const textTracks = Array.from(this.videoElement.textTracks).filter(t => t.kind === 'subtitles' || t.kind === 'captions');
        textTracks.forEach((t, idx) => {
          t.mode = (idx === index) ? 'showing' : 'disabled';
        });
      } catch (e) {}
    }
  }

  destroy() {
    this.stop();
    this.videoElement = null;
    this.listeners = {};
  }
}

const instance = new PlayerService();
if (typeof window !== 'undefined') {
  window.PlayerService = instance;
}
export default instance;
