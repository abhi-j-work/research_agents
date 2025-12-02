import React, { useState } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, BrainCircuit, UploadCloud, FileText, X, 
  Loader2, ArrowRight, RefreshCw, Zap 
} from 'lucide-react';
import { toast } from 'sonner';
import type { GraphDataPayload } from '../models';

const API_URL = "http://localhost:8002";

interface SidePanelProps {
  setViewMode: (mode: 'chat' | 'graph' | 'graph-chat') => void;
  setGraphPayload: (payload: GraphDataPayload | null) => void;
}

const SidePanel: React.FC<SidePanelProps> = ({ setViewMode, setGraphPayload }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files?.[0] && setSelectedFile(files[0]),
    accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] },
    multiple: false,
    disabled: isLoading
  });

  const handleGenerate = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await axios.post(`${API_URL}/api/graph/from-file`, formData);
      setGraphPayload(res.data);
      setViewMode("graph"); // Switch to graph view
      toast.success("Graph generated!");
    } catch (err) {
      toast.error("Failed to generate graph");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <Zap size={20} color="#fff" fill="#22d3ee" />
        </div>
        <div>
          <h2 style={styles.title}>ENTEGRIS <span style={{color:'#22d3ee'}}>AI</span></h2>
          <p style={styles.subtitle}>Research Unit v3.0</p>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav style={styles.nav}>
        <button style={styles.navBtn} onClick={() => setViewMode('chat')}>
          <MessageSquare size={18} /> New Chat
        </button>
        <button style={styles.navBtn} onClick={() => setViewMode('graph-chat')}>
          <BrainCircuit size={18} /> Graph Explorer
        </button>
      </nav>

      {/* UPLOAD SECTION */}
      <div style={styles.uploadSection}>
        <h3 style={styles.sectionTitle}>Ingest Document</h3>
        
        <div {...getRootProps()} style={{
          ...styles.dropzone,
          borderColor: isDragActive ? '#22d3ee' : selectedFile ? '#4ade80' : 'rgba(255,255,255,0.1)',
          background: isDragActive ? 'rgba(34,211,238,0.1)' : 'rgba(0,0,0,0.2)'
        }}>
          <input {...getInputProps()} />
          
          <AnimatePresence mode="wait">
            {selectedFile ? (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} style={styles.fileInfo}>
                <FileText size={24} color="#4ade80" />
                <div style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {selectedFile.name}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} style={styles.removeBtn}>
                  <X size={14} />
                </button>
              </motion.div>
            ) : (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} style={styles.placeholder}>
                <UploadCloud size={24} color="#94a3b8" />
                <span style={{fontSize:'13px', color:'#94a3b8'}}>Drop PDF or TXT here</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button 
          onClick={handleGenerate} 
          disabled={!selectedFile || isLoading}
          style={{
            ...styles.generateBtn,
            opacity: !selectedFile || isLoading ? 0.5 : 1,
            cursor: !selectedFile || isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          {isLoading ? "Processing..." : "Generate Graph"}
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { width: '280px', padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', gap: '24px' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  logo: { width: 32, height: 32, borderRadius: 8, background: 'rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(34,211,238,0.2)' },
  title: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '1px' },
  subtitle: { margin: 0, fontSize: '11px', color: '#64748b' },
  
  nav: { display: 'flex', flexDirection: 'column', gap: '8px' },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px',
    color: '#94a3b8', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
    border: '1px solid transparent', width: '100%', textAlign: 'left'
  },
  
  uploadSection: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '24px' },
  sectionTitle: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 },
  dropzone: {
    border: '1px dashed', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
    minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  fileInfo: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', color: '#e2e8f0', fontSize: '13px' },
  removeBtn: { width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: '#fff' },
  
  generateBtn: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', border: 'none', borderRadius: '10px',
    padding: '12px', color: '#fff', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '8px', transition: 'all 0.2s'
  }
};

export default SidePanel;