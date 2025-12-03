// GraphChatModal.tsx
// UI improvements: scrollable chat with custom scrollbar, stable chat input, top-left close button,
// bigger modal with glass-pane glowing edge, and a dedicated boxed panel for graph rendering.
// All D3/logic unchanged from the working code — only layout/styles updated minimally.

import React, { useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, X, Bot, User, Code, FileJson } from "lucide-react";
import ReactMarkdown from 'react-markdown';

// --- Types ---
export interface Message {
  role: "user" | "assistant" | "error";
  content: string;
  cypher?: string;
  results?: any;
}

const API_URL = "http://localhost:8003";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name?: string;
  labels?: string[];
  properties?: { [key: string]: any };
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Edge {
  id?: string;
  source: string | Node;
  target: string | Node;
  type?: string;
  properties?: { [key: string]: any };
}

interface GraphChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// --- Assistant message component (unchanged) ---
const AssistantMessage = ({ msg }: { msg: Message }) => {
  const [isCypherVisible, setCypherVisible] = useState(false);
  const [isJsonVisible, setJsonVisible] = useState(false);

  return (
    <div style={styles.messageWrapper(msg.role)}>
      <Bot size={20} style={styles.avatar} />
      <div style={styles.messageBubble(msg.role)}>
        <ReactMarkdown>{msg.content}</ReactMarkdown>

        {(msg.cypher || msg.results) && (
          <div style={styles.chatActionsContainer}>
            {msg.cypher && (
              <button onClick={() => setCypherVisible(!isCypherVisible)} style={styles.chatActionButton}>
                <Code size={14} />
                <span>{isCypherVisible ? 'Hide' : 'Show'} Cypher</span>
              </button>
            )}
            {msg.results && (
              <button onClick={() => setJsonVisible(!isJsonVisible)} style={styles.chatActionButton}>
                <FileJson size={14} />
                <span>{isJsonVisible ? 'Hide' : 'Show'} JSON</span>
              </button>
            )}
          </div>
        )}

        <AnimatePresence>
          {isCypherVisible && msg.cypher && (
            <motion.pre {...codeAnimation} style={styles.codeBlock}>
              <code>{msg.cypher}</code>
            </motion.pre>
          )}
          {isJsonVisible && msg.results && (
            <motion.pre {...codeAnimation} style={styles.codeBlock}>
              <code>{JSON.stringify(msg.results, null, 2)}</code>
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};


// --- Main component ---
// Note: the D3 logic and association parsing is intentionally unchanged from the working code you had.
// This file contains only minimal and safe layout/style changes requested.
const GraphChatModal: React.FC<GraphChatModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! Ask a question like 'Show the entire graph with connections', and I will generate the knowledge graph for you. Click a node to expand its direct associations.",
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ---------- Small utilities ----------
  function makeEdgeId(a: string | number, b: string | number, type?: string) {
    const sa = String(a);
    const sb = String(b);
    const [x, y] = [sa, sb].sort();
    return `${x}::${type || ''}::${y}`;
  }
  function extractId(obj: any) {
    if (!obj) return null;
    if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
    return obj.id || obj.ID || obj.uuid || obj.identity || obj._id || null;
  }

  const palette = ["#6366f1", "#06b6d4", "#f97316", "#8b5cf6", "#ef4444", "#0ea5a4", "#7c3aed"];
  function colorForNode(node: Node) {
    if (node.properties?.assoc) return "#FFD54F";
    if (node.id === selectedNodeId) return "#ffbe0b";
    const label = (node.labels && node.labels[0]) || (node.properties && node.properties.type) || node.id;
    const hash = Array.from(String(label)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return palette[Math.abs(hash) % palette.length];
  }

  async function safeJsonResponse(res: Response) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await res.json();
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  // ---------- Query submit (unchanged) ----------
  const handleSubmitQuery = async () => {
    if (!inputQuery.trim()) return;
    const userMessage: Message = { role: "user", content: inputQuery };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setInputQuery("");
    setGraphData({ nodes: [], edges: [] });
    setSelectedNodeId(null);

    try {
      const res = await fetch(`${API_URL}/api/graph/text-to-cypher?useLLM=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMessage.content }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await safeJsonResponse(res);

      const extractedNodes: Node[] = [];
      const extractedEdges: Edge[] = [];
      const nodeIds = new Set<string>();
      const edgeIds = new Set<string>();

      if (Array.isArray(data.results) && data.results.length) {
        data.results.forEach((row: any) => {
          Object.values(row).forEach((entity: any) => {
            if (!entity) return;
            if (Array.isArray(entity) && entity.length === 3 && typeof entity[1] === 'string') {
              const sObj = entity[0], relType = entity[1], tObj = entity[2];
              const sId = extractId(sObj), tId = extractId(tObj);
              if (sId && tId) {
                const sid = String(sId), tid = String(tId);
                const eid = makeEdgeId(sid, tid, relType);
                if (!edgeIds.has(eid)) { extractedEdges.push({ id: eid, source: sid, target: tid, type: relType, properties: {} }); edgeIds.add(eid); }
                if (!nodeIds.has(sid)) { nodeIds.add(sid); extractedNodes.push({ id: sid, name: sObj.name || sid, properties: { ...sObj } }); }
                if (!nodeIds.has(tid)) { nodeIds.add(tid); extractedNodes.push({ id: tid, name: tObj.name || tid, properties: { ...tObj } }); }
              }
            } else if (entity && typeof entity === 'object') {
              if (entity.source && entity.target && entity.type) {
                const s = String(entity.source), t = String(entity.target), eid = makeEdgeId(s, t, entity.type);
                if (!edgeIds.has(eid)) { extractedEdges.push({ id: eid, source: s, target: t, type: entity.type, properties: { ...entity } }); edgeIds.add(eid); }
              } else if (entity.id && !nodeIds.has(String(entity.id))) {
                const nid = String(entity.id); nodeIds.add(nid); extractedNodes.push({ id: nid, name: entity.name || nid, properties: { ...entity } });
              }
            }
          });
        });
      }

      setMessages(prev => [...prev, { role: "assistant", content: `I found ${extractedNodes.length} nodes and ${extractedEdges.length} relationships. The graph is now displayed.`, cypher: data.cypher, results: data.results }]);
      setGraphData({ nodes: extractedNodes, edges: extractedEdges });

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { role: "error", content: err.message || "Failed to fetch graph." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Node association fetch & merge (unchanged) ----------
  async function fetchNodeAssociationsFor(nodeId: string) {
    if (!nodeId) return;
    setIsLoading(true);
    setSelectedNodeId(nodeId);

    try {
      const res = await fetch(`${API_URL}/api/graph/node-associations?nodeId=${encodeURIComponent(nodeId)}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const raw = await safeJsonResponse(res);
      console.debug("node-associations raw:", raw);

      let associationNodes: Node[] = [];
      let associationEdges: Edge[] = [];
      let cypherText: string | undefined;
      let rawResults: any = raw;

      if (raw && Array.isArray(raw.results) && raw.results.length > 0 && (raw.results[0].associatedNodes || raw.results[0].relationships || raw.results[0].n)) {
        const row = raw.results[0];
        cypherText = raw.cypher || undefined;
        rawResults = raw;

        if (Array.isArray(row.associatedNodes)) {
          row.associatedNodes.forEach((n: any) => {
            const id = String(extractId(n) || n.id || n.ID || n.name || Math.random().toString(36).slice(2));
            associationNodes.push({ id, name: n.name || n.title || id, labels: n.labels || [], properties: { ...n, assoc: true } });
          });
        }

        if (Array.isArray(row.relationships)) {
          row.relationships.forEach((trip: any) => {
            if (!Array.isArray(trip) || trip.length < 3) return;
            const aObj = trip[0], relType = trip[1], bObj = trip[2];
            const aId = String(extractId(aObj) || aObj.id || aObj.ID || aObj.name || Math.random().toString(36).slice(2));
            const bId = String(extractId(bObj) || bObj.id || bObj.ID || bObj.name || Math.random().toString(36).slice(2));
            const eid = makeEdgeId(aId, bId, relType);
            associationEdges.push({ id: eid, source: aId, target: bId, type: relType, properties: { raw: trip, assoc: true } });

            if (!associationNodes.find(n => n.id === aId)) associationNodes.push({ id: aId, name: aObj?.name || aId, labels: aObj?.labels || [], properties: { ...(aObj || {}), assoc: true } });
            if (!associationNodes.find(n => n.id === bId)) associationNodes.push({ id: bId, name: bObj?.name || bId, labels: bObj?.labels || [], properties: { ...(bObj || {}), assoc: true } });
          });
        }

        if (row.n && extractId(row.n)) {
          const nid = String(extractId(row.n));
          if (!associationNodes.find(n => n.id === nid)) associationNodes.push({ id: nid, name: row.n.name || nid, properties: { ...(row.n || {}), assoc: true } });
        }
      } else {
        // fallback parsing
        const maybeGraph = (raw && raw.graph) ? raw.graph : (Array.isArray(raw) && raw[0] && raw[0].graph ? raw[0].graph : null);
        if (maybeGraph && Array.isArray(maybeGraph.nodes) && maybeGraph.nodes.length > 0) {
          associationNodes = maybeGraph.nodes.map((n: any, i: number) => ({ id: String(extractId(n) || n.id || `n-${i}`), name: n.name || n.title || String(extractId(n) || n.id || `n-${i}`), labels: n.labels || [], properties: { ...n, assoc: true } }));
          associationEdges = (maybeGraph.edges || []).map((e: any, i: number) => {
            const s = String(e.source ?? e.from ?? ''), t = String(e.target ?? e.to ?? ''), type = e.type || e.label || '';
            return { id: e.id || makeEdgeId(s, t, type), source: s, target: t, type, properties: { ...e, assoc: true } };
          });
          cypherText = raw.cypher || undefined;
          rawResults = raw;
        } else {
          const deepFind = (obj: any): any => {
            if (!obj) return null;
            if (Array.isArray(obj)) {
              for (const it of obj) {
                const found = deepFind(it);
                if (found) return found;
              }
              return null;
            }
            if (typeof obj === 'object') {
              if (obj.associatedNodes || obj.relationships) return obj;
              if (obj.graph && (Array.isArray(obj.graph.nodes) || Array.isArray(obj.graph.edges))) return obj.graph;
              for (const k of Object.keys(obj)) {
                const found = deepFind(obj[k]);
                if (found) return found;
              }
            }
            return null;
          };
          const found = deepFind(raw);
          if (found) {
            if (found.nodes && Array.isArray(found.nodes)) {
              associationNodes = found.nodes.map((n: any, i: number) => ({ id: String(extractId(n) || n.id || `n-${i}`), name: n.name || n.title || String(extractId(n) || n.id || `n-${i}`), labels: n.labels || [], properties: { ...n, assoc: true } }));
              associationEdges = (found.edges || []).map((e: any, i: number) => {
                const s = String(e.source ?? e.from ?? ''), t = String(e.target ?? e.to ?? ''), type = e.type || e.label || '';
                return { id: e.id || makeEdgeId(s, t, type), source: s, target: t, type, properties: { ...e, assoc: true } };
              });
            } else {
              if (Array.isArray(found.associatedNodes)) {
                found.associatedNodes.forEach((n: any, i: number) => associationNodes.push({ id: String(extractId(n) || n.id || `an-${i}`), name: n.name || n.title || String(extractId(n) || n.id || `an-${i}`), properties: { ...n, assoc: true } }));
              }
              if (Array.isArray(found.relationships)) {
                found.relationships.forEach((trip: any, i: number) => {
                  if (!Array.isArray(trip) || trip.length < 3) return;
                  const a = trip[0], relType = trip[1], b = trip[2];
                  const aId = String(extractId(a) || a.id || a.name || `ra-${i}`);
                  const bId = String(extractId(b) || b.id || b.name || `rb-${i}`);
                  const eid = makeEdgeId(aId, bId, relType);
                  associationEdges.push({ id: eid, source: aId, target: bId, type: relType, properties: { raw: trip, assoc: true }});
                  if (!associationNodes.find(n => n.id === aId)) associationNodes.push({ id: aId, name: a?.name || aId, properties: { ...(a || {}), assoc: true }});
                  if (!associationNodes.find(n => n.id === bId)) associationNodes.push({ id: bId, name: b?.name || bId, properties: { ...(b || {}), assoc: true }});
                });
              }
            }
          }
        }
      }

      // dedupe & ensure edge endpoints exist
      const nodeMap = new Map<string, Node>();
      associationNodes.forEach(n => { if (n && n.id) nodeMap.set(String(n.id), { ...n, id: String(n.id), name: n.name || String(n.id), properties: { ...(n.properties || {}), assoc: true } }); });
      associationEdges.forEach(e => { const s = String(e.source), t = String(e.target); if (!nodeMap.has(s)) nodeMap.set(s, { id: s, name: s, properties: { assoc: true } }); if (!nodeMap.has(t)) nodeMap.set(t, { id: t, name: t, properties: { assoc: true } }); });
      associationNodes = Array.from(nodeMap.values());

      console.debug("Parsed associations:", { nodeCount: associationNodes.length, edgeCount: associationEdges.length });

      if (associationNodes.length === 0 && associationEdges.length === 0) {
        setMessages(prev => [...prev, { role: "assistant", content: `No associations were parsed from the server response for node ${nodeId}. Check console for raw response.` }]);
        return;
      }

      // Merge safely (preserve node positions). Filtering dangling assoc nodes/edges
      setGraphData(prev => {
        const existingNodeMap = new Map(prev.nodes.map(n => [n.id, n]));
        const existingEdgeIds = new Set(prev.edges.map(e => e.id || makeEdgeId(String(e.source), String(e.target), e.type || '')));

        const combinedNodes: Node[] = [...prev.nodes];

        // center coordinates from clicked node (if present)
        const centerNode = prev.nodes.find(n => n.id === nodeId);
        const centerX = (centerNode && typeof centerNode.x === 'number') ? centerNode.x : undefined;
        const centerY = (centerNode && typeof centerNode.y === 'number') ? centerNode.y : undefined;

        const newlyAdded: Node[] = [];
        associationNodes.forEach((n, i) => {
          if (!existingNodeMap.has(n.id)) {
            const nodeCopy: Node = { ...n };
            if (typeof centerX === 'number' && typeof centerY === 'number') {
              const radius = 80 + Math.min(300, associationNodes.length * 8);
              const angle = (i / Math.max(1, associationNodes.length)) * Math.PI * 2;
              nodeCopy.x = Math.round(centerX + radius * Math.cos(angle));
              nodeCopy.y = Math.round(centerY + radius * Math.sin(angle));
              nodeCopy.fx = nodeCopy.x;
              nodeCopy.fy = nodeCopy.y;
            }
            combinedNodes.push(nodeCopy);
            newlyAdded.push(nodeCopy);
            existingNodeMap.set(n.id, nodeCopy);
          } else {
            const ex = existingNodeMap.get(n.id)!;
            ex.properties = { ...(ex.properties || {}), ...(n.properties || {}) };
            ex.name = n.name || ex.name;
            ex.labels = n.labels || ex.labels;
          }
        });

        // Merge edges (only if both endpoints exist)
        const combinedEdges: Edge[] = [...prev.edges];
        const allNodeIds = new Set<string>(Array.from(existingNodeMap.keys()));
        associationEdges.forEach(e => {
          const s = String(e.source), t = String(e.target);
          const eid = e.id || makeEdgeId(s, t, e.type || '');
          if (!existingEdgeIds.has(eid) && allNodeIds.has(s) && allNodeIds.has(t)) {
            combinedEdges.push({ ...e, id: eid });
            existingEdgeIds.add(eid);
          }
        });

        // filter edges with missing endpoints
        const filteredEdges = combinedEdges.filter(edge => {
          const s = String(edge.source);
          const t = String(edge.target);
          return allNodeIds.has(s) && allNodeIds.has(t);
        });

        // degree calc to remove dangling assoc nodes
        const degree = new Map<string, number>();
        filteredEdges.forEach(e => {
          const s = String(e.source), t = String(e.target);
          degree.set(s, (degree.get(s) || 0) + 1);
          degree.set(t, (degree.get(t) || 0) + 1);
        });

        const finalNodes = combinedNodes.filter(n => {
          if (!n.properties?.assoc) return true;
          if (String(n.id) === nodeId) return true;
          const deg = degree.get(n.id) || 0;
          return deg > 0;
        });

        const finalNodeIds = new Set(finalNodes.map(n => n.id));
        const finalEdges = filteredEdges.filter(e => finalNodeIds.has(String(e.source)) && finalNodeIds.has(String(e.target)));

        return { nodes: finalNodes, edges: finalEdges };
      });

      setMessages(prev => [...prev, { role: "assistant", content: `Displaying direct associations for node ID: **${nodeId}**. Found ${associationNodes.length} associated nodes and ${associationEdges.length} relationships.`, cypher: cypherText, results: rawResults }]);

    } catch (err: any) {
      console.error("Failed to fetch node associations:", err);
      setMessages(prev => [...prev, { role: "error", content: `Failed to fetch associations for node ${nodeId}: ${err?.message || err}` }]);
    } finally {
      setIsLoading(false);
    }
  }

  // hint on unselect
  useEffect(() => {
    if (!selectedNodeId) {
      setMessages(prev => {
        const latest = prev[prev.length - 1];
        if (latest && latest.content && latest.content.includes("Node unselected")) return prev;
        return [...prev, { role: "assistant", content: "Node unselected. Click on a node to see its direct associations!" }];
      });
    }
  }, [selectedNodeId]);

  // ---------- D3 rendering (kept as in working code) ----------
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentG = svg.select("g");
    if (!graphData.nodes.length && currentG.empty()) { svg.selectAll("*").remove(); return; }
    if (!currentG.empty()) currentG.remove();
    const g = svg.append("g");

    // defs
    const defs = svg.select("defs");
    if (defs.empty()) {
      const d = svg.append("defs");
      d.append("filter").attr("id", "soft-blur").append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "blur");
    }

    const width = svg.node()!.getBoundingClientRect().width;
    const height = svg.node()!.getBoundingClientRect().height;

    const linkForce = d3.forceLink<Node, Edge>(graphData.edges).id((d: any) => d.id).distance(120).strength(1);

    const simulation = d3.forceSimulation<Node, Edge>(graphData.nodes)
      .force("link", linkForce)
      .force("charge", d3.forceManyBody().strength(-500))
      .force("collide", d3.forceCollide<Node>().radius((d:any) => 28).strength(0.9))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.08))
      .force("y", d3.forceY(height / 2).strength(0.08));

    const linkGroup = g.append("g")
      .attr("stroke-opacity", 1)
      .selectAll("g")
      .data(graphData.edges, (d: any) => d.id || `${String(d.source)}-${d.type}-${String(d.target)}`)
      .join("g")
      .style("opacity", 0);

    linkGroup.each(function(d:any) {
      const container = d3.select(this);
      container.append("line").attr("class", "link-glow")
        .attr("stroke-width", d.properties?.assoc ? 6 : 4)
        .attr("stroke", d.properties?.assoc ? "#ffecb5" : "#cbd5e1")
        .attr("opacity", d.properties?.assoc ? 0.36 : 0.12);

      container.append("line").attr("class", "link-main")
        .attr("stroke-width", d.properties?.assoc ? 2.2 : 1)
        .attr("stroke", d.properties?.assoc ? "#f59e0b" : "#9CA3AF")
        .attr("opacity", d.properties?.assoc ? 0.95 : 0.8);
    });

    const nodeGroup = g.append("g")
      .selectAll("g")
      .data(graphData.nodes, (d: Node) => d.id)
      .join("g")
      .call(d3.drag<any, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))
      .on("click", (event, d) => {
        event.stopPropagation();
        fetchNodeAssociationsFor(d.id);
      })
      .style("opacity", 0);

    nodeGroup.each(function(d:any) {
      const container = d3.select(this);
      container.append("circle").attr("class", "node-glow")
        .attr("r", 20)
        .attr("fill", colorForNode(d))
        .attr("opacity", 0.18);

      container.append("circle").attr("class", "node-main")
        .attr("r", 14)
        .attr("fill", colorForNode(d))
        .attr("stroke", d.id === selectedNodeId ? "#f59e0b" : (d.properties?.assoc ? "#b45309" : "#ffffff"))
        .attr("stroke-width", d.id === selectedNodeId ? 3 : 1.6)
        .style("cursor", "pointer");

      container.append("text")
        .text(d.name || d.id)
        .attr("x", 22)
        .attr("y", 6)
        .attr("fill", "#f8fafc")
        .attr("font-size", 12)
        .attr("pointer-events", "none");
    });

    linkGroup.transition().duration(600).style("opacity", 1);
    nodeGroup.transition().duration(600).style("opacity", 1);

    linkForce.links(graphData.edges);

    simulation.on("end", () => {
      setTimeout(() => {
        simulation.nodes().forEach((n:any) => {
          if (n.fx != null && n.properties?.assoc) {
            n.fx = null; n.fy = null;
          }
        });
        simulation.alpha(0.6).restart();
      }, 700);
    });

    simulation.on("tick", () => {
      linkGroup.selectAll<SVGLineElement, Edge>(".link-glow")
        .attr("x1", d => (d.source as Node).x!).attr("y1", d => (d.source as Node).y!)
        .attr("x2", d => (d.target as Node).x!).attr("y2", d => (d.target as Node).y!);

      linkGroup.selectAll<SVGLineElement, Edge>(".link-main")
        .attr("x1", d => (d.source as Node).x!).attr("y1", d => (d.source as Node).y!)
        .attr("x2", d => (d.target as Node).x!).attr("y2", d => (d.target as Node).y!);

      nodeGroup.attr("transform", (d:any) => `translate(${d.x!},${d.y!})`);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4]).on("zoom", (event) => { g.attr("transform", event.transform); });
    svg.call(zoom);

    if (selectedNodeId) {
      setTimeout(() => {
        try {
          const selectedNode = graphData.nodes.find(n => n.id === selectedNodeId);
          if (!selectedNode) return;
          const neighborIds = new Set<string>();
          graphData.edges.forEach(e => {
            const s = String(e.source), t = String(e.target);
            if (s === selectedNodeId) neighborIds.add(t);
            if (t === selectedNodeId) neighborIds.add(s);
          });
          const focusNodes = graphData.nodes.filter(n => n.id === selectedNodeId || neighborIds.has(n.id));
          if (!focusNodes.length) return;

          const minX = d3.min(focusNodes, (d:any) => d.x!)!;
          const maxX = d3.max(focusNodes, (d:any) => d.x!)!;
          const minY = d3.min(focusNodes, (d:any) => d.y!)!;
          const maxY = d3.max(focusNodes, (d:any) => d.y!)!;
          const boxWidth = Math.max(60, maxX - minX);
          const boxHeight = Math.max(60, maxY - minY);

          const padding = 120;
          const scale = Math.min(4, Math.max(0.5, Math.min((width - padding) / boxWidth, (height - padding) / boxHeight)));
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const translateX = width / 2 - scale * centerX;
          const translateY = height / 2 - scale * centerY;
          const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

          svg.transition().duration(600).call((zoom as any).transform, transform);
        } catch (err) {
          console.debug("Focus error", err);
        }
      }, 450);
    }

    const handleClickBackground = () => { setSelectedNodeId(null); };
    svg.on("click", handleClickBackground);

    function dragstarted(event:any, d: Node) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(event:any, d: Node) { d.fx = event.x; d.fy = event.y; }
    function dragended(event:any, d: Node) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

    return () => {
      simulation.stop();
      svg.on("click", null);
    };
  }, [graphData, selectedNodeId]);

  // auto-scroll to bottom when messages change
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // small legend for colors
  const Legend = () => (
    <div style={{
      position: 'absolute',
      left: 16,
      top: 12,
      padding: '8px 10px',
      background: 'rgba(10,12,16,0.55)',
      border: '1px solid rgba(255,255,255,0.03)',
      borderRadius: 8,
      color: '#e6eef6',
      zIndex: 6,
      fontSize: 12
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Legend</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ width: 12, height: 12, background: '#FFD54F', display: 'inline-block', borderRadius: 3 }} />
        <span>Associated nodes</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ width: 12, height: 12, background: palette[0], display: 'inline-block', borderRadius: 3 }} />
        <span>Other node types (palette)</span>
      </div>
      <div style={{ fontSize: 11, color: '#a8b6c6' }}>Click a node to expand</div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* small style block so custom scrollbar and consistent input sizing are available */}
          <style>{`
            /* custom thin scrollbar for message list */
            .graph-chat-message-list {
              scrollbar-width: thin;
              scrollbar-color: rgba(160,160,160,0.4) transparent;
            }
            .graph-chat-message-list::-webkit-scrollbar { width: 10px; }
            .graph-chat-message-list::-webkit-scrollbar-track { background: transparent; }
            .graph-chat-message-list::-webkit-scrollbar-thumb { background: rgba(160,160,160,0.32); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
            /* ensure input doesn't overflow */
            .graph-chat-input { box-sizing: border-box; width: 100%; min-width: 0; }
          `}</style>

          <motion.div style={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* outer glow wrapper (glass pane effect) */}
            <div style={styles.glowWrapper}>
              <motion.div style={styles.modalContainer} {...modalAnimation}>
                {/* close button moved to top-left per request */}
                <motion.button aria-label="Close" onClick={onClose} style={styles.closeButton} whileHover={{ scale: 1.06, backgroundColor: 'rgba(239, 68, 68, 0.85)' }} whileTap={{ scale: 0.96 }}>
                  <X size={20}/>
                </motion.button>

                <div style={styles.contentGrid}>
                  {/* Graph panel wrapped in a dedicated card-like box */}
                  <div style={styles.graphPanelOuter}>
                    <div style={styles.graphCard}>
                      <svg ref={svgRef} style={styles.svg}></svg>
                      <Legend />
                      {graphData.nodes.length === 0 && !isLoading && (
                        <div style={styles.placeholder}>Your generated graph will appear here. Click on a node to see its associations!</div>
                      )}
                    </div>
                  </div>

                  {/* Chat column */}
                  <div style={styles.chatContainer}>
                    <div style={styles.messageList} className="graph-chat-message-list">
                      {messages.map((msg, index) => msg.role === 'user' ? (
                        <div key={index} style={styles.messageWrapper('user')}>
                          <div style={styles.messageBubble('user')}>{msg.content}</div>
                          <User size={20} style={styles.avatar} />
                        </div>
                      ) : (
                        <AssistantMessage key={index} msg={msg} />
                      ))}
                      {isLoading &&
                        <div style={styles.messageWrapper('assistant')}>
                          <Bot size={20} style={styles.avatar} />
                          <div style={styles.messageBubble('assistant')}><Loader2 size={16} className="animate-spin" /></div>
                        </div>
                      }
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input area (stable sizing; input will not overflow) */}
                    <form onSubmit={(e) => { e.preventDefault(); handleSubmitQuery(); }} style={styles.inputForm}>
                      <input
                        className="graph-chat-input"
                        type="text"
                        value={inputQuery}
                        onChange={(e) => setInputQuery(e.target.value)}
                        placeholder="Ask a question..."
                        style={styles.chatInput}
                        disabled={isLoading}
                      />
                      <button type="submit" style={styles.sendButton} disabled={isLoading || !inputQuery.trim()}><Send size={18} /></button>
                    </form>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- Animations & Styles ---
// minor size increases and glow effect added at the top-level wrapper (glowWrapper)
const modalAnimation = { initial: { scale: 0.98, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.98, opacity: 0 }, transition: { duration: 0.28, ease: 'easeInOut' } };
const codeAnimation = { initial: { opacity: 0, height: 0, marginTop: 0 }, animate: { opacity: 1, height: 'auto', marginTop: '0.75rem' }, exit: { opacity: 0, height: 0, marginTop: 0 } };

const styles: { [key: string]: React.CSSProperties | ((role?: Message['role']) => React.CSSProperties) } = {
  overlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  // glow wrapper creates the glass edge glow (subtle)
  glowWrapper: {
    borderRadius: 18,
    padding: 8,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
    boxShadow: '0 6px 40px rgba(99,102,241,0.12), 0 0 40px rgba(255, 213, 79, 0.04)',
  },
  modalContainer: {
    width: '94%',
    height: '90vh',
    maxWidth: '1500px',
    background: 'linear-gradient(180deg, rgba(10,14,20,0.82), rgba(6,10,16,0.9))',
    borderRadius: '14px',
    border: '1px solid rgba(124, 144, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(2,6,23,0.6), inset 0 0 40px rgba(99,102,241,0.02)',
  },
  closeButton: { position: 'absolute', top: '12px', left: '12px', right: 'auto', background: 'rgba(17,24,39,0.7)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(6px)', color: '#e5e7eb', cursor: 'pointer', zIndex: 60, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease-in-out' },
  contentGrid: { display: 'grid', gridTemplateColumns: '2.2fr 1fr', flex: 1, height: '100%', gap: 12, padding: 16 },
  // Graph panel outer area (align & center)
  graphPanelOuter: { padding: 6, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' },
  // Graph card: dedicated box for the graph rendering
  graphCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid rgba(255,255,255,0.03)',
    background: 'linear-gradient(180deg, rgba(4,8,12,0.65), rgba(3,7,11,0.8))',
    boxShadow: 'inset 0 4px 18px rgba(2,6,23,0.6), 0 12px 30px rgba(2,6,23,0.45)',
    minHeight: 0 // allow flexbox children to shrink properly
  },
  svg: { width: '100%', height: '100%', display: 'block' },
  placeholder: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#9aa5b1', fontSize: '1.1rem', zIndex: 2 },
  chatContainer: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 300 },
  // message list: scrollable and shows older messages when scrolled up
  messageList: { flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },
  messageWrapper: (role?: Message['role']) => ({ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: 0, justifyContent: role === 'user' ? 'flex-end' : 'flex-start' }),
  avatar: { color: '#9ca3af', flexShrink: 0, marginTop: '0.25rem' },
  messageBubble: (role?: Message['role']) => ({ padding: '0.75rem 1rem', borderRadius: '1rem', maxWidth: '100%', color: role === 'error' ? '#fde2e2' : (role === 'user' ? '#fff' : '#e5e7eb'), background: role === 'error' ? '#5b0f0f' : (role === 'user' ? '#4f46e5' : '#10202c'), wordBreak: 'break-word' }),
  chatActionsContainer: { display: 'flex', gap: '0.5rem', marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem' },
  chatActionButton: { display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af', padding: '0.25rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', transition: 'background-color 0.2s' },
  codeBlock: { padding: '0.75rem', background: 'rgba(0,0,0,0.35)', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#c7d2fe', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },

  // input area: stable sizing, input does not overflow
  inputForm: { display: 'flex', padding: '12px', borderTop: '1px solid rgba(255,255,255,0.02)', gap: 10, alignItems: 'center', background: 'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))' },
  chatInput: { flex: 1, background: '#0f1724', border: '1px solid #1f2a3a', borderRadius: '0.6rem', color: '#fff', padding: '0.75rem 12px', outline: 'none', fontSize: 14, minWidth: 0 },
  sendButton: { background: '#0ea5a4', border: 'none', color: '#fff', padding: '10px 12px', borderRadius: '0.6rem', cursor: 'pointer', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }
};

export default GraphChatModal;
