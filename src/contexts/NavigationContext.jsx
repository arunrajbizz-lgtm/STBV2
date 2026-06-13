import React, { createContext, useContext, useState } from 'react';

const NavigationContext = createContext();

export const NavigationProvider = ({ children }) => {
  const [navZone, setNavZone] = useState('sidebar');
  const [contentSubZone, setContentSubZone] = useState('seasons');
  const [focusMemory, setFocusMemory] = useState({});
  const [sidebarFocusedIndex, setSidebarFocusedIndex] = useState(1);
  const [categoryFocusedIndex, setCategoryFocusedIndex] = useState(0);
  const [contentFocusedIndex, setContentFocusedIndex] = useState(0);
  const [focusedSubIndex, setFocusedSubIndex] = useState(0);
  const [focusedSeasonIndex, setFocusedSeasonIndex] = useState(0);
  const [focusedEpisodeIndex, setFocusedEpisodeIndex] = useState(0);

  console.log("FORENSIC: NAVIGATION_PROVIDER_RENDER");

  const value = {
    navZone, setNavZone,
    contentSubZone, setContentSubZone,
    focusMemory, setFocusMemory,
    sidebarFocusedIndex, setSidebarFocusedIndex,
    categoryFocusedIndex, setCategoryFocusedIndex,
    contentFocusedIndex, setContentFocusedIndex,
    focusedSubIndex, setFocusedSubIndex,
    focusedSeasonIndex, setFocusedSeasonIndex,
    focusedEpisodeIndex, setFocusedEpisodeIndex
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigation = () => useContext(NavigationContext);
