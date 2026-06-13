import React, { useEffect, useRef } from 'react';
import { Search, Home, Tv, Film, PlayCircle, Heart, Settings, User } from 'lucide-react';
import { APP_NAME } from '../utils/constants';
import { clsx } from 'clsx';

const MENU_ITEMS = [
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'live', icon: Tv, label: 'Live TV' },
  { id: 'library', icon: Film, label: 'Library' },
  { id: 'cinema', icon: PlayCircle, label: 'Cinema' },
  { id: 'favorites', icon: Heart, label: 'Collections' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

const Sidebar = ({ activeId, onSelect, focusedIndex }) => {
  console.log("[Sidebar] Render. Focused Index:", focusedIndex, "Active ID:", activeId);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (focusedIndex !== -1 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [focusedIndex]);

  return (
    <div className="fixed left-0 top-0 h-full w-[80px] flex flex-col items-center py-10 glass z-50 border-r border-white/10 overflow-hidden">
      <div className="mb-10 text-accent font-black text-2xl tracking-tighter italic">
        {APP_NAME[0]}
      </div>
      
      <div className="flex flex-col gap-8 flex-1 overflow-y-auto no-scrollbar py-4 px-2 w-full">
        {MENU_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isFocused = focusedIndex === index;
          const isActive = activeId === item.id;
          
          return (
            <div
              key={item.id}
              ref={el => itemRefs.current[index] = el}
              onClick={() => onSelect(item.id)}
              className={clsx(
                "px-1 py-2.5 rounded-xl transition-all duration-200 cursor-pointer flex flex-col items-center gap-1.5 group w-full",
                isFocused ? "bg-white scale-105 shadow-lg shadow-white/20" : "hover:bg-white/5",
                isActive && !isFocused && "text-accent"
              )}
            >
              <Icon 
                size={24} 
                className={clsx(
                  "transition-colors",
                  isFocused ? "text-black" : (isActive ? "text-accent" : "text-white/40")
                )} 
              />
              <span className={clsx(
                "text-[8.5px] font-black uppercase tracking-wider text-center block truncate max-w-full px-0.5",
                isFocused ? "text-black" : (isActive ? "text-accent" : "text-white/25")
              )}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto p-2.5 rounded-full bg-white/5 border border-white/10">
        <User size={20} className="text-white/60" />
      </div>
    </div>
  );
};

export default React.memo(Sidebar);
