/**
 * Utility functions for Stalker Portal URL and data handling
 */

export const formatClock = (date = new Date()) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};
