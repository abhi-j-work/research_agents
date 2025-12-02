import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bot, User, Loader2, Globe, Share2, Link as LinkIcon, 
  ArrowUp, X, Plus, BrainCircuit, Check 
} from "lucide-react";
import type { Message } from "../models";

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (query: string) => void;
  isHybridMode: boolean;
  setIsHybridMode: (val: boolean) => void; // New prop to change mode
  onClose?: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  messages, 
  onSendMessage, 
  isHybridMode, 
  setIsHybridMode,
  onClose 
}) => {
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false); // State for Dropdown
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput("");
    setMenuOpen(false);
  };

  const toggleMode = (hybrid: boolean) => {
    setIsHybridMode(hybrid);
    setMenuOpen(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.gridBg} />

      <div style={styles.panel}>
        
        {/* --- TOP HIGHLIGHTER / HEADER --- */}
        <div style={{
          ...styles.header,
          // Dynamic Border/Glow based on mode
          borderBottom: isHybridMode 
            ? '1px solid rgba(74, 222, 128, 0.2)' 
            : '1px solid rgba(56, 189, 248, 0.2)',
          boxShadow: isHybridMode
            ? '0 4px 20px -5px rgba(74, 222, 128, 0.1)'
            : '0 4px 20px -5px rgba(56, 189, 248, 0.1)'
        }}>
          <div style={{
            ...styles.headerBadge,
            background: isHybridMode ? 'rgba(74, 222, 128, 0.1)' : 'rgba(56, 189, 248, 0.1)',
            border: isHybridMode ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: isHybridMode ? '#4ade80' : '#38bdf8',
              boxShadow: isHybridMode ? '0 0 10px #4ade80' : '0 0 10px #38bdf8'
            }} />
            <span style={{ 
              fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
              color: isHybridMode ? '#4ade80' : '#38bdf8' 
            }}>
              {isHybridMode ? "HYBRID MODE ACTIVE" : "WEB SEARCH ACTIVE"}
            </span>
          </div>

          {onClose && (
            <button onClick={onClose} style={styles.closeBtn} title="Close Chat">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={styles.messageList}>
          <div style={styles.messageContainer}>
            {messages.map((msg, idx) => (
              <MessageBubble key={idx} message={msg} />
            ))}
            
            {messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
                <div style={styles.botAvatar}><Bot size={18} color="#22d3ee" /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Processing sources...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} style={{ height: 20 }} />
          </div>
        </div>

        {/* --- FOOTER with PLUS MENU --- */}
        <div style={styles.footer}>
          <div style={styles.inputWrapper}>
             
             {/* PLUS ICON & DROPDOWN */}
             <div style={{ position: 'relative' }}>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      style={styles.dropdownMenu}
                    >
                      <div style={styles.dropdownHeader}>Select Mode</div>
                      
                      {/* Option 1: Web Search */}
                      <button 
                        onClick={() => toggleMode(false)}
                        style={{
                          ...styles.dropdownItem,
                          background: !isHybridMode ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                          color: !isHybridMode ? '#38bdf8' : '#94a3b8'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Globe size={16} />
                          <span>Web Search</span>
                        </div>
                        {!isHybridMode && <Check size={14} />}
                      </button>

                      {/* Option 2: Hybrid RAG */}
                      <button 
                         onClick={() => toggleMode(true)}
                         style={{
                           ...styles.dropdownItem,
                           background: isHybridMode ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
                           color: isHybridMode ? '#4ade80' : '#94a3b8'
                         }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <BrainCircuit size={16} />
                          <span>Hybrid RAG</span>
                        </div>
                        {isHybridMode && <Check size={14} />}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  onClick={() => setMenuOpen(!menuOpen)}
                  style={{
                    ...styles.plusBtn,
                    background: menuOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                    color: isHybridMode ? '#4ade80' : '#38bdf8'
                  }}
                  title="Select Analysis Mode"
                >
                  <Plus size={20} />
                </button>
             </div>

             <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={isHybridMode ? "Ask Hybrid RAG (Graph + Web)..." : "Search Web..."}
                style={styles.input}
              />
              
              <motion.button
                onClick={handleSend}
                disabled={!input.trim()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  ...styles.sendBtn,
                  background: input.trim() 
                    ? "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)" 
                    : "rgba(255, 255, 255, 0.1)", 
                  opacity: input.trim() ? 1 : 0.6,
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  color: input.trim() ? "#fff" : "#94a3b8"
                }}
              >
                <ArrowUp size={22} strokeWidth={2.5} />
              </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

// MessageBubble Component (Unchanged)
const MessageBubble = ({ message }: { message: Message }) => {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const webSources = message.citations?.filter(c => c.type === 'web') || [];
  const internalSources = message.citations?.filter(c => c.type !== 'web') || [];

  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 32, width: '100%' }}>
      {!isUser && (
        <div style={isError ? styles.errorAvatar : styles.botAvatar}>
          <Bot size={18} color={isError ? "#f87171" : "#22d3ee"} />
        </div>
      )}
      <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{
          padding: '16px 24px', borderRadius: 18,
          borderTopLeftRadius: isUser ? 18 : 4, borderTopRightRadius: isUser ? 4 : 18,
          background: isUser ? '#22d3ee' : 'rgba(30, 41, 59, 0.4)',
          border: isUser ? 'none' : '1px solid rgba(255,255,255,0.06)',
          color: isUser ? '#0f172a' : '#e2e8f0', fontSize: 15, lineHeight: 1.6, fontWeight: isUser ? 500 : 400
        }}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        {!isUser && !isError && (
          <div style={{ marginTop: 12, width: '100%', paddingLeft: 4 }}>
            {internalSources.length > 0 && (
              <div style={styles.citationBox}>
                <div style={styles.citationHeader}><Share2 size={12} /> Internal Knowledge</div>
                {internalSources.map((cit, i) => (
                  <div key={i} style={styles.citationItem}>
                    <span style={{ fontWeight: 'bold', color: '#818cf8', marginRight: 8 }}>[{cit.id}]</span>
                    {cit.source_file || "Graph Database"}
                  </div>
                ))}
              </div>
            )}
            {webSources.length > 0 && (
              <div style={{ ...styles.citationBox, borderColor: 'rgba(56, 189, 248, 0.15)', background: 'rgba(56, 189, 248, 0.03)', marginTop: 8 }}>
                <div style={{ ...styles.citationHeader, color: '#38bdf8' }}><Globe size={12} /> Web Sources</div>
                {webSources.map((cit, i) => (
                  <div key={i} style={styles.citationItem}>
                    <LinkIcon size={12} style={{ opacity: 0.5, marginRight: 6 }} />
                    <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{cit.content.slice(0, 100)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && <div style={styles.userAvatar}><User size={18} color="#fff" /></div>}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { height: "100%", width: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", background: '#020617' },
  gridBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", zIndex: 0, pointerEvents: "none" },
  panel: { flex: 1, display: "flex", flexDirection: "column", zIndex: 10, height: '100%', position: 'relative' },
  
  // Header / Highlighter
  header: { 
    padding: '16px 24px', 
    background: 'rgba(2, 6, 23, 0.8)', 
    backdropFilter: 'blur(12px)', 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'absolute', 
    top: 0, left: 0, right: 0, 
    zIndex: 20,
    transition: 'all 0.3s ease'
  },
  headerBadge: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderRadius: 20, transition: 'all 0.3s ease' },
  closeBtn: { position: 'absolute', right: 24, background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' },

  messageList: { flex: 1, overflowY: "auto", paddingTop: "80px", paddingBottom: "20px", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  messageContainer: { width: "100%", maxWidth: "900px", padding: "0 24px", display: "flex", flexDirection: "column" },
  
  footer: { padding: "24px 40px", display: "flex", justifyContent: "center", background: "linear-gradient(to top, rgba(2,6,23,1) 10%, transparent 100%)", position: 'relative', zIndex: 20 },
  inputWrapper: { width: "100%", maxWidth: "800px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "8px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 10px 40px -10px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" },
  input: { flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: "15px", outline: "none", padding: "10px", fontFamily: "var(--font-mono)" },
  
  // Buttons
  sendBtn: { width: 44, height: 44, borderRadius: "12px", border: "none", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" },
  plusBtn: { width: 40, height: 40, borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" },

  // Dropdown Menu
  dropdownMenu: {
    position: 'absolute', bottom: '60px', left: 0,
    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px', padding: '8px', width: '220px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.5)', zIndex: 50
  },
  dropdownHeader: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '8px 12px' },
  dropdownItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    transition: 'background 0.2s', marginBottom: 2
  },

  botAvatar: { width: 36, height: 36, borderRadius: 10, background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  errorAvatar: { width: 36, height: 36, borderRadius: 10, background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  userAvatar: { width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  citationBox: { marginTop: 8, padding: 12, borderRadius: 8, background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)', fontSize: 13, color: '#cbd5e1' },
  citationHeader: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#818cf8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 },
  citationItem: { display: 'flex', alignItems: 'center', marginBottom: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }
};

export default ChatWindow;