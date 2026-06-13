import React, { useState, useEffect, useCallback } from 'react';
import { Delete, ArrowUp, Check, X, Space } from 'lucide-react';
import { clsx } from 'clsx';

const Keyboard = ({ value, onChange, onDone, onCancel, label }) => {
  const [isShift, setIsShift] = useState(false);
  const [focusedKey, setFocusedKey] = useState({ row: 0, col: 0 });

  const layout = isShift ? [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '@'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '_', '/'],
    ['SHIFT', 'SPACE', 'BACKSPACE', 'DONE']
  ] : [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '/'],
    ['SHIFT', 'SPACE', 'BACKSPACE', 'DONE']
  ];

  const handleKeyPress = (key) => {
    if (key === 'SHIFT') {
      setIsShift(!isShift);
    } else if (key === 'BACKSPACE') {
      onChange(value.slice(0, -1));
    } else if (key === 'SPACE') {
      onChange(value + ' ');
    } else if (key === 'DONE') {
      onDone();
    } else {
      onChange(value + key);
      // Reset shift after character if it was on
      if (isShift) setIsShift(false);
    }
  };

  const handleKeyDown = useCallback((e) => {
    const key = e.keyCode || e.which;
    const { row, col } = focusedKey;

    if (key === 37) { // Left
      setFocusedKey({ row, col: Math.max(0, col - 1) });
    } else if (key === 39) { // Right
      setFocusedKey({ row, col: Math.min(layout[row].length - 1, col + 1) });
    } else if (key === 38) { // Up
      const nextRow = Math.max(0, row - 1);
      const nextCol = Math.min(layout[nextRow].length - 1, col);
      setFocusedKey({ row: nextRow, col: nextCol });
    } else if (key === 40) { // Down
      const nextRow = Math.min(layout.length - 1, row + 1);
      const nextCol = Math.min(layout[nextRow].length - 1, col);
      setFocusedKey({ row: nextRow, col: nextCol });
    } else if (key === 13) { // Enter
      handleKeyPress(layout[row][col]);
    } else if (key === 10009 || key === 27) { // Back
      onCancel();
    }
  }, [focusedKey, isShift, value, onChange, onDone, onCancel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 bg-black/95 z-[200] flex flex-col items-center justify-center p-10 animate-in fade-in duration-300">
      <div className="w-full max-w-[1000px]">
        <div className="mb-10 text-center">
          <label className="text-white/40 font-black text-sm uppercase tracking-[8px] mb-4 block">
            {label}
          </label>
          <div className="text-6xl font-black text-white bg-white/5 p-8 rounded-[30px] border border-white/10 min-h-[120px] flex items-center justify-center break-all">
            {value}<span className="w-1 h-12 bg-accent ml-1 animate-pulse" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {layout.map((rowArr, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-4">
              {rowArr.map((key, colIndex) => {
                const isFocused = focusedKey.row === rowIndex && focusedKey.col === colIndex;
                const isAction = ['SHIFT', 'SPACE', 'BACKSPACE', 'DONE'].includes(key);
                
                return (
                  <div
                    key={key}
                    onClick={() => handleKeyPress(key)}
                    className={clsx(
                      "flex items-center justify-center rounded-2xl transition-all cursor-pointer font-black text-2xl",
                      isAction ? "px-8 py-6 bg-white/10" : "w-16 h-16 bg-white/5",
                      isFocused ? "bg-accent text-white scale-110 shadow-focus" : "text-white/60",
                      key === 'DONE' && "bg-green-500/20 text-green-500 border border-green-500/30",
                      key === 'DONE' && isFocused && "bg-green-500 text-white"
                    )}
                  >
                    {key === 'SHIFT' && <ArrowUp size={28} className={isShift ? "text-white" : "text-white/40"} />}
                    {key === 'BACKSPACE' && <Delete size={28} />}
                    {key === 'SPACE' && <Space size={28} />}
                    {key === 'DONE' && <Check size={28} />}
                    {!isAction && key}
                    {key === 'SHIFT' && <span className="ml-2 text-xs">SHIFT</span>}
                    {key === 'DONE' && <span className="ml-2 text-xs">DONE</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center gap-10 opacity-40">
          <div className="flex items-center gap-3">
             <div className="px-2 py-1 border border-white/40 rounded text-xs font-bold text-white">ARROWS</div>
             <span className="text-xs font-bold uppercase tracking-widest text-white">Navigate</span>
          </div>
          <div className="flex items-center gap-3">
             <div className="px-2 py-1 border border-white/40 rounded text-xs font-bold text-white">OK</div>
             <span className="text-xs font-bold uppercase tracking-widest text-white">Select</span>
          </div>
          <div className="flex items-center gap-3">
             <div className="px-2 py-1 border border-white/40 rounded text-xs font-bold text-white">BACK</div>
             <span className="text-xs font-bold uppercase tracking-widest text-white">Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Keyboard;
