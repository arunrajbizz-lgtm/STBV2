import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing focus in a TV application
 */
export const useFocus = (initialIndex = 0, itemsCount = 0, orientation = 'vertical') => {
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);

  const handleKeyDown = useCallback((e) => {
    // Tizen Remote Keys
    const key = e.keyCode || e.which;
    
    if (orientation === 'vertical') {
      if (key === 38) { // Up
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
      } else if (key === 40) { // Down
        setFocusedIndex(prev => (prev < itemsCount - 1 ? prev + 1 : prev));
      }
    } else if (orientation === 'horizontal') {
      if (key === 37) { // Left
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
      } else if (key === 39) { // Right
        setFocusedIndex(prev => (prev < itemsCount - 1 ? prev + 1 : prev));
      }
    }
    
    // Grid Support (Assuming 4 columns)
    if (orientation === 'grid') {
      const cols = 4;
      if (key === 38) { // Up
        setFocusedIndex(prev => (prev >= cols ? prev - cols : prev));
      } else if (key === 40) { // Down
        setFocusedIndex(prev => (prev + cols < itemsCount ? prev + cols : prev));
      } else if (key === 37) { // Left
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
      } else if (key === 39) { // Right
        setFocusedIndex(prev => (prev < itemsCount - 1 ? prev + 1 : prev));
      }
    }

  }, [itemsCount, orientation]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { focusedIndex, setFocusedIndex };
};
