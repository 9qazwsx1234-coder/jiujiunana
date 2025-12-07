import React, { useState, useEffect, useRef } from 'react';
import { Settings, Image as ImageIcon, Plus, Trash2, Edit, Save, Send, Clock, X, Check, MoreHorizontal, Layout, Link as LinkIcon, FolderOpen, GripVertical, Reply, Undo2, Quote, RefreshCw, Upload, ShieldAlert, CheckSquare, Power, ArrowLeft, Moon, Sun, Mic, Type, SquareDashedMousePointer, AudioLines, User } from 'lucide-react';
import { Message, Sender, AppSettings, Sticker, OfflineConfig, Mode, QuoteInfo, OfflinePreset, CustomImages } from './types';
import { INITIAL_SETTINGS } from './constants';
import { fetchModels, generateReply } from './services/geminiService';

// --- Utility Components ---

const GlassModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string }> = ({ isOpen, onClose, title, children, className = "" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/30 dark:bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className={`glass-panel w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl p-6 flex flex-col shadow-2xl ${className}`}>
        <div className="flex justify-between items-center mb-6 border-b border-black/5 dark:border-white/10 pb-3">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 tracking-wide">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimer, setTypingTimer] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [mode, setMode] = useState<Mode>(Mode.Online);
  
  // UI Toggles
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [showOfflineConfigScreen, setShowOfflineConfigScreen] = useState(false); 
  const [showUiConfigScreen, setShowUiConfigScreen] = useState(false);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [voiceTextInput, setVoiceTextInput] = useState("");
  const [recallError, setRecallError] = useState(false); // For Offline Recall Alert

  // Selection & Edit
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [quotingMsg, setQuotingMsg] = useState<QuoteInfo | null>(null);
  const [expandedVoiceMsgIds, setExpandedVoiceMsgIds] = useState<Set<string>>(new Set());

  // Stickers Logic
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stickerUrlInput, setStickerUrlInput] = useState("");
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [isStickerManageMode, setIsStickerManageMode] = useState(false);
  const [selectedStickerIds, setSelectedStickerIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Offline Logic
  const [offlineConfig, setOfflineConfig] = useState<OfflineConfig>({
    bannedWords: "",
    minWords: 0,
    maxWords: 0,
    presets: []
  });

  // API Logic
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<number | null>(null);

  // --- Effects ---
  useEffect(() => {
    // Font
    if (settings.fontUrl) {
      const style = document.createElement('style');
      style.innerHTML = `@font-face { font-family: 'CustomFont'; src: url('${settings.fontUrl}'); } body { font-family: 'CustomFont', sans-serif !important; }`;
      document.head.appendChild(style);
      return () => { document.head.removeChild(style); };
    }
  }, [settings.fontUrl]);

  useEffect(() => {
    // Dark Mode
    if (settings.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [settings.darkMode]);

  useEffect(() => {
     if (!isSelectionMode) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, mode]);

  useEffect(() => {
    let interval: number;
    if (isTyping) {
      interval = window.setInterval(() => setTypingTimer(t => t + 1), 1000);
    } else {
      setTypingTimer(0);
    }
    return () => clearInterval(interval);
  }, [isTyping]);

  // --- Logic Helpers ---

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const msg: Message = {
      id: Date.now().toString(),
      sender: Sender.User,
      content: inputText,
      type: 'text',
      timestamp: Date.now(),
      quote: quotingMsg || undefined
    };
    setMessages(prev => [...prev, msg]);
    setInputText("");
    setQuotingMsg(null);
  };

  const handleSendVoiceMessage = () => {
      if (!voiceTextInput.trim()) return;
      const msg: Message = {
          id: Date.now().toString(),
          sender: Sender.User,
          content: voiceTextInput,
          type: 'voice',
          timestamp: Date.now(),
      };
      setMessages(prev => [...prev, msg]);
      setVoiceTextInput("");
      setShowVoiceInput(false);
  };

  const handleWaitReply = async () => {
    setIsTyping(true);
    try {
      const rawReply = await generateReply(messages, settings, mode, offlineConfig, stickers);
      
      // Split by the ||| delimiter instructed in the prompt
      // Also fallback to splitting sticker/voice tags if AI forgot the delimiter but used the tags
      // The prompt asks AI to use ||| between everything.
      
      // First, normalize by replacing multiple ||| with single |||
      const cleanReply = rawReply.replace(/\|\|\|+/g, '|||');
      
      // Split by |||
      const segments = cleanReply.split('|||');
      
      segments.forEach((seg, index) => {
          const part = seg.trim();
          if (!part) return;
          
          // Check if this part is a sticker or voice, or just text
          // Even if AI missed ||| inside a segment, we try to detect tags
          // But primary split is |||
          
          const stickerMatch = part.match(/^\[sticker:\s*(.*?)\]$/i);
          const voiceMatch = part.match(/^\[voice:\s*(.*?)\]$/i);

          if (stickerMatch) {
              const name = stickerMatch[1];
              const sticker = stickers.find(s => s.name === name);
              const content = sticker ? sticker.url : part; 
              const type = sticker ? 'sticker' : 'text';
              addMessage(content, type, index);
          } else if (voiceMatch) {
              const content = voiceMatch[1];
              addMessage(content, 'voice', index);
          } else {
              // Regular text
              addMessage(part, 'text', index, part.length);
          }
      });
    } catch (e: any) {
      alert("生成失败: " + e.message);
    } finally {
      setIsTyping(false);
    }
  };

  const addMessage = (content: string, type: 'text'|'sticker'|'voice', index: number, wordCount = 0) => {
      // Add a tiny delay based on index to ensure state updates (though React batching usually handles this, ID uniqueness is key)
      // We use index in ID to ensure unique keys
      setMessages(prev => [...prev, {
          id: Date.now().toString() + "_" + index,
          sender: Sender.Char,
          content,
          type,
          timestamp: Date.now(),
          thinkingTime: index === 0 ? typingTimer : undefined, // Only show thinking time on the first bubble
          wordCount
      }]);
  };

  const handleImageUpload = (file: File, callback: (url: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target?.result) callback(e.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    const models = await fetchModels(settings.proxyUrl, settings.apiKey);
    setAvailableModels(models);
    setIsFetchingModels(false);
    if (models.length > 0) setSettings(s => ({...s, model: models[0]}));
  };

  // Sticker Helpers
  const handleStickerUrlImport = () => {
    const regex = /^(.*?)(https?:\/\/.*)$/;
    const lines = stickerUrlInput.split('\n');
    const newStickers: Sticker[] = [];
    lines.forEach(line => {
       const match = line.trim().match(regex);
       if (match) {
           newStickers.push({ id: Date.now() + Math.random().toString(), name: match[1].trim() || "未命名", url: match[2].trim(), allowAI: true });
       }
    });
    if (newStickers.length > 0) {
        setStickers(prev => [...prev, ...newStickers]);
        setStickerUrlInput("");
        setShowUrlImport(false);
        alert(`成功导入 ${newStickers.length} 个表情包`);
    } else {
        alert("格式错误");
    }
  };

  const handleLocalStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = prompt("请输入此表情包的意思（名称）：");
    if (!name) return;
    handleImageUpload(file, (url) => {
        setStickers(prev => [...prev, { id: Date.now().toString(), name, url, allowAI: true }]);
    });
    e.target.value = "";
  };

  const handleDeleteStickers = () => {
      setStickers(prev => prev.filter(s => !selectedStickerIds.has(s.id)));
      setSelectedStickerIds(new Set());
      setIsStickerManageMode(false);
  };

  const handleToggleAiPermission = (allowed: boolean) => {
      setStickers(prev => prev.map(s => selectedStickerIds.has(s.id) ? {...s, allowAI: allowed} : s));
      setSelectedStickerIds(new Set());
      setIsStickerManageMode(false);
  };

  const handleSendSticker = (s: Sticker) => {
      if (isStickerManageMode) {
          const newSet = new Set(selectedStickerIds);
          if (newSet.has(s.id)) newSet.delete(s.id);
          else newSet.add(s.id);
          setSelectedStickerIds(newSet);
          return;
      }
      const msg: Message = {
          id: Date.now().toString(),
          sender: Sender.User,
          content: s.url,
          type: 'sticker',
          timestamp: Date.now(),
          quote: quotingMsg || undefined
      };
      setMessages(prev => [...prev, msg]);
      setShowStickerPanel(false);
  };

  // Touch/Select
  const handleTouchStart = (id: string) => {
      longPressRef.current = window.setTimeout(() => {
          setIsSelectionMode(true);
          setSelectedMsgIds(new Set([id]));
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500);
  };
  const handleTouchEnd = () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  const toggleSelection = (id: string) => {
     if (isSelectionMode) {
         const newSet = new Set(selectedMsgIds);
         if (newSet.has(id)) newSet.delete(id);
         else newSet.add(id);
         setSelectedMsgIds(newSet);
         if (newSet.size === 0) handleExitSelection();
     }
  };

  const handleExitSelection = () => {
    setIsSelectionMode(false);
    setSelectedMsgIds(new Set());
  };

  // --- Renderers ---

  const MessageItem: React.FC<{ msg: Message }> = ({ msg }) => {
     const isUser = msg.sender === Sender.User;
     const isSelected = selectedMsgIds.has(msg.id);
     const isEditing = editingMsgId === msg.id;
     const isRecalled = msg.isRecalled;

     // Inline Bubble Styles
     const bubbleStyle = isUser ? settings.userBubbleStyle : settings.charBubbleStyle;
     const styleObj: any = {};
     bubbleStyle.split(';').forEach(rule => {
        const [k, v] = rule.split(':');
        if (k && v) styleObj[k.trim().replace(/-([a-z])/g, g => g[1].toUpperCase())] = v.trim();
     });

     const renderContent = () => {
         if (isRecalled) return <span className="text-slate-400 italic text-sm text-center block px-4 py-1">消息已撤回</span>;
         
         return (
         <div className="flex flex-col gap-1 min-w-[20px]">
             {/* Quote - WeChat Style */}
             {msg.quote && (
                 <div className="mb-2 text-xs text-slate-500 bg-black/5 dark:bg-white/10 rounded p-2 flex flex-col gap-0.5">
                     <span className="font-bold">{msg.quote.senderName}:</span>
                     <span className="opacity-80 line-clamp-2">{msg.quote.content}</span>
                 </div>
             )}
             
             {isEditing ? (
                 <textarea 
                    defaultValue={msg.content} 
                    className="bg-white/50 w-full min-w-[200px] p-2 rounded text-slate-800"
                    onBlur={(e) => {
                        setMessages(prev => prev.map(m => m.id === msg.id ? {...m, content: e.target.value} : m));
                        setEditingMsgId(null);
                    }}
                    autoFocus
                 />
             ) : msg.type === 'sticker' ? (
                 <img src={msg.content} alt="sticker" className="max-w-[140px] rounded-lg" />
             ) : msg.type === 'voice' ? (
                 // QQ Style Voice Message
                 <div onClick={() => {
                     const newSet = new Set(expandedVoiceMsgIds);
                     if (newSet.has(msg.id)) newSet.delete(msg.id);
                     else newSet.add(msg.id);
                     setExpandedVoiceMsgIds(newSet);
                 }} className="cursor-pointer min-w-[80px] flex flex-col gap-1">
                     <div className="flex items-center gap-2">
                        {/* Fake Duration logic based on length */}
                        <span className={`text-xs font-bold opacity-60 ${isUser ? 'order-first' : 'order-last'}`}>{Math.min(60, Math.ceil(msg.content.length / 2))}''</span>
                        
                        <div className="flex items-center gap-1">
                            {isUser && <AudioLines size={18} className="rotate-180" />} 
                            {!isUser && <AudioLines size={18} />}
                        </div>
                     </div>
                     {expandedVoiceMsgIds.has(msg.id) && (
                         <div className="text-[8px] mt-1 opacity-80 border-t border-white/20 pt-1 leading-tight animate-fade-in break-all">
                             {msg.content}
                         </div>
                     )}
                 </div>
             ) : (
                 <p className="whitespace-pre-wrap leading-relaxed break-all">{msg.content}</p>
             )}
         </div>
     )};

     const wrapperEvents = {
         onTouchStart: () => handleTouchStart(msg.id),
         onTouchEnd: handleTouchEnd,
         onMouseDown: () => handleTouchStart(msg.id),
         onMouseUp: handleTouchEnd,
         onClick: (e: React.MouseEvent) => {
             if (isSelectionMode) {
                 e.stopPropagation();
                 toggleSelection(msg.id);
             }
         }
     };

     // --- Offline Layout ---
     if (mode === Mode.Offline) {
         return (
             <div className={`flex flex-col items-center mb-8 animate-fade-in w-full ${isSelected ? 'opacity-80 scale-95 transition-transform' : ''}`}>
                 <img src={isUser ? settings.userAvatar : settings.charAvatar} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md z-10 mb-2" />
                 <div className="flex gap-3 text-[10px] text-slate-400 font-mono mb-2 items-center bg-white/30 dark:bg-black/30 px-2 py-0.5 rounded-full">
                     <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                     {!isUser && msg.wordCount !== undefined && <><span className="w-[1px] h-2 bg-slate-300"></span><span>{msg.wordCount}字</span></>}
                     {!isUser && msg.thinkingTime !== undefined && <><span className="w-[1px] h-2 bg-slate-300"></span><span className="text-blue-500">思考{msg.thinkingTime}s</span></>}
                 </div>
                 <div 
                    {...wrapperEvents}
                    className={`glass-panel px-6 py-4 max-w-[90%] text-slate-800 dark:text-slate-200 text-center shadow-sm relative cursor-pointer ${isRecalled ? 'bg-slate-200/50 backdrop-blur-none border-transparent' : ''}`}
                    style={{ fontSize: `${settings.fontSize}px`, borderRadius: '20px' }}
                 >
                     {renderContent()}
                     {isSelected && <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full p-1"><Check size={12}/></div>}
                 </div>
             </div>
         );
     }

     // --- Online Layout ---
     return (
         <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'} group px-2`}>
             {!isUser && <div className="flex flex-col items-center mr-3 shrink-0"><img src={settings.charAvatar} className="w-10 h-10 rounded-full object-cover border border-white/50 shadow-sm" /></div>}
             <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[75%]`}>
                 <div className="text-[10px] text-slate-400 mb-1 px-1">{isUser ? settings.userName : settings.charName}</div>
                 <div 
                    {...wrapperEvents}
                    className={`p-3 shadow-sm backdrop-blur-sm relative cursor-pointer transition-all ${isRecalled ? 'bg-slate-200/50 !text-slate-500 !border-transparent !shadow-none' : ''}`}
                    style={{ 
                        fontSize: `${settings.fontSize}px`, 
                        transform: `scale(${settings.bubbleScale})`, 
                        transformOrigin: isUser ? 'top right' : 'top left',
                        ...(isRecalled ? {borderRadius: '10px'} : styleObj)
                    }}
                 >
                     {renderContent()}
                     {isSelected && <div className={`absolute -top-2 ${isUser ? '-left-2' : '-right-2'} bg-blue-500 text-white rounded-full p-1`}><Check size={10}/></div>}
                 </div>
             </div>
             {isUser && <div className="flex flex-col items-center ml-3 shrink-0"><img src={settings.userAvatar} className="w-10 h-10 rounded-full object-cover border border-white/50 shadow-sm" /></div>}
         </div>
     );
  };

  return (
    <div 
        className="h-full flex flex-col bg-[#f0f4f8] dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans overflow-hidden transition-colors"
        style={settings.backgroundImage ? { backgroundImage: `url(${settings.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
    >
      
      {/* --- Header --- */}
      <header 
        className="glass-panel z-40 shrink-0 h-[70px] flex items-center px-4 relative shadow-sm transition-all bg-cover bg-center"
        style={settings.customImages.headerBg ? { backgroundImage: `url(${settings.customImages.headerBg})` } : {}}
      >
          {/* Left: Offline Preset Button */}
          <div className="absolute left-4 z-20">
             {mode === Mode.Offline && (
                 <button onClick={() => setShowOfflineConfigScreen(true)} className="text-xl font-bold text-slate-700 dark:text-slate-300 hover:scale-110 transition-transform p-2">ᗜ𖥦ᗜ</button>
             )}
          </div>

          {/* Center: Title / Avatar (No Status) */}
          <div className="flex-1 flex flex-col items-center justify-center">
             <div className="flex flex-col items-center gap-1">
                 <img src={settings.charAvatar} className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                 <span className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-none">{isTyping ? "输入中..." : settings.charName}</span>
             </div>
          </div>

          {/* Right: Settings & Custom UI */}
          <div className="absolute right-4 z-20 flex gap-2">
              <button onClick={() => setShowUiConfigScreen(true)} className="w-9 h-9 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-black/5 rounded-full flex justify-center text-[10px] font-bold items-center border border-transparent hover:border-black/10">
                ᗜ_ᗜ
              </button>
              <button onClick={() => setIsSettingsOpen(true)} className="w-9 h-9 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-black/5 rounded-full flex justify-center items-center">
                {settings.customImages.settingsIcon ? <img src={settings.customImages.settingsIcon} className="w-5 h-5 object-contain"/> : <Settings size={20} />}
              </button>
          </div>
      </header>

      {/* --- Chat Area --- */}
      <main 
          className="flex-1 overflow-y-auto p-4 hide-scrollbar relative z-0" 
          ref={scrollRef}
          onClick={() => {
              if (isSelectionMode) handleExitSelection();
          }}
      >
          {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 select-none">
                  <div className="text-4xl opacity-20">𖥦</div>
                  <div className="text-sm">开始与 {settings.charName} 的{mode === Mode.Online ? '线上' : '线下'}对话</div>
              </div>
          )}
          {messages.map(msg => <MessageItem key={msg.id} msg={msg} />)}
          <div ref={chatEndRef} />
      </main>

      {/* --- Selection Toolbar (Positioned above footer) --- */}
      {isSelectionMode && (
         <div className="glass-panel mx-4 rounded-2xl p-2 flex justify-around animate-slide-up z-[60] absolute bottom-[90px] left-0 right-0 shadow-2xl items-center border border-white/50 dark:border-white/10">
             {/* Recall */}
             <div className="flex flex-col items-center relative">
                 {recallError && <span className="absolute -top-10 bg-red-500 text-white text-[10px] px-2 py-1 rounded-lg shadow-lg animate-fade-in whitespace-nowrap z-50">线下模式不可用</span>}
                 <button onClick={() => {
                     if (mode === Mode.Offline) {
                         setRecallError(true);
                         setTimeout(() => setRecallError(false), 2000);
                     } else {
                         setMessages(prev => prev.map(m => selectedMsgIds.has(m.id) ? {...m, isRecalled: true} : m));
                         handleExitSelection();
                     }
                 }} className={`flex flex-col items-center gap-1 p-2 ${mode === Mode.Offline ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'}`}>
                     <Undo2 size={20}/>
                     <span className="text-[10px]">撤回</span>
                 </button>
             </div>
             
             {/* Quote */}
             <button onClick={() => {
                 const id = Array.from(selectedMsgIds)[0];
                 const m = messages.find(msg => msg.id === id);
                 if (m) {
                     setQuotingMsg({id: m.id, content: m.type === 'sticker' ? '[表情包]' : m.content, senderName: m.sender === Sender.User ? settings.userName : settings.charName});
                     handleExitSelection();
                 }
             }} disabled={selectedMsgIds.size !== 1} className="flex flex-col items-center gap-1 p-2 text-slate-600 dark:text-slate-300 disabled:opacity-30"><Quote size={20}/><span className="text-[10px]">引用</span></button>
             
             {/* Edit */}
             <button onClick={() => {
                 const id = Array.from(selectedMsgIds)[0];
                 const m = messages.find(msg => msg.id === id);
                 if (m && (m.type === 'text' || m.type === 'voice')) { 
                     setEditingMsgId(id); 
                     handleExitSelection(); 
                 }
             }} disabled={selectedMsgIds.size !== 1} className="flex flex-col items-center gap-1 p-2 text-slate-600 dark:text-slate-300 disabled:opacity-30"><Edit size={20}/><span className="text-[10px]">编辑</span></button>
             
             {/* Delete */}
             <button onClick={() => {
                 setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
                 handleExitSelection();
             }} className="flex flex-col items-center gap-1 p-2 text-red-500"><Trash2 size={20}/><span className="text-[10px]">删除</span></button>
             
             {/* Cancel */}
             <button onClick={handleExitSelection} className="flex flex-col items-center gap-1 p-2 text-slate-400"><X size={20}/><span className="text-[10px]">取消</span></button>
         </div>
      )}

      {/* --- Full Screens --- */}
      
      {/* 1. Offline Config (Existing) */}
      {showOfflineConfigScreen && (
          <div className="fixed inset-0 z-[60] bg-[#f0f4f8] dark:bg-slate-900 flex flex-col animate-fade-in overflow-hidden">
              <div className="h-[60px] glass-panel shrink-0 flex items-center justify-between px-4 relative">
                  <button onClick={() => setShowOfflineConfigScreen(false)} className="p-2 text-slate-500 hover:bg-black/5 rounded-full"><ArrowLeft size={20}/></button>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">预设</h2>
                  <div className="w-10"></div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar pb-24 text-slate-800 dark:text-slate-200">
                  <div className="glass-panel p-4 rounded-2xl border-2 border-red-50 dark:border-red-900/30">
                      <label className="flex items-center gap-2 text-xs font-bold text-red-500 uppercase mb-2"><ShieldAlert size={14}/> 绝对禁词</label>
                      <textarea value={offlineConfig.bannedWords} onChange={(e) => setOfflineConfig({...offlineConfig, bannedWords: e.target.value})} className="w-full h-20 bg-red-50/50 dark:bg-red-900/10 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-red-100 placeholder-red-200" placeholder="禁止词汇..." />
                  </div>
                  <div className="glass-panel p-4 rounded-2xl">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-3"><Layout size={14}/> 字数限制</label>
                      <div className="flex gap-4">
                          <div className="flex-1"><span className="text-[10px] text-slate-400 block mb-1">最低 (Min)</span><input type="number" value={offlineConfig.minWords} onChange={(e) => setOfflineConfig({...offlineConfig, minWords: Number(e.target.value)})} className="w-full bg-white/50 dark:bg-black/30 rounded-xl p-3 text-center font-mono font-bold" /></div>
                          <div className="flex-1"><span className="text-[10px] text-slate-400 block mb-1">最高 (Max)</span><input type="number" value={offlineConfig.maxWords} onChange={(e) => setOfflineConfig({...offlineConfig, maxWords: Number(e.target.value)})} className="w-full bg-white/50 dark:bg-black/30 rounded-xl p-3 text-center font-mono font-bold" /></div>
                      </div>
                  </div>
                  <div className="space-y-4">
                      <div className="flex items-center justify-between px-2"><label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase"><CheckSquare size={14}/> 预设条目</label></div>
                      {offlineConfig.presets.map((preset) => (
                          <div key={preset.id} className="glass-panel p-4 rounded-2xl animate-scale-in">
                              <div className="flex justify-between items-center mb-3">
                                  <input className="bg-transparent font-bold text-slate-700 dark:text-slate-200 w-2/3 border-b border-transparent focus:border-blue-300 outline-none" value={preset.name} placeholder="条目名称" onChange={(e) => setOfflineConfig(prev => ({...prev, presets: prev.presets.map(p => p.id === preset.id ? {...p, name: e.target.value} : p)}))} />
                                  <div className="flex items-center gap-3">
                                      <button onClick={() => setOfflineConfig(prev => ({...prev, presets: prev.presets.map(p => p.id === preset.id ? {...p, enabled: !p.enabled} : p)}))} className={`w-10 h-6 rounded-full transition-colors relative ${preset.enabled ? 'bg-green-500' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${preset.enabled ? 'left-5' : 'left-1'}`}></div></button>
                                      <button onClick={() => setOfflineConfig(prev => ({...prev, presets: prev.presets.filter(p => p.id !== preset.id)}))} className="text-red-300 hover:text-red-500"><Trash2 size={16}/></button>
                                  </div>
                              </div>
                              <textarea className="w-full bg-white/40 dark:bg-black/20 rounded-xl p-3 text-xs resize-none h-20 border border-transparent focus:border-blue-200" placeholder="输入具体要求..." value={preset.content} onChange={(e) => setOfflineConfig(prev => ({...prev, presets: prev.presets.map(p => p.id === preset.id ? {...p, content: e.target.value} : p)}))} />
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setOfflineConfig(prev => ({...prev, presets: [...prev.presets, {id: Date.now().toString(), name: "新条目", content: "", enabled: true}]}))} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:bg-white/30 hover:border-slate-400 transition-all"><Plus size={20}/> 添加新预设条目</button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-black/60 backdrop-blur border-t border-black/5"><button onClick={() => setShowOfflineConfigScreen(false)} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex justify-center items-center gap-2"><Save size={20}/> 保存并生效</button></div>
          </div>
      )}

      {/* 2. UI Customization Screen (Existing) */}
      {showUiConfigScreen && (
          <div className="fixed inset-0 z-[60] bg-[#f0f4f8] dark:bg-slate-900 flex flex-col animate-fade-in overflow-hidden">
              <div className="h-[60px] glass-panel shrink-0 flex items-center justify-center px-4 relative">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">ᗜ_ᗜ</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar pb-24 text-slate-800 dark:text-slate-200">
                  {[
                      { key: 'headerBg', title: '顶栏背景', size: '1123x200' },
                      { key: 'footerBg', title: '底栏背景', size: '1123x200' },
                      { key: 'settingsIcon', title: '设置图标', size: '64x64' },
                      { key: 'sendIcon', title: '发送图标', size: '64x64' },
                      { key: 'waitIcon', title: '等待图标', size: '64x64' },
                      { key: 'moreIcon', title: '更多图标', size: '64x64' }
                  ].map((item) => (
                      <div key={item.key} className="glass-panel p-4 rounded-2xl flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                              <span className="font-bold text-sm">{item.title}</span>
                              <span className="text-xs text-slate-400">{item.size}</span>
                          </div>
                          <div 
                              className="h-20 bg-black/5 dark:bg-white/5 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer overflow-hidden relative group"
                              onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'image/*';
                                  input.onchange = (e: any) => handleImageUpload(e.target.files[0], (url) => setSettings(s => ({...s, customImages: {...s.customImages, [item.key]: url}})));
                                  input.click();
                              }}
                          >
                              {settings.customImages[item.key as keyof CustomImages] ? (
                                  <img src={settings.customImages[item.key as keyof CustomImages]} className="w-full h-full object-cover" />
                              ) : (
                                  <span className="text-slate-400 text-xs">点击上传</span>
                              )}
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">更换</div>
                          </div>
                      </div>
                  ))}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-black/60 backdrop-blur border-t border-black/5"><button onClick={() => setShowUiConfigScreen(false)} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex justify-center items-center gap-2"><Save size={20}/> 保存设置</button></div>
          </div>
      )}

      {/* --- Footer / Input --- */}
      <footer 
        className="glass-panel z-50 shrink-0 h-[70px] flex items-center p-2 gap-2 relative transition-all bg-cover bg-center"
        style={settings.customImages.footerBg ? { backgroundImage: `url(${settings.customImages.footerBg})` } : {}}
      >
          {quotingMsg && (
              <div className="absolute -top-10 left-4 right-4 bg-white/90 dark:bg-black/90 backdrop-blur rounded-lg p-2 text-xs flex justify-between shadow-sm border border-slate-200 dark:border-slate-700 animate-slide-up">
                  <span className="truncate">回复 {quotingMsg.senderName}: {quotingMsg.content}</span>
                  <button onClick={() => setQuotingMsg(null)}><X size={14}/></button>
              </div>
          )}

          {/* More Menu */}
          <div className="relative">
              <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)} className={`p-3 rounded-full transition-colors ${isMoreMenuOpen ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>
                   {settings.customImages.moreIcon ? <img src={settings.customImages.moreIcon} className="w-6 h-6 object-contain"/> : <MoreHorizontal size={24} className="text-slate-600 dark:text-slate-300" />}
              </button>
              
              {isMoreMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl p-4 w-[280px] border border-white/50 dark:border-white/10 flex flex-col gap-3 animate-scale-in origin-bottom-left z-[60]">
                      {/* Voice Message Button (Online Only) */}
                      {mode === Mode.Online && (
                          <button onClick={() => { setShowVoiceInput(true); setIsMoreMenuOpen(false); }} className="flex items-center gap-3 p-3 bg-white/60 dark:bg-white/10 rounded-xl hover:bg-white dark:hover:bg-white/20 shadow-sm transition-all text-sm font-bold text-slate-700 dark:text-slate-200">
                              <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg text-blue-500"><Mic size={18}/></div>
                              发语音消息
                          </button>
                      )}

                      <button onClick={() => { setShowStickerPanel(true); setIsMoreMenuOpen(false); }} className="flex items-center gap-3 p-3 bg-white/60 dark:bg-white/10 rounded-xl hover:bg-white dark:hover:bg-white/20 shadow-sm transition-all text-sm font-bold text-slate-700 dark:text-slate-200">
                          <div className="bg-pink-100 dark:bg-pink-900 p-2 rounded-lg text-pink-500"><ImageIcon size={18}/></div>
                          表情包管理
                      </button>

                      <button onClick={() => { setMode(m => m === Mode.Online ? Mode.Offline : Mode.Online); setIsMoreMenuOpen(false); }} className="flex items-center gap-3 p-3 bg-white/60 dark:bg-white/10 rounded-xl hover:bg-white dark:hover:bg-white/20 shadow-sm transition-all text-sm font-bold text-slate-700 dark:text-slate-200">
                          <div className={`p-2 rounded-lg ${mode === Mode.Online ? 'bg-green-100 text-green-500' : 'bg-orange-100 text-orange-500'}`}><Layout size={18}/></div>
                          <div className="flex flex-col items-start">
                              <span>切换模式</span>
                              <span className="text-[10px] text-slate-400 font-normal">{mode === Mode.Online ? '当前: 线上' : '当前: 线下'}</span>
                          </div>
                      </button>
                  </div>
              )}
          </div>

          {/* Input Box - Smaller */}
          <div className="flex-1 bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/10 rounded-3xl min-h-[40px] flex items-center px-4 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder={mode === Mode.Offline ? "面对面..." : "发送消息..."}
                className="w-full bg-transparent outline-none text-sm resize-none py-2.5 max-h-24 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                rows={1}
              />
          </div>

          {/* Wait Button */}
          <button onClick={handleWaitReply} disabled={isTyping} className="p-2 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-full transition-all active:scale-95 disabled:opacity-50">
              {settings.customImages.waitIcon ? <img src={settings.customImages.waitIcon} className={`w-5 h-5 object-contain ${isTyping ? "animate-spin" : ""}`}/> : <Clock size={20} className={isTyping ? "animate-spin" : ""} />}
          </button>

          {/* Send Button */}
          <button onClick={handleSendMessage} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all active:scale-95">
              {settings.customImages.sendIcon ? <img src={settings.customImages.sendIcon} className="w-5 h-5 object-contain"/> : <Send size={20} />}
          </button>
      </footer>

      {/* --- Voice Input Overlay --- */}
      {showVoiceInput && (
          <div className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
              <div className="glass-panel w-full max-w-sm p-6 rounded-3xl flex flex-col gap-4 shadow-xl">
                  <h3 className="font-bold text-lg text-center flex items-center justify-center gap-2"><Mic size={20}/> 发送语音消息</h3>
                  <textarea 
                    value={voiceTextInput}
                    onChange={(e) => setVoiceTextInput(e.target.value)}
                    placeholder="输入要转为语音的文字..."
                    className="w-full h-32 bg-white/50 dark:bg-black/20 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-blue-200"
                    autoFocus
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setShowVoiceInput(false)} className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300">取消</button>
                      <button onClick={handleSendVoiceMessage} className="flex-1 py-3 bg-blue-500 rounded-xl font-bold text-sm text-white">发送</button>
                  </div>
              </div>
          </div>
      )}

      {/* --- Sticker Panel --- */}
      {showStickerPanel && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/10 backdrop-blur-[2px]">
              <div className="h-[60vh] glass-panel w-full rounded-t-3xl flex flex-col animate-slide-up shadow-2xl">
                  <div className="p-4 border-b border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 rounded-t-3xl">
                      <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">表情包 (共 {stickers.length} 个)</h3>
                          <button onClick={() => setShowStickerPanel(false)} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg"><X size={16}/></button>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={() => setShowUrlImport(!showUrlImport)} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-xs bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-all text-slate-600 dark:text-slate-300"><LinkIcon size={16}/> 链接导入</button>
                          <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-xs bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-all text-slate-600 dark:text-slate-300"><Upload size={16}/> 本地上传</button>
                          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLocalStickerUpload}/>
                          <button onClick={() => { setIsStickerManageMode(!isStickerManageMode); setSelectedStickerIds(new Set()); }} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-xs transition-all ${isStickerManageMode ? 'bg-blue-500 text-white' : 'bg-white/50 dark:bg-white/10 hover:bg-white text-slate-600 dark:text-slate-300'}`}><CheckSquare size={16}/> 批量管理</button>
                      </div>
                  </div>
                  {showUrlImport && (
                      <div className="p-4 bg-white/40 dark:bg-white/5 border-b border-black/5 animate-fade-in">
                          <textarea value={stickerUrlInput} onChange={(e) => setStickerUrlInput(e.target.value)} placeholder="链接导入..." className="w-full bg-white/70 dark:bg-black/30 rounded-xl p-3 text-xs resize-none h-20 mb-2" />
                          <button onClick={handleStickerUrlImport} className="w-full py-2 bg-slate-800 text-white rounded-lg text-xs font-bold">确认导入</button>
                      </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-3 content-start">
                      {stickers.map(s => (
                          <div key={s.id} onClick={() => handleSendSticker(s)} className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer group hover:shadow-lg transition-all border border-black/5 dark:border-white/10 ${isStickerManageMode && selectedStickerIds.has(s.id) ? 'ring-4 ring-blue-500 scale-95' : ''}`}>
                              <img src={s.url} alt={s.name} className={`w-full h-full object-cover transition-opacity ${!s.allowAI ? 'opacity-50 grayscale' : ''}`} />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[9px] text-center py-1 truncate px-1">{s.name}</div>
                              {!s.allowAI && <div className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-sm"><ShieldAlert size={10} /></div>}
                          </div>
                      ))}
                  </div>
                  {isStickerManageMode && (
                      <div className="p-4 bg-white/90 dark:bg-slate-800/90 border-t border-black/5 flex gap-3 pb-8 animate-slide-up">
                          <button onClick={handleDeleteStickers} disabled={selectedStickerIds.size === 0} className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"><Trash2 size={16}/> 删除 ({selectedStickerIds.size})</button>
                          <button onClick={() => handleToggleAiPermission(false)} disabled={selectedStickerIds.size === 0} className="flex-1 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"><ShieldAlert size={16}/> 禁止AI</button>
                          <button onClick={() => handleToggleAiPermission(true)} disabled={selectedStickerIds.size === 0} className="flex-1 py-3 bg-green-100 text-green-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"><Check size={16}/> 允许AI</button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* --- Global Settings Modal --- */}
      <GlassModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="全局设置">
          <div className="flex flex-col gap-6 pb-20 text-slate-800 dark:text-slate-200">
              
              {/* Appearance */}
              <section className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
                 <h3 className="font-bold text-sm">外观设置</h3>
                 <div className="flex justify-between items-center">
                    <span className="text-xs">夜间模式</span>
                    <button onClick={() => setSettings({...settings, darkMode: !settings.darkMode})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.darkMode ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all flex items-center justify-center ${settings.darkMode ? 'left-7' : 'left-1'}`}>
                             {settings.darkMode ? <Moon size={10} className="text-indigo-500"/> : <Sun size={10} className="text-orange-400"/>}
                        </div>
                    </button>
                 </div>
              </section>

              {/* World Book & Features */}
              <section className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
                  <div className="flex justify-between items-center mb-2">
                       <h3 className="font-bold text-sm flex items-center gap-2"><Layout size={16}/> 世界书</h3>
                       <button onClick={() => {
                           const i = document.createElement('input'); i.type='file'; i.accept='image/*';
                           i.onchange=(e:any)=>handleImageUpload(e.target.files[0], (url)=>setSettings(s=>({...s, backgroundImage: url})));
                           i.click();
                       }} className="text-xs px-2 py-1 bg-black/5 dark:bg-white/10 rounded flex items-center gap-1 hover:bg-black/10"><ImageIcon size={12}/>更换聊天背景</button>
                  </div>
                  <textarea value={settings.worldBook} onChange={(e) => setSettings({...settings, worldBook: e.target.value})} className="w-full h-24 bg-white/50 dark:bg-black/30 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 resize-none" placeholder="在此输入世界观..." />
                  
                  <div className="flex justify-between items-center pt-2 border-t border-black/5 dark:border-white/10">
                      <span className="text-xs text-slate-500">实时时间 (仅线上模式)</span>
                      <button onClick={() => setSettings({...settings, realTimeEnabled: !settings.realTimeEnabled})} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${settings.realTimeEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                          {settings.realTimeEnabled ? '已开启' : '已关闭'}
                      </button>
                  </div>
              </section>

              {/* Persona Settings */}
              <section className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
                  <h3 className="font-bold text-sm flex items-center gap-2"><User size={16}/> 角色与用户设定</h3>
                  
                  {/* Character */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">对方 (AI)</label>
                      <div className="flex gap-2">
                          <div 
                              onClick={() => {
                                 const i = document.createElement('input'); i.type='file'; i.accept='image/*';
                                 i.onchange=(e:any)=>handleImageUpload(e.target.files[0], (url)=>setSettings(s=>({...s, charAvatar: url})));
                                 i.click();
                              }}
                              className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200 cursor-pointer shadow-sm"
                          >
                              <img src={settings.charAvatar} className="w-full h-full object-cover"/>
                          </div>
                          <input value={settings.charName} onChange={(e) => setSettings({...settings, charName: e.target.value})} className="flex-1 bg-white/50 dark:bg-black/30 rounded p-2 text-xs" placeholder="名字" />
                      </div>
                      <textarea value={settings.charDesc} onChange={(e) => setSettings({...settings, charDesc: e.target.value})} className="w-full h-20 bg-white/50 dark:bg-black/30 rounded p-2 text-xs resize-none" placeholder="详细人设描述..." />
                  </div>

                  {/* User */}
                  <div className="space-y-2 pt-4 border-t border-black/5 dark:border-white/10">
                      <label className="text-xs font-bold text-slate-500">我 (User)</label>
                      <div className="flex gap-2">
                          <div 
                               onClick={() => {
                                 const i = document.createElement('input'); i.type='file'; i.accept='image/*';
                                 i.onchange=(e:any)=>handleImageUpload(e.target.files[0], (url)=>setSettings(s=>({...s, userAvatar: url})));
                                 i.click();
                              }}
                              className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200 cursor-pointer shadow-sm"
                          >
                              <img src={settings.userAvatar} className="w-full h-full object-cover"/>
                          </div>
                          <input value={settings.userName} onChange={(e) => setSettings({...settings, userName: e.target.value})} className="flex-1 bg-white/50 dark:bg-black/30 rounded p-2 text-xs" placeholder="名字" />
                      </div>
                      <textarea value={settings.userDesc} onChange={(e) => setSettings({...settings, userDesc: e.target.value})} className="w-full h-20 bg-white/50 dark:bg-black/30 rounded p-2 text-xs resize-none" placeholder="我的设定..." />
                  </div>
              </section>

              {/* API Settings */}
              <section className="glass-panel p-4 rounded-2xl space-y-3 border-2 border-blue-50/50 dark:border-blue-900/30">
                  <h3 className="font-bold text-sm flex items-center gap-2">API 设置</h3>
                  <input value={settings.proxyUrl} onChange={(e) => setSettings({...settings, proxyUrl: e.target.value})} className="w-full bg-white/50 dark:bg-black/30 rounded p-2 text-xs" placeholder="反代地址 (https://...)" />
                  <input type="password" value={settings.apiKey} onChange={(e) => setSettings({...settings, apiKey: e.target.value})} className="w-full bg-white/50 dark:bg-black/30 rounded p-2 text-xs" placeholder="sk-..." />
                  <div className="flex gap-2 items-center">
                      <button onClick={handleFetchModels} disabled={isFetchingModels} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-slate-300 transition-colors">
                          <RefreshCw size={14} className={isFetchingModels ? 'animate-spin' : ''}/> 拉取模型
                      </button>
                      <select value={settings.model} onChange={(e) => setSettings({...settings, model: e.target.value})} className="flex-1 bg-white/50 dark:bg-black/30 rounded-lg p-2 text-xs outline-none">
                          <option value="">{availableModels.length > 0 ? '选择模型...' : '请先拉取模型'}</option>
                          {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                  </div>
              </section>

              {/* Save Button */}
              <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xl font-bold py-5 rounded-3xl shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 mt-4">
                  <Save size={24} /> 保存设置
              </button>
          </div>
      </GlassModal>

    </div>
  );
};

export default App;