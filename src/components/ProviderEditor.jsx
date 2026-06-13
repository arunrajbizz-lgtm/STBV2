import React, { useState, useEffect } from 'react';
import { Save, X, Info, Zap } from 'lucide-react';
import { clsx } from 'clsx';

const ProviderEditor = ({ initialData, onSave, onCancel, onTest }) => {
  const [formData, setFormData] = useState(initialData || {
    name: '',
    portalUrl: '',
    mac: '',
    sn: '',
    deviceId1: '',
    deviceId2: '',
    signature: ''
  });

  const [focusedIndex, setFocusedIndex] = useState(0);

  const FIELDS = [
    { name: 'name', label: 'Provider Name', placeholder: 'e.g. Premium Portal' },
    { name: 'portalUrl', label: 'Portal URL', placeholder: 'http://portal.example.com/c/' },
    { name: 'mac', label: 'MAC Address', placeholder: '00:1A:79:XX:XX:XX' },
    { name: 'sn', label: 'Serial Number', placeholder: 'Optional' },
    { name: 'deviceId1', label: 'Device ID 1', placeholder: 'Optional' },
    { name: 'deviceId2', label: 'Device ID 2', placeholder: 'Optional' },
    { name: 'signature', label: 'Signature', placeholder: 'Optional' },
  ];

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.keyCode;
      const MAX_INDEX = FIELDS.length + 2; // 0-6 fields, 7 Test, 8 Save, 9 Cancel

      if (key === 38) { // Up
        setFocusedIndex(p => Math.max(0, p - 1));
      } else if (key === 40) { // Down
        setFocusedIndex(p => Math.min(MAX_INDEX, p + 1));
      } else if (key === 13) { // Enter
        if (focusedIndex < FIELDS.length) {
          // Stay on field or move to next? For TV usually move to next or show OSK
        } else if (focusedIndex === FIELDS.length) {
          onTest(formData);
        } else if (focusedIndex === FIELDS.length + 1) {
          onSave(formData);
        } else if (focusedIndex === FIELDS.length + 2) {
          onCancel();
        }
      } else if (key === 27 || key === 10009 || key === 8) { // Back
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, formData, onTest, onSave, onCancel]);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-20">
      <div className="w-full max-w-[1200px] glass p-16 rounded-[40px] border border-white/10 animate-in zoom-in-95 duration-300">
        
        <div className="flex justify-between items-start mb-16">
          <div>
            <h2 className="text-6xl font-black mb-4 tracking-tighter uppercase italic">
              {initialData ? 'Edit Provider' : 'New Provider'}
            </h2>
            <div className="flex items-center gap-2 text-white/40 font-bold uppercase tracking-widest text-xs">
               <Info size={14} /> Enter your Stalker Portal credentials below
            </div>
          </div>
          <div onClick={onCancel} className="p-4 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all cursor-pointer">
            <X size={32} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-10 mb-16">
          {FIELDS.map((field, index) => {
            const isFocused = focusedIndex === index;
            return (
              <div key={field.name} className="flex flex-col gap-3">
                <label className="text-white/30 font-black text-xs uppercase tracking-[4px] ml-1">
                  {field.label}
                </label>
                <div className={clsx(
                  "p-6 rounded-2xl bg-white/5 border-2 transition-all flex items-center",
                  isFocused ? "border-accent bg-white/10 ring-8 ring-accent/10" : "border-white/5"
                )}>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    className="bg-transparent w-full outline-none text-xl font-bold text-white placeholder:text-white/10 tracking-tight"
                    value={formData[field.name]}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-6">
          <div 
            onClick={() => onTest && onTest(formData)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-4 py-8 bg-white/10 text-white font-black text-2xl rounded-3xl transition-all border-4",
              focusedIndex === FIELDS.length ? "border-accent scale-105 shadow-focus bg-accent/20" : "border-transparent"
            )}
          >
            <Zap size={28} strokeWidth={3} className={clsx(focusedIndex === FIELDS.length ? "text-accent" : "text-white/40")} /> TEST CONNECTION
          </div>
          <div 
            onClick={() => onSave(formData)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-4 py-8 bg-white text-black font-black text-2xl rounded-3xl transition-all border-4",
              focusedIndex === FIELDS.length + 1 ? "border-accent scale-105 shadow-focus" : "border-transparent"
            )}
          >
            <Save size={28} strokeWidth={3} /> SAVE PROVIDER
          </div>
          <div 
            onClick={onCancel}
            className={clsx(
              "px-12 flex items-center justify-center py-8 bg-white/5 text-white/40 font-black text-2xl rounded-3xl border-4 transition-all",
              focusedIndex === FIELDS.length + 2 ? "border-white/20 text-white" : "border-transparent"
            )}
          >
            CANCEL
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderEditor;
