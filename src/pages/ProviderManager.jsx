import React, { useState, useEffect } from 'react';
import ProviderService from '../services/provider';
import ProviderEditor from '../components/ProviderEditor';
import { Plus, Edit2, Trash2, Copy, Download, Upload, CheckCircle2, Settings, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';

const ProviderManager = () => {
  const [providers, setProviders] = useState(ProviderService.getProviders());
  const [showEditor, setShowEditor] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [activeTab, setActiveTab] = useState('providers'); // 'providers', 'playback'

  const refresh = () => {
    setProviders([...ProviderService.getProviders()]);
  };

  const handleToggleActive = async (id) => {
    await ProviderService.setActiveProvider(id);
    refresh();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this provider?")) {
      await ProviderService.deleteProvider(id);
      refresh();
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingProvider) {
        await ProviderService.updateProvider(editingProvider.id, data);
      } else {
        await ProviderService.addProvider(data);
      }
      setShowEditor(false);
      setEditingProvider(null);
      refresh();
    } catch (e) {
      console.error("Save failed", e);
    }
  };

  return (
    <div className="view-container bg-bg-secondary pt-20 px-20">
      <div className="flex gap-20">
         {/* Sidebar Tabs */}
         <div className="w-[300px] flex flex-col gap-4">
            <div 
              onClick={() => setActiveTab('providers')}
              className={clsx(
                "p-6 rounded-2xl font-black italic tracking-tighter uppercase text-2xl transition-all cursor-pointer border-2",
                activeTab === 'providers' ? "bg-accent text-white border-transparent shadow-focus" : "bg-white/5 text-white/40 border-transparent hover:bg-white/10"
              )}
            >
               Providers
            </div>
            <div 
              onClick={() => setActiveTab('playback')}
              className={clsx(
                "p-6 rounded-2xl font-black italic tracking-tighter uppercase text-2xl transition-all cursor-pointer border-2",
                activeTab === 'playback' ? "bg-accent text-white border-transparent shadow-focus" : "bg-white/5 text-white/40 border-transparent hover:bg-white/10"
              )}
            >
               Playback
            </div>
         </div>

         {/* Content Area */}
         <div className="flex-1">
            {activeTab === 'providers' && (
               <div className="animate-in">
                  <div className="flex justify-between items-center mb-12">
                     <h1 className="text-6xl font-black italic tracking-tighter uppercase">Provider Settings</h1>
                     <div 
                        onClick={() => { setEditingProvider(null); setShowEditor(true); }}
                        className="flex items-center gap-4 px-10 py-5 bg-white text-black font-black rounded-2xl hover:scale-105 transition-transform cursor-pointer shadow-xl"
                     >
                        <Plus size={24} strokeWidth={3} /> NEW PROVIDER
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 pb-40">
                     {providers.map(p => (
                        <div
                          key={p.id}
                          className={clsx(
                            "glass p-10 rounded-[30px] border-2 transition-all relative",
                            p.active ? "border-accent bg-accent/5 shadow-focus" : "border-white/5 opacity-80"
                          )}
                        >
                           {p.active && (
                              <div className="absolute top-8 right-8 flex items-center gap-2 text-accent font-black text-xs tracking-[4px] bg-accent/10 px-4 py-2 rounded-full border border-accent/20">
                                 <ShieldCheck size={16} /> ACTIVE
                              </div>
                           )}

                           <div className="flex items-start gap-8 mb-10">
                              <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 text-4xl font-black italic text-white/20">
                                 {p.name[0]}
                              </div>
                              <div>
                                 <h3 className="text-3xl font-black mb-2">{p.name}</h3>
                                 <p className="text-white/30 font-mono text-sm tracking-tighter truncate w-[300px]">{p.portalUrl}</p>
                              </div>
                           </div>

                           <div className="flex items-center justify-between border-t border-white/5 pt-8">
                              <div className="flex gap-4">
                                 <div 
                                    onClick={() => { setEditingProvider(p); setShowEditor(true); }}
                                    className="p-4 rounded-2xl glass text-white/40 hover:text-white transition-all cursor-pointer"
                                 >
                                    <Edit2 size={24} />
                                 </div>
                                 <div 
                                    onClick={() => handleDelete(p.id)}
                                    className="p-4 rounded-2xl glass text-red-500/40 hover:text-red-500 transition-all cursor-pointer"
                                 >
                                    <Trash2 size={24} />
                                 </div>
                              </div>

                              {!p.active && (
                                 <div 
                                    onClick={() => handleToggleActive(p.id)}
                                    className="px-10 py-4 bg-white text-black font-black rounded-2xl text-lg tracking-widest uppercase cursor-pointer"
                                 >
                                    Activate
                                 </div>
                              )}
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {activeTab === 'playback' && (
               <div className="animate-in glass p-16 rounded-[40px] border border-white/10">
                  <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-12">Player Engine</h2>
                  <div className="flex flex-col gap-8">
                     <div className="flex justify-between items-center p-8 bg-white/5 rounded-3xl border border-white/5">
                        <div>
                           <p className="text-2xl font-black mb-1">Hardware Acceleration</p>
                           <p className="text-white/30 font-medium italic">Use Samsung AVPlay when available</p>
                        </div>
                        <div className="w-20 h-10 bg-accent rounded-full flex items-center justify-end px-1 border border-white/10">
                           <div className="w-8 h-8 bg-white rounded-full shadow-lg" />
                        </div>
                     </div>
                     <div className="flex justify-between items-center p-8 bg-white/5 rounded-3xl border border-white/5">
                        <div>
                           <p className="text-2xl font-black mb-1">HLS.js Optimization</p>
                           <p className="text-white/30 font-medium italic">Advanced buffer management for browser fallback</p>
                        </div>
                        <div className="w-20 h-10 bg-white/10 rounded-full flex items-center justify-start px-1 border border-white/10">
                           <div className="w-8 h-8 bg-white/20 rounded-full" />
                        </div>
                     </div>
                  </div>
               </div>
            )}
         </div>
      </div>

      {showEditor && (
        <ProviderEditor 
          initialData={editingProvider}
          onSave={handleSave}
          onCancel={() => { setShowEditor(false); setEditingProvider(null); }}
          focusedIndex={0}
        />
      )}
    </div>
  );
};

export default ProviderManager;
