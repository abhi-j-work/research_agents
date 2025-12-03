import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  BrainCircuit,
  Plus,
  ArrowUp,
  Database,
  Globe,
  Command,
  Zap,
  Check,
  FileUp,
  Loader2,
  CheckCircle,
  Terminal,
  Sparkles,
  Menu,
  RefreshCw
} from "lucide-react";

// ---- Interfaces ----
interface ChatPageProps {
  onStartConversation?: (query: string) => void;
  isHybridMode: boolean;
  setIsHybridMode: (val: boolean) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  toolUsed?: string;
}

interface ToolOption {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  glow: string;
  isHybridTrigger?: boolean;
}

const API_URL = "http://localhost:8003";

// ---- Configuration Data ----
const TOOL_OPTIONS: ToolOption[] = [
  { 
    label: "Web Search Only", 
    value: "duckduckgo", 
    icon: Globe, 
    color: "#38bdf8", 
    glow: "rgba(56, 189, 248, 0.5)", 
    isHybridTrigger: false 
  },
  { 
    label: "Hybrid RAG (Graph + Web)", 
    value: "neo4j", 
    icon: BrainCircuit, 
    color: "#4ade80", 
    glow: "rgba(74, 222, 128, 0.5)", 
    isHybridTrigger: true 
  },
  { 
    label: "Neo4j Agent (Direct)",
    value: "neo4j_agent", 
    icon: Terminal, 
    color: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.5)", 
    isHybridTrigger: false 
  },
  { 
    label: "Connect MCP (Exp)", 
    value: "arxiv", 
    icon: Database, 
    color: "#f472b6", 
    glow: "rgba(244, 114, 182, 0.5)", 
    isHybridTrigger: false 
  },
];

const suggestionCategories = [
  {
    title: "System Analysis",
    prompts: ["Analyze batch report anomalies.", "Identify critical deviations in last 24h."],
  },
  {
    title: "Technical Screening",
    prompts: ["Locate documents on 'particle contamination'.", "Plot resistivity trends for Plant 5."],
  },
  {
    title: "Knowledge Base",
    prompts: ["Protocol for tool maintenance?", "Generate knowledge graph from Doc A."],
  },
];

// ---- Main Component ----
const ChatPage: React.FC<ChatPageProps> = ({ onStartConversation, isHybridMode, setIsHybridMode }) => {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Local State for Manual Tool Selection
  const [manualTool, setManualTool] = useState<string | null>(null);
  
  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Logic to Determine Active Tool
  const selectedToolValue = manualTool || (isHybridMode ? "neo4j" : "duckduckgo");
  const activeToolObj = TOOL_OPTIONS.find((t) => t.value === selectedToolValue);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // --- Handle Submit (Routing Logic) ---
  const handleSubmit = async (e?: React.FormEvent, overridePrompt?: string) => {
    e?.preventDefault();
    const text = overridePrompt || inputValue;
    if (!text.trim()) return;

    // 1. Add User Message
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setLoading(true);
    setMenuOpen(false);

    try {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Determine which tool is selected
      const currentTool = manualTool || (isHybridMode ? "neo4j" : "duckduckgo");
      
      let responseData;
      let botMsg: Message;

      // --- ROUTING LOGIC ---
      if (currentTool === "neo4j" || currentTool === "duckduckgo") {
        // CASE A: Hybrid RAG or Web Search -> Call /api/chat
        console.log(`Routing to /api/chat (Tool: ${currentTool})`);
        
        const response = await axios.post(
          `${API_URL}/api/chat`,
          { query: text }, // ChatRequestBody structure
          { signal: controller.signal }
        );
        
        responseData = response.data;
        
        // Map ChatResponse to Message
        botMsg = {
          role: "assistant",
          content: responseData.answer,
          sources: responseData.citations || [], // ChatResponse uses 'citations'
          toolUsed: currentTool // Manually tag the tool for UI badge
        };

      } else {
        // CASE B: Agent or Arxiv -> Call /api/tools/query
        console.log(`Routing to /api/tools/query (Tool: ${currentTool})`);
        
        const response = await axios.post(
          `${API_URL}/api/tools/query`,
          { query: text, tool: currentTool }, // ToolQuery structure
          { signal: controller.signal }
        );
        
        responseData = response.data;
        
        // Parse Tool Response
        let sources: string[] = [];
        if (responseData.source === "arxiv" && Array.isArray(responseData.answer)) {
           // Special case for Arxiv list
           sources = responseData.answer;
           responseData.answer = "Here are the relevant papers found:";
        } else if (responseData.context) {
           sources = [responseData.context.substring(0, 150) + "..."];
        }

        botMsg = {
          role: "assistant",
          content: responseData.answer,
          sources: sources,
          toolUsed: responseData.source || currentTool
        };
      }

      // 2. Add Assistant Message
      setMessages((prev) => [...prev, botMsg]);

    } catch (error: any) {
      if (axios.isCancel(error)) return;
      console.error("Chat Error:", error);
      const errorMsg: Message = { 
        role: "assistant", 
        content: "⚠️ Error connecting to the server. Please check the backend connection." 
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleToolSelect = (tool: ToolOption) => {
    setManualTool(tool.value);
    if (tool.isHybridTrigger !== undefined) {
      setIsHybridMode(tool.isHybridTrigger);
    }
    setMenuOpen(false);
  };

  const handleClearChat = () => {
    setMessages([]);
    setInputValue("");
    setManualTool(null);
  };

  // --- File Upload Handler ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMenuOpen(false);
    setIsUploading(true);
    setUploadStatus("idle");

    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${API_URL}/api/hybrid/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadStatus("success");
      setTimeout(() => setUploadStatus("idle"), 3000);
    } catch (error) {
      console.error("Upload failed", error);
      setUploadStatus("error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={styles.page}>
      
      {/* Background Grid */}
      <div style={styles.gridBg} />

      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileUpload} 
        accept=".pdf,.txt,.md"
      />

      <motion.div
        style={styles.panel}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <button style={styles.sideBtn} title="Menu"><Menu size={18} /></button>
          <button style={styles.sideBtn} onClick={handleClearChat} title="New Chat"><Plus size={18} /></button>
          <button style={{ ...styles.sideBtn, color: "#22d3ee" }} onClick={handleClearChat} title="Reset"><RefreshCw size={18} /></button>
        </aside>

        <main style={styles.main}>
          
          {/* Scrollable Content Area */}
          <div style={styles.scrollContainer}>
            
            {/* 1. EMPTY STATE (Hero) */}
            {messages.length === 0 ? (
              <div style={styles.emptyState}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  style={styles.welcomeHero}
                >
                  <div style={styles.logoGlow}>
                    <Zap size={32} color="#22d3ee" fill="#22d3ee" />
                  </div>
                  <h2 style={styles.heroText}>Entegris Intelligence</h2>
                  <p style={styles.heroSub}>
                    {selectedToolValue === "neo4j_agent" 
                      ? "Direct Mode: Talking to Neo4j Database"
                      : isHybridMode 
                        ? "Hybrid Mode Active: Searching Graph + Docs + Web" 
                        : "Standard Mode: Web Search Only"}
                  </p>
                </motion.div>

                <div style={styles.gridContainer}>
                  {suggestionCategories.map((cat, i) => (
                    <motion.div
                      key={cat.title}
                      style={styles.card}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      whileHover={{ scale: 1.02, borderColor: "rgba(34, 211, 238, 0.4)" }}
                    >
                      <h3 style={styles.cardHeader}>
                        <Command size={14} style={{ marginRight: 8 }} /> {cat.title}
                      </h3>
                      <div style={styles.promptList}>
                        {cat.prompts.map((p) => (
                          <button
                            key={p}
                            style={styles.promptBtn}
                            onClick={() => handleSubmit(undefined, p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              // 2. CHAT MESSAGES STATE
              <div style={styles.chatContainer}>
                <AnimatePresence>
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        ...styles.bubble,
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                        background: msg.role === "user" ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "rgba(30,41,59,0.7)",
                        border: msg.role === "user" ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      {/* Tool Badge */}
                      {msg.role === "assistant" && msg.toolUsed && (
                        <div style={styles.toolBadge}>
                          {msg.toolUsed === "neo4j_agent" ? "Graph Agent" : 
                           msg.toolUsed === "arxiv" ? "Research Papers" : 
                           msg.toolUsed === "neo4j" ? "Hybrid RAG" : "Web Search"}
                        </div>
                      )}
                      
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={styles.sources}>
                          {msg.sources.map((s, i) => (
                            <div key={i} style={styles.sourceTag}>
                              {typeof s === 'string' ? s : JSON.stringify(s)}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {loading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{ ...styles.bubble, alignSelf: "flex-start" }}
                    >
                      <Loader2 size={14} className="animate-spin" /> Thinking...
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Footer Input Area */}
          <footer style={styles.footer}>
            
            {/* Upload Status Notification */}
            <AnimatePresence>
              {(isUploading || uploadStatus === 'success' || uploadStatus === 'error') && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  style={{
                    position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
                    background: uploadStatus === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
                    color: '#fff', padding: '6px 16px', borderRadius: 20, fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(4px)'
                  }}
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin"/> : (uploadStatus === 'success' ? <CheckCircle size={14}/> : <Zap size={14}/>)}
                  <span>{isUploading ? "Ingesting..." : (uploadStatus === 'success' ? "Done!" : "Failed")}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={styles.inputWrapper}>
              
              {/* Tool Selector */}
              <div style={{ position: "relative" }}>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      style={{...styles.toolMenu, height: 'auto'}}
                    >
                      <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Select Mode</div>
                      
                      {TOOL_OPTIONS.map((t) => (
                        <div
                          key={t.value}
                          style={{
                            ...styles.toolItem,
                            background: selectedToolValue === t.value ? 'rgba(255,255,255,0.1)' : 'transparent'
                          }}
                          onClick={() => handleToolSelect(t)}
                        >
                          <div style={{...styles.iconBox, color: t.color, boxShadow: `0 0 10px ${t.glow}`}}>
                            <t.icon size={14} />
                          </div>
                          <span style={styles.toolLabel}>{t.label}</span>
                          {selectedToolValue === t.value && <Check size={14} color={t.color} />}
                        </div>
                      ))}
                      <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}></div>
                      <div style={{...styles.toolItem, color: '#818cf8'}} onClick={() => fileInputRef.current?.click()}>
                        <div style={{...styles.iconBox, color: '#818cf8', background: 'rgba(99, 102, 241, 0.15)'}}><FileUp size={14} /></div>
                        <span style={styles.toolLabel}>Ingest Document</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.08)" }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMenuOpen(!menuOpen)}
                  style={{
                    ...styles.toolTrigger,
                    borderColor: activeToolObj ? activeToolObj.color : "rgba(255,255,255,0.15)",
                    color: activeToolObj ? activeToolObj.color : "#94a3b8",
                    boxShadow: activeToolObj ? `0 0 15px ${activeToolObj.glow}` : "none"
                  }}
                  title="Select Analysis Mode"
                >
                  {activeToolObj ? <activeToolObj.icon size={20} /> : <Plus size={20} />}
                </motion.button>
              </div>

              {/* Text Input */}
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit(e)}
                placeholder={
                  selectedToolValue === "neo4j_agent"
                    ? "// Agent Mode: Generate Cypher & Query DB..."
                    : isHybridMode
                      ? "// Hybrid Mode: Ask complex questions..."
                      : "// Web Mode: Search Entegris..."
                }
                style={styles.input}
              />

              <motion.button
                onClick={(e) => handleSubmit(e)}
                disabled={!inputValue.trim()}
                whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(6, 182, 212, 0.6)" }}
                whileTap={{ scale: 0.95 }}
                style={{
                  ...styles.sendBtn,
                  background: inputValue.trim() ? "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)" : "rgba(30,41,59,0.5)",
                  opacity: inputValue.trim() ? 1 : 0.5,
                  cursor: inputValue.trim() ? "pointer" : "not-allowed",
                }}
              >
                <ArrowUp size={22} color="#fff" strokeWidth={2.5} />
              </motion.button>
            </div>
          </footer>
        </main>
      </motion.div>
    </div>
  );
};

// ---- Styles Object ----
const styles: Record<string, React.CSSProperties> = {
  page: { height: "100%", width: "100%", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", overflow: "hidden", background: '#020617' },
  gridBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", zIndex: 0, pointerEvents: "none" },
  panel: { width: "100%", height: "100%", display: "flex", zIndex: 10, flexDirection: "row" }, 
  sidebar: { width: "60px", background: "rgba(0,0,0,0.25)", borderRight: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center", padding: "1rem 0.5rem", gap: "1rem" },
  sideBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, color: "#cbd5e1", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" },
  main: { flex: 1, display: "flex", flexDirection: "column", position: "relative" },
  
  // Chat Area
  scrollContainer: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "0 20px" },
  chatContainer: { maxWidth: "900px", width: "100%", margin: "0 auto", padding: "20px 0", display: "flex", flexDirection: "column", gap: "16px" },
  bubble: { maxWidth: "80%", padding: "12px 16px", borderRadius: "16px", color: "#f8fafc", fontSize: "14px", lineHeight: "1.5" },
  toolBadge: { fontSize: "10px", fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.5px" },
  sources: { marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" },
  sourceTag: { fontSize: "11px", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "4px", color: "#94a3b8" },

  // Hero Section
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", width: "100%" },
  welcomeHero: { marginBottom: "40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" },
  logoGlow: { width: 64, height: 64, borderRadius: "18px", background: "rgba(34, 211, 238, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px", boxShadow: "0 0 40px rgba(34, 211, 238, 0.25)", border: "1px solid rgba(34, 211, 238, 0.3)" },
  heroText: { fontSize: "36px", fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.5px", textShadow: "0 0 20px rgba(255,255,255,0.2)" },
  heroSub: { color: "#94a3b8", marginTop: "10px", fontSize: "16px" },

  // Suggestion Cards
  gridContainer: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", width: "100%", maxWidth: "900px" },
  card: { background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px", cursor: "default", transition: "all 0.3s" },
  cardHeader: { fontSize: "12px", fontWeight: 600, color: "#22d3ee", margin: 0, textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center" },
  promptList: { display: "flex", flexDirection: "column", gap: "8px" },
  promptBtn: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "left", color: "#cbd5e1", fontSize: "13px", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", transition: "all 0.2s", width: "100%", display: "flex", alignItems: "center" },

  // Footer Input
  footer: { padding: "24px 40px", display: "flex", justifyContent: "center", background: "linear-gradient(to top, rgba(2,6,23,0.8) 0%, transparent 100%)", position: 'relative' },
  inputWrapper: { width: "100%", maxWidth: "800px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "8px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 10px 40px -10px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" },
  input: { flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: "15px", outline: "none", padding: "10px", fontFamily: "var(--font-mono)" },

  // Button Styles
  toolTrigger: { width: 44, height: 44, borderRadius: "12px", border: "1px solid", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s", background: "rgba(255,255,255,0.03)" },
  sendBtn: { width: 44, height: 44, borderRadius: "12px", border: "none", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" },
  
  // Tool Menu
  toolMenu: { position: "absolute", bottom: "60px", left: "0", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "6px", width: "240px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", zIndex: 50 },
  toolItem: { display: "flex", alignItems: "center", gap: "10px", padding: "10px", borderRadius: "8px", cursor: "pointer", transition: "background 0.2s", color: "#cbd5e1", fontSize: "13px" },
  iconBox: { width: 24, height: 24, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)" },
  toolLabel: { flex: 1, fontWeight: 500 },
};

export default ChatPage;