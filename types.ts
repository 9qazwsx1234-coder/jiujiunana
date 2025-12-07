export enum Sender {
  User = 'User',
  Char = 'Char',
}

export enum Mode {
  Online = 'Online',
  Offline = 'Offline',
}

export interface Sticker {
  id: string;
  name: string;
  url: string;
  allowAI: boolean; // Controls if AI can use this sticker
}

export interface OfflinePreset {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}

export interface OfflineConfig {
  bannedWords: string;
  minWords: number;
  maxWords: number;
  presets: OfflinePreset[];
}

export interface QuoteInfo {
  id: string;
  content: string;
  senderName: string;
}

export interface Message {
  id: string;
  sender: Sender;
  content: string; // Text or Sticker URL or Voice Text
  type: 'text' | 'sticker' | 'voice';
  timestamp: number;
  thinkingTime?: number; // In seconds
  wordCount?: number;
  isThinking?: boolean;
  isRecalled?: boolean;
  quote?: QuoteInfo;
}

export interface CustomImages {
  headerBg?: string;
  footerBg?: string;
  settingsIcon?: string;
  sendIcon?: string;
  waitIcon?: string;
  moreIcon?: string;
}

export interface AppSettings {
  // Appearance
  fontSize: number;
  bubbleScale: number;
  fontUrl: string;
  darkMode: boolean;
  backgroundImage: string;
  
  // Custom UI
  customImages: CustomImages;

  // Features
  realTimeEnabled: boolean;
  
  // Personas
  userName: string;
  userAvatar: string;
  userDesc: string;
  userBubbleStyle: string; // CSS Code
  
  charName: string;
  charAvatar: string;
  charDesc: string;
  charBubbleStyle: string; // CSS Code
  
  // World & Logic
  worldBook: string;
  bannedWords: string; // Global banned words
  
  // API
  proxyUrl: string;
  apiKey: string;
  model: string;
}
