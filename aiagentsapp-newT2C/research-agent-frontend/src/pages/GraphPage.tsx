import React, { useEffect, useRef, useState } from 'react';
import { X, Download } from 'lucide-react';
import { motion } from 'framer-motion';

// --- Types -----------------------------------------------------------------
type FilterOptions = {
  entityTypes?: string[];
  relations?: string[];
  timeRanges?: string[];
  confidences?: string[];
  metrics?: string[];
  metricRange?: { min: number; max: number; step?: number };
};

type Filters = {
  entityType: string;
  relation: string;
  timeRange: string;
  confidence: string;
  metric: string;
  threshold: number;
};

interface GraphPageProps {
  setViewMode: () => void;
  htmlContent: string;
  downloadUrl: string;
  filterOptions?: FilterOptions;
  onFiltersChange?: (filters: Filters) => void;
  onPreviewCount?: (filters: Filters) => Promise<number>;
}

// --- Default filter options ------------------------------------------------
const DEFAULT_OPTIONS: FilterOptions = {
  entityTypes: ['All', 'Batch', 'Material', 'Vendor', 'Product', 'Sample', 'Plant'],
  relations: ['All', 'SAMPLED_BY', 'CONSUMES', 'PRODUCED_AS', 'SUPPLIED_BY', 'HAS_DETAILS'],
  timeRanges: ['All', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 365 days'],
  confidences: ['All', 'High', 'Medium', 'Low'],
  metrics: ['particle_count', 'metal_ppm', 'resistivity', 'viscosity'],
  metricRange: { min: 0, max: 1000, step: 1 },
};

const metricLabels: Record<string, string> = {
  particle_count: 'Particle count',
  metal_ppm: 'Metal (ppm)',
  resistivity: 'Resistivity',
  viscosity: 'Viscosity',
};

// --- Component -------------------------------------------------------------
const GraphPage: React.FC<GraphPageProps> = ({
  setViewMode,
  htmlContent,
  downloadUrl,
  filterOptions = DEFAULT_OPTIONS,
  onFiltersChange,
  onPreviewCount,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeSrc = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;

  const initialFilters: Filters = {
    entityType: 'All',
    relation: 'All',
    timeRange: 'All',
    confidence: 'All',
    metric: filterOptions.metrics?.[0] ?? DEFAULT_OPTIONS.metrics![0],
    threshold: filterOptions.metricRange?.min ?? 0,
  };

  const [filters, setFilters] = useState<Filters>(initialFilters);

  // Preview state
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const pendingRequestIdRef = useRef<string | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);

  // --- Inclusive filter builder --------------------------------------------
  const buildFilterPayload = (f: Filters) => ({
    entityType: f.entityType === 'All' ? undefined : f.entityType,
    relation: f.relation === 'All' ? undefined : f.relation,
    timeRange: f.timeRange === 'All' ? undefined : f.timeRange,
    confidence: f.confidence === 'All' ? undefined : f.confidence,
    metric: f.metric,
    threshold: f.threshold,
  });

  const sendFiltersToIframe = (payload: Filters) => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.postMessage({ type: 'graph-filters', filters: buildFilterPayload(payload) }, '*');
      }
    } catch (e) {
      console.warn('sendFiltersToIframe failed', e);
    }
  };

  // --- Effects -------------------------------------------------------------
  useEffect(() => {
    const t = window.setTimeout(() => sendFiltersToIframe(filters), 250);
    return () => window.clearTimeout(t);
  }, [htmlContent]);

  useEffect(() => sendFiltersToIframe(filters), [filters]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'preview-count-result' && data.requestId === pendingRequestIdRef.current) {
        const count = typeof data.count === 'number' ? data.count : Number(data.count || 0);
        setPreviewCount(count);
        setPreviewLoading(false);
        setPreviewError(null);
        pendingRequestIdRef.current = null;
        if (previewTimeoutRef.current) window.clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // --- Handlers ------------------------------------------------------------
  const handleApply = () => {
    onFiltersChange?.(filters);
    sendFiltersToIframe(filters);
  };

  const handleReset = () => {
    setFilters(initialFilters);
    onFiltersChange?.(initialFilters);
    sendFiltersToIframe(initialFilters);
  };

  const handlePreviewCount = async () => {
    setPreviewCount(null);
    setPreviewLoading(true);
    setPreviewError(null);

    if (onPreviewCount) {
      try {
        const count = await onPreviewCount(buildFilterPayload(filters));
        setPreviewCount(count);
      } catch (err: any) {
        setPreviewError(err?.message || 'Preview failed');
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    const requestId = `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
    pendingRequestIdRef.current = requestId;

    try {
      const win = iframeRef.current?.contentWindow;
      win?.postMessage({ type: 'preview-count', requestId, filters: buildFilterPayload(filters) }, '*');
    } catch (e) {
      setPreviewError('Unable to send preview request');
      setPreviewLoading(false);
      pendingRequestIdRef.current = null;
    }

    previewTimeoutRef.current = window.setTimeout(() => {
      if (pendingRequestIdRef.current === requestId) {
        setPreviewLoading(false);
        setPreviewError('No response from graph (timeout)');
        pendingRequestIdRef.current = null;
      }
    }, 8000) as unknown as number;
  };

  const overlayVariants = { hidden: { opacity: 0, scale: 0.97 }, visible: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 } };
  const transition = { duration: 0.3, ease: 'easeInOut' } as const;

  // --- Render --------------------------------------------------------------
  return (
    <motion.div style={styles.graphOverlay} variants={overlayVariants} initial="hidden" animate="visible" exit="exit" transition={transition}>
      <div style={styles.topRow}>
        <div style={styles.filtersContainer} role="region" aria-label="Graph filters">
          <FilterDropdown label="Entity" options={filterOptions.entityTypes ?? DEFAULT_OPTIONS.entityTypes!} value={filters.entityType} onChange={(v) => setFilters((s) => ({ ...s, entityType: v }))} />
          <FilterDropdown label="Relation" options={filterOptions.relations ?? DEFAULT_OPTIONS.relations!} value={filters.relation} onChange={(v) => setFilters((s) => ({ ...s, relation: v }))} />
          <FilterDropdown label="Time" options={filterOptions.timeRanges ?? DEFAULT_OPTIONS.timeRanges!} value={filters.timeRange} onChange={(v) => setFilters((s) => ({ ...s, timeRange: v }))} />
          <FilterDropdown label="Confidence" options={filterOptions.confidences ?? DEFAULT_OPTIONS.confidences!} value={filters.confidence} onChange={(v) => setFilters((s) => ({ ...s, confidence: v }))} />

          <div style={{ ...styles.filterRow, minWidth: 220 }}>
            <label style={styles.filterLabel}>Metric</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ ...styles.filterSelect, minWidth: 140 }} value={filters.metric} onChange={(e) => setFilters((s) => ({ ...s, metric: e.target.value }))}>
                {(filterOptions.metrics ?? DEFAULT_OPTIONS.metrics!).map((m) => (
                  <option key={m} value={m}>{metricLabels[m] ?? m}</option>
                ))}
              </select>

              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 260 }}>
                <label style={{ ...styles.filterLabel, marginBottom: 6 }}>Threshold ({metricLabels[filters.metric] ?? filters.metric})</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="range" min={(filterOptions.metricRange ?? DEFAULT_OPTIONS.metricRange)!.min} max={(filterOptions.metricRange ?? DEFAULT_OPTIONS.metricRange)!.max} step={(filterOptions.metricRange ?? DEFAULT_OPTIONS.metricRange)!.step ?? 1} value={filters.threshold} onChange={(e) => setFilters((s) => ({ ...s, threshold: Number(e.target.value) }))} style={{ flex: 1 }} />
                  <input type="number" value={filters.threshold} onChange={(e) => setFilters((s) => ({ ...s, threshold: Number(e.target.value) }))} style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(2,6,23,0.55)', color: '#fff' }} />
                </div>
              </div>
            </div>
          </div>

          <div style={styles.filterButtons}>
            <button onClick={handlePreviewCount} style={styles.previewButton}>{previewLoading ? '...checking' : 'Preview count'}</button>
            <div style={{ minWidth: 96, textAlign: 'center', color: '#cbd5e1' }} aria-live="polite">{previewLoading ? '...' : previewError ? <span style={{ color: '#fca5a5' }}>{previewError}</span> : previewCount !== null ? `${previewCount} matches` : '—'}</div>
            <button onClick={handleApply} style={styles.applyButton}>Apply</button>
            <button onClick={handleReset} style={styles.resetButton}>Reset</button>
          </div>
        </div>

        <div style={styles.graphActionsContainer}>
          <motion.a href={downloadUrl} download="knowledge_graph.html" title="Download Graph HTML" style={styles.actionButton} whileHover={{ scale: 1.15, boxShadow: '0 0 25px rgba(244, 114, 182, 0.7)', backgroundColor: 'rgba(244, 114, 182, 0.15)' }} whileTap={{ scale: 0.95 }}>
            <Download size={22} color="#f472b6" />
          </motion.a>

          <motion.button title="Close Graph View" style={styles.actionButton} onClick={setViewMode} whileHover={{ scale: 1.15, rotate: 90, boxShadow: '0 0 30px rgba(34, 211, 238, 0.8)', backgroundColor: 'rgba(34, 211, 238, 0.2)' }} whileTap={{ scale: 0.95 }}>
            <X size={30} color="#22d3ee" />
          </motion.button>
        </div>
      </div>

      <iframe ref={iframeRef} src={iframeSrc} title="Knowledge Graph" style={styles.iframe} sandbox="allow-scripts" onLoad={() => sendFiltersToIframe(filters)} />
    </motion.div>
  );
};

// --- Small presentational dropdown ----------------------------------------
const FilterDropdown: React.FC<{ label: string; options: string[]; value: string; onChange: (v: string) => void; }> = ({ label, options, value, onChange }) => (
  <div style={styles.filterRow}>
    <label style={styles.filterLabel}>{label}</label>
    <select style={styles.filterSelect} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} filter`}>
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

// --- Styles ----------------------------------------------------------------
const styles: { [key: string]: React.CSSProperties } = {
  graphOverlay: {
    position: 'fixed',
    top: '5vh',
    left: '5vw',
    height: '90vh',
    width: '90vw',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(12px) saturate(150%)',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
  },
  topRow: {
    position: 'absolute',
    top: '1rem',
    left: '1rem',
    right: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 110,
    pointerEvents: 'none', // children will re-enable pointer events individually
  },
  filtersContainer: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    pointerEvents: 'auto',
  },
  filterRow: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '140px',
  },
  filterLabel: {
    fontSize: '11px',
    color: '#cbd5e1',
    marginBottom: '6px',
  },
  filterSelect: {
    minWidth: '140px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(2,6,23,0.55)',
    color: '#fff',
    outline: 'none',
    boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.02)',
  },
  filterButtons: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    marginLeft: '0.25rem',
  },
  previewButton: {
    padding: '8px 12px',
    borderRadius: '10px',
    backgroundColor: '#60a5fa',
    color: '#021025',
    border: 'none',
    cursor: 'pointer',
  },
  applyButton: {
    padding: '8px 12px',
    borderRadius: '10px',
    backgroundColor: '#f472b6',
    color: '#021025',
    border: 'none',
    cursor: 'pointer',
  },
  resetButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    backgroundColor: 'transparent',
    color: '#cbd5e1',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
  },
  graphActionsContainer: {
    position: 'absolute',
    top: '1.5rem',
    right: '1.5rem',
    display: 'flex',
    gap: '1rem',
    zIndex: 120,
    pointerEvents: 'auto',
  },
  actionButton: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
    transition: 'background-color 0.2s, box-shadow 0.2s',
  },
  iframe: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: '100%',
    border: 'none',
    borderRadius: '1.5rem',
    zIndex: 1,
  },
};

export default GraphPage;
