export const APP_NAME = "PoomaniTV";

export const STORAGE_KEYS = {
  PROVIDERS: "poomani_providers",
  ACTIVE_PROVIDER_ID: "poomani_active_provider_id",
  FAVORITES: "poomani_favorites",
  CONTINUE_WATCHING: "poomani_continue_watching",
  RECENT_CHANNELS: "poomani_recent_channels",
  PLAYER_ENGINE: "poomani_player_engine",
  SYSTEM_SETTINGS: "poomani_system_settings",
  RECENT_SEARCHES: "poomani_recent_searches",
  RADIO_STATIONS: "poomani_radio"
};

export const DEFAULT_SETTINGS = {
  playerEngine: "auto", // auto, html5, avplayer
  screenMode: "Fit", // Fit, Fill, Stretch
};

export const STALKER_ENDPOINTS = {
  HANDSHAKE: "/server/load.php?type=stb&action=handshake",
  PROFILE: "/server/load.php?type=stb&action=get_profile",
  LIVE_CATEGORIES: "/server/load.php?type=itv&action=get_genres",
  CHANNELS: "/server/load.php?type=itv&action=get_all_channels",
  VOD_CATEGORIES: "/server/load.php?type=vod&action=get_categories",
  VOD_LIST: "/server/load.php?type=vod&action=get_ordered_list",
  SERIES_LIST: "/server/load.php?type=series&action=get_ordered_list",
  CREATE_LINK: "/server/load.php?type=itv&action=create_link",
  CREATE_VOD_LINK: "/server/load.php?type=vod&action=create_link",
};

export const PLAYER_FALLBACK_ORDER = ["AVPlay", "HTML5"];

export const DEFAULT_ASPECT_RATIO = "16:9";
