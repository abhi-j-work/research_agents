import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // Ensure you have basic reset CSS here (margin:0, padding:0, box-sizing:border-box)

// --- Component Imports ---
import SidePanel from './components/SidePanel';
import ChatPage from './pages/ChatPage';
import ChatWindow from './components/ChatWindow';
import GraphPage from './pages/GraphPage';
import GraphChatModal from './components/GraphChatModal';

import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { GraphDataPayload, Message, ViewMode } from './models';

const API_URL = "http://localhost:8002";

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat-landing');
  const [messages, setMessages] = useState<Message[]>([]);
  const [graphPayload, setGraphPayload] = useState<GraphDataPayload | null>(null);
  const [isGraphChatOpen, setIsGraphChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // State for Hybrid Mode (passed to ChatPage & SidePanel)
  const [isHybridMode, setIsHybridMode] = useState(false);

  // --- Handlers ---
  const handleSendMessage = async (query: string) => {
    if (!query.trim()) return;
    
    // 1. Add User Message immediately
    const userMessage: Message = { role: "user", content: query };
    setMessages(prev => [...prev, userMessage]);

    try {
      // 2. API Call with Hybrid Flag
      const response = await axios.post(`${API_URL}/api/chat`, { 
        query: query,
        useHybrid: isHybridMode 
      });

      // 3. Add Assistant Response
      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.answer,
        citations: response.data.citations,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.response?.data?.detail || "Connection error. Please check backend.";
      setMessages(prev => [...prev, { role: 'error', content: `⚠️ ${errorMsg}` }]);
    }
  };

  const startConversation = (initialQuery: string) => {
    setViewMode('chat-active');
    // Optional: Clear previous context if starting fresh from landing
    if (messages.length > 0) setMessages([]); 
    setTimeout(() => handleSendMessage(initialQuery), 50);
  };
  
  const handleSetViewMode = (mode: 'chat' | 'graph' | 'graph-chat') => {
    if (mode === 'chat') setViewMode('chat-active');
    else if (mode === 'graph-chat') setIsGraphChatOpen(true);
    else setViewMode(mode as ViewMode);
  };

  const handleBackToChat = () => {
    setGraphPayload(null);
    setViewMode('chat-active');
  };

  return (
    <div className="app-container" style={{ 
      position: 'relative', 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden', 
      background: '#020617', 
      color: '#fff',
      display: 'flex',
      flexDirection: 'column'
    }}>
      
      {/* Sidebar Toggle Button (Floating) */}
      <button 
        style={{ 
          position: 'absolute', 
          top: 20, 
          left: 20, 
          zIndex: 100, 
          background: 'rgba(15,23,42,0.8)', 
          border: '1px solid rgba(255,255,255,0.1)', 
          color: '#22d3ee', 
          padding: 10, 
          borderRadius: 12, 
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
      >
        {isSidebarOpen ? <PanelLeftClose size={22} /> : <PanelLeftOpen size={22} />}
      </button>

      {/* Main Layout Area */}
      <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
        
        {/* Left Panel (Sidebar) */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ 
                borderRight: '1px solid rgba(255,255,255,0.05)', 
                background: 'rgba(15,23,42,0.5)', 
                backdropFilter: 'blur(10px)', 
                zIndex: 90,
                overflow: 'hidden', // Prevents content from jumping during animation
                whiteSpace: 'nowrap' // Prevents text wrapping during animation
              }}
            >
              <SidePanel
                setViewMode={handleSetViewMode}
                setGraphPayload={setGraphPayload}
                isHybridMode={isHybridMode}
                setIsHybridMode={setIsHybridMode}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Panel (Content) */}
        <div style={{ 
          flex: 1, 
          position: 'relative', 
          height: '100%', 
          overflow: 'hidden', // Crucial for independent scrolling in ChatWindow
          display: 'flex',
          flexDirection: 'column'
        }}>
          <AnimatePresence mode="wait">
            {viewMode === 'chat-landing' && (
              <motion.div 
                key="landing" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                style={{ height: '100%', width: '100%' }}
              >
                <ChatPage 
                  onStartConversation={startConversation} 
                  isHybridMode={isHybridMode}
                  setIsHybridMode={setIsHybridMode}
                />
              </motion.div>
            )}
            {viewMode === 'chat-active' && (
              <motion.div 
                key="active" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                style={{ height: '100%', width: '100%' }}
              >
                <ChatWindow 
                  messages={messages} 
                  onSendMessage={handleSendMessage} 
                  isHybridMode={isHybridMode}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Graph Overlay (Full Screen) */}
      <AnimatePresence>
        {viewMode === 'graph' && graphPayload && (
          <GraphPage 
            setViewMode={handleBackToChat} 
            htmlContent={graphPayload.html_content}
            downloadUrl={graphPayload.download_url}
          />
        )}
      </AnimatePresence>

      {/* Graph Chat Modal (Pop-up) */}
      <GraphChatModal 
        isOpen={isGraphChatOpen} 
        onClose={() => setIsGraphChatOpen(false)} 
      />
    </div>
  );
}

export default App;