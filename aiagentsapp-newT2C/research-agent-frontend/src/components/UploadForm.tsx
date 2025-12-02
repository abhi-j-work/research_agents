// src/components/UploadForm.tsx

import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, UploadCloud } from 'lucide-react';
import type { ViewMode } from '../App';
import type { GraphDataPayload } from '../models';

const API_URL = 'http://localhost:8002';

interface UploadFormProps {
  setViewMode: (mode: ViewMode) => void;
  setGraphPayload: (payload: GraphDataPayload | null) => void;
}

const UploadForm: React.FC<UploadFormProps> = ({ setViewMode, setGraphPayload }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFile(event.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) return;

    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API_URL}/api/graph/from-file`, formData);
      setGraphPayload(response.data);
      setViewMode('graph');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="upload-section">
      <h2 className="upload-title">Generate from Document</h2>
      <form onSubmit={handleSubmit}>
        <label className="file-input-label">
            <UploadCloud size={18} />
            <span>{selectedFile ? selectedFile.name : 'Choose a .pdf or .txt file...'}</span>
            <input type="file" onChange={handleFileChange} accept=".pdf,.txt" className="file-input"/>
        </label>
        <button type="submit" className="generate-button" disabled={!selectedFile || isLoading}>
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Generate Knowledge Graph'}
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </section>
  );
};

export default UploadForm;