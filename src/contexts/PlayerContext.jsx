import React, { createContext, useContext, useState } from 'react';

const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [playUrl, setPlayUrl] = useState("");

  console.log("FORENSIC: PLAYER_PROVIDER_RENDER");

  return (
    <PlayerContext.Provider value={{ isPlaying, setIsPlaying, currentItem, setCurrentItem, playUrl, setPlayUrl }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => useContext(PlayerContext);
