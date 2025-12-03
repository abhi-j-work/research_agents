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
  CheckCircle
} from "lucide-react";

// ---- Interfaces ----
interface ChatPageProps {
  onStartConversation: (query: string) => void;
  isHybridMode: boolean;
  setIsHybridMode: (val: boolean) => void;
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
  const [menuOpen, setMenuOpen] = useState(false);
  
  // --- Upload State ---
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Determine which tool is "active" based on the boolean state
  const selectedToolValue = isHybridMode ? "neo4j" : "duckduckgo";
  const activeToolObj = TOOL_OPTIONS.find((t) => t.value === selectedToolValue);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    onStartConversation(inputValue);
  };

  const handleToolSelect = (tool: ToolOption) => {
    if (tool.isHybridTrigger !== undefined) {
      setIsHybridMode(tool.isHybridTrigger);
    }
    setMenuOpen(false);
  };

  // --- File Upload Handler ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMenuOpen(false); // Close menu
    setIsUploading(true);
    setUploadStatus("idle");

    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${API_URL}/api/hybrid/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadStatus("success");
      // Reset status after 3 seconds
      setTimeout(() => setUploadStatus("idle"), 3000);
    } catch (error) {
      console.error("Upload failed", error);
      setUploadStatus("error");
    } finally {
      setIsUploading(false);
      // Clear input so same file can be selected again if needed
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
        <main style={styles.main}>
          
          {/* Scrollable Hero Section */}
          <div style={styles.scrollContainer}>
            <div style={styles.emptyState}>
              
              {/* Hero Title */}
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
                  {isHybridMode 
                    ? "Hybrid Mode Active: Searching Graph + Docs + Web" 
                    : "Standard Mode: Web Search Only"}
                </p>
              </motion.div>

              {/* Suggestions Grid */}
              <div style={styles.gridContainer}>
                {suggestionCategories.map((cat, i) => (
                  <motion.div
                    key={cat.title}
                    style={styles.card}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    whileHover={{ 
                      scale: 1.02, 
                      borderColor: "rgba(34, 211, 238, 0.4)",
                      boxShadow: "0 0 20px rgba(34, 211, 238, 0.1)" 
                    }}
                  >
                    <h3 style={styles.cardHeader}>
                      <Command size={14} style={{ marginRight: 8 }} /> {cat.title}
                    </h3>
                    <div style={styles.promptList}>
                      {cat.prompts.map((p) => (
                        <button
                          key={p}
                          style={styles.promptBtn}
                          onClick={() => onStartConversation(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Input Area */}
          <footer style={styles.footer}>
            
            {/* Upload Status Notification (Floating above input) */}
            <AnimatePresence>
              {(isUploading || uploadStatus === 'success' || uploadStatus === 'error') && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  style={{
                    position: 'absolute',
                    top: -40,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: uploadStatus === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
                    color: '#fff',
                    padding: '6px 16px',
                    borderRadius: 20,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    backdropFilter: 'blur(4px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin"/> : (uploadStatus === 'success' ? <CheckCircle size={14}/> : <Zap size={14}/>)}
                  <span>
                    {isUploading ? "Ingesting Document..." : (uploadStatus === 'success' ? "Ingestion Complete!" : "Upload Failed")}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={styles.inputWrapper}>
              
              {/* Tool Selector Button (Plus Icon) */}
              <div style={{ position: "relative" }}>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      style={{...styles.toolMenu, height: 'auto'}}
                    >
                      <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Select Mode
                      </div>
                      
                      {/* Standard Options */}
                      {TOOL_OPTIONS.map((t) => (
                        <div
                          key={t.value}
                          style={{
                            ...styles.toolItem,
                            background: selectedToolValue === t.value ? 'rgba(255,255,255,0.1)' : 'transparent'
                          }}
                          onClick={() => handleToolSelect(t)}
                        >
                          <div
                            style={{
                              ...styles.iconBox,
                              color: t.color,
                              boxShadow: `0 0 10px ${t.glow}`,
                            }}
                          >
                            <t.icon size={14} />
                          </div>
                          <span style={styles.toolLabel}>{t.label}</span>
                          {selectedToolValue === t.value && <Check size={14} color={t.color} />}
                        </div>
                      ))}

                      {/* Divider */}
                      <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}></div>

                      {/* Upload Option */}
                      <div
                        style={{
                          ...styles.toolItem,
                          color: '#818cf8', // Indigo color
                        }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div
                          style={{
                            ...styles.iconBox,
                            color: '#818cf8',
                            background: 'rgba(99, 102, 241, 0.15)'
                          }}
                        >
                          <FileUp size={14} />
                        </div>
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
                  title="Select Analysis Mode or Upload"
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
                  isHybridMode
                    ? "// Hybrid Mode: Ask complex questions..."
                    : "// Web Mode: Search Entegris..."
                }
                style={styles.input}
              />

              {/* Send Button */}
              <motion.button
                onClick={() => handleSubmit()}
                disabled={!inputValue.trim()}
                whileHover={{ 
                  scale: 1.05, 
                  boxShadow: "0 0 20px rgba(6, 182, 212, 0.6)" 
                }}
                whileTap={{ scale: 0.95 }}
                style={{
                  ...styles.sendBtn,
                  background: inputValue.trim() 
                    ? "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)" 
                    : "rgba(30,41,59,0.5)",
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
  page: {
    height: "100%",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    background: '#020617'
  },
  gridBg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    zIndex: 0,
    pointerEvents: "none",
  },
  panel: {
    width: "100%",
    height: "100%",
    display: "flex",
    zIndex: 10,
    flexDirection: "column",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  
  // Hero Section
  scrollContainer: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
    width: "100%",
  },
  welcomeHero: {
    marginBottom: "40px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  logoGlow: {
    width: 64,
    height: 64,
    borderRadius: "18px",
    background: "rgba(34, 211, 238, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "24px",
    boxShadow: "0 0 40px rgba(34, 211, 238, 0.25)",
    border: "1px solid rgba(34, 211, 238, 0.3)",
  },
  heroText: {
    fontSize: "36px",
    fontWeight: 700,
    color: "#fff",
    margin: 0,
    letterSpacing: "-0.5px",
    textShadow: "0 0 20px rgba(255,255,255,0.2)"
  },
  heroSub: {
    color: "#94a3b8",
    marginTop: "10px",
    fontSize: "16px",
  },

  // Suggestion Cards
  gridContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    width: "100%",
    maxWidth: "900px",
  },
  card: {
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    cursor: "default",
    transition: "all 0.3s",
  },
  cardHeader: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#22d3ee",
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "1px",
    display: "flex",
    alignItems: "center",
  },
  promptList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  promptBtn: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    textAlign: "left",
    color: "#cbd5e1",
    fontSize: "13px",
    padding: "10px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
    width: "100%",
    display: "flex",
    alignItems: "center",
  },

  // Footer Input
  footer: {
    padding: "24px 40px",
    display: "flex",
    justifyContent: "center",
    background: "linear-gradient(to top, rgba(2,6,23,0.8) 0%, transparent 100%)",
    position: 'relative'
  },
  inputWrapper: {
    width: "100%",
    maxWidth: "800px",
    background: "rgba(15, 23, 42, 0.8)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "16px",
    padding: "8px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    boxShadow: "0 10px 40px -10px rgba(0,0,0,0.5)",
    backdropFilter: "blur(12px)",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: "15px",
    outline: "none",
    padding: "10px",
    fontFamily: "var(--font-mono)",
  },

  // Button Styles
  toolTrigger: {
    width: 44,
    height: 44,
    borderRadius: "12px",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    background: "rgba(255,255,255,0.03)",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: "12px",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  
  // Tool Menu
  toolMenu: {
    position: "absolute",
    bottom: "60px",
    left: "0",
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "6px",
    width: "240px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    zIndex: 50,
  },
  toolItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.2s",
    color: "#cbd5e1",
    fontSize: "13px",
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.05)",
  },
  toolLabel: {
    flex: 1,
    fontWeight: 500,
  },
};

export default ChatPage;