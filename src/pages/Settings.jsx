import React from 'react';
import { Settings as SettingsIcon, Monitor, Smartphone, Cpu, ShieldCheck, Palette, Code2, Globe, Zap, PlayCircle, Subtitles, Layout, Plus, Edit2, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { APP_NAME } from '../utils/constants';

const Settings = ({ providers = [], settings, focusedIndex, focusedSubIndex, isFocused, activeProvider, testStatus }) => {
  const isTizenSupported = typeof window.webapis !== 'undefined' && !!window.webapis.avplay;

  const OPTIONS = [
    { id: 'playerEngine', title: 'Player Engine', icon: Cpu, desc: 'Choose between Auto, HTML5, HLS.js or Samsung AVPlayer.', type: 'multi' },
    { id: 'screenMode', title: 'Screen Mode', icon: Layout, desc: 'Fit, Fill, or Stretch the video output.', type: 'multi' },
  ];

  const providerCount = providers.length;
  const totalRows = providerCount + 1 + OPTIONS.length; // providers + add button + options

  return (
    <div className="view-container p-20 overflow-y-auto" style={{ pointerEvents: 'auto', zIndex: 10 }}>
      <div className="flex items-center gap-6 mb-16">
        <div className="p-5 glass rounded-[25px] text-accent">
          <SettingsIcon size={48} />
        </div>
        <h1 className="text-6xl font-black italic tracking-tighter uppercase leading-none">{APP_NAME} Settings</h1>
      </div>

      <div className="max-w-[1200px] flex flex-col gap-12">
        {/* Providers Section */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-[8px] text-white/20 mb-8 ml-4">Managed Providers</h2>
          <div className="grid grid-cols-1 gap-4">
            {providers.map((p, idx) => {
              const isRowFocused = isFocused && focusedIndex === idx;
              const isActive = activeProvider?.id === p.id;

              return (
                <div 
                  key={p.id}
                  className={clsx(
                    "glass p-6 rounded-[30px] border-2 transition-all duration-300 flex items-center justify-between",
                    isRowFocused ? "border-white bg-white/10 scale-[1.01]" : "border-white/5 opacity-60"
                  )}
                >
                  <div className="flex items-center gap-6">
                    <div className={clsx(
                      "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black italic",
                      isActive ? "bg-accent text-white" : "bg-white/5 text-white/20"
                    )}>
                      {p.name[0]}
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                        {p.name}
                        {isActive && <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full tracking-[2px]">ACTIVE</span>}
                        {p.status && (
                          <span className={clsx(
                            "text-[10px] px-2 py-0.5 rounded-full tracking-[2px]",
                            p.status === 'Online' ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                          )}>
                            {p.status.toUpperCase()}
                          </span>
                        )}
                      </h3>
                      <div className="flex flex-col gap-1 mt-1">
                        <p className="text-white/30 text-xs font-mono flex items-center gap-2">
                          <Globe size={12} /> {p.portalUrl}
                        </p>
                        <div className="flex items-center gap-4">
                          <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest">MAC: {p.mac || 'NOT SET'}</p>
                          {p.lastUsed && (
                            <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest">
                              Last Used: {new Date(p.lastUsed).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {[
                      { icon: CheckCircle2, label: 'Activate', disabled: isActive },
                      { icon: Edit2, label: 'Edit', disabled: false },
                      { icon: Trash2, label: 'Delete', disabled: isActive }
                    ].map((btn, bIdx) => {
                      const isBtnFocused = isRowFocused && focusedSubIndex === bIdx;
                      const Icon = btn.icon;
                      
                      return (
                        <div 
                          key={btn.label}
                          className={clsx(
                            "flex items-center gap-2 px-4 py-3 rounded-xl transition-all border",
                            isBtnFocused && !btn.disabled ? "bg-white text-black border-white" : "border-transparent",
                            btn.disabled ? "opacity-30" : "opacity-100",
                            isBtnFocused && btn.disabled ? "bg-red-500/20 text-red-500 border-red-500/50" : (!isBtnFocused && !btn.disabled ? "bg-white/5 text-white/40" : "")
                          )}
                        >
                          <Icon size={18} />
                          <span className="text-[10px] font-black uppercase tracking-widest">{btn.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Add Provider Button */}
            <div 
              className={clsx(
                "glass p-6 rounded-[30px] border-2 border-dashed transition-all duration-300 flex items-center justify-center gap-4",
                isFocused && focusedIndex === providerCount ? "border-white bg-white/20 scale-[1.01]" : "border-white/10 opacity-40"
              )}
            >
              <Plus size={24} />
              <span className="text-xl font-black uppercase tracking-widest">Add New Provider</span>
            </div>
          </div>
        </section>

        {/* Options Section */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-[8px] text-white/20 mb-8 ml-4">System Preferences</h2>
          <div className="grid grid-cols-1 gap-4">
            {OPTIONS.map((opt, idx) => {
              const actualIdx = providerCount + 1 + idx;
              const isOptionFocused = isFocused && focusedIndex === actualIdx;
              const Icon = opt.icon;
              const value = settings?.[opt.id];

              return (
                <div 
                  key={opt.id}
                  className={clsx(
                    "glass p-8 rounded-[30px] border-2 transition-all duration-300 flex items-center justify-between",
                    isOptionFocused ? "border-white bg-white/20 scale-[1.01]" : "border-white/5 opacity-60"
                  )}
                >
                  <div className="flex items-center gap-8">
                    <div className={clsx(
                        "w-16 h-16 rounded-2xl flex items-center justify-center",
                        isOptionFocused ? "bg-white text-black" : "bg-white/5 text-white/40"
                    )}>
                        <Icon size={32} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black uppercase tracking-tight">{opt.title}</h3>
                        <p className="text-white/40 text-sm">{opt.desc}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {opt.id === 'playerEngine' && ['auto', 'html5', 'avplayer', 'hlsjs'].map(engine => (
                      <div 
                        key={engine}
                        className={clsx(
                          "px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest border transition-all",
                          value === engine ? "bg-accent text-white border-accent" : "bg-white/5 text-white/20 border-transparent"
                        )}
                      >
                        {engine}
                      </div>
                    ))}
                    {opt.id === 'screenMode' && ['Fit', 'Fill', 'Stretch'].map(mode => (
                      <div 
                        key={mode}
                        className={clsx(
                          "px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest border transition-all",
                          value === mode ? "bg-accent text-white border-accent" : "bg-white/5 text-white/20 border-transparent"
                        )}
                      >
                        {mode}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Hardware Status Info */}
        {!isTizenSupported && (
          <div className="px-10 py-6 bg-yellow-500/10 border border-yellow-500/20 rounded-3xl flex items-center gap-4">
            <Monitor className="text-yellow-500" />
            <p className="text-yellow-500/80 font-bold uppercase tracking-widest text-[10px]">
              Hardware Warning: Samsung AVPlayer is only available on Tizen OS. Web browser mode will use the HTML5 engine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;