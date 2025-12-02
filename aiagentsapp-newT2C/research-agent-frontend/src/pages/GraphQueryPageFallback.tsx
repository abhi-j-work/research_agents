// src/pages/GraphQueryPageFallback.tsx
import { useState } from "react";

interface Node {
  id: string;
  name: string;
  type?: string;
}

interface Edge {
  source: string;
  target: string;
  type?: string;
}

export function GraphQueryPageFallback() {
  const [query, setQuery] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [rawJson, setRawJson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        "http://localhost:8002/api/graph/text-to-cypher?useLLM=true",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: query }),
        }
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setRawJson(data);

      const extractedNodes: Node[] = [];
      const extractedEdges: Edge[] = [];

      // Parse nodes
      if (Array.isArray(data.results)) {
        data.results.forEach((item: any) => {
          Object.values(item).forEach((node: any) => {
            if (node?.id && !extractedNodes.find((n) => n.id === node.id)) {
              extractedNodes.push({ id: node.id, name: node.name, type: node.type || "Unknown" });
            }
          });
        });
      }

      // Parse edges
      if (Array.isArray(data.relationships)) {
        data.relationships.forEach((rel: any) => {
          if (rel.source && rel.target) {
            extractedEdges.push({ source: rel.source, target: rel.target, type: rel.type || "" });
          }
        });
      } else {
        for (let i = 0; i < extractedNodes.length - 1; i++) {
          extractedEdges.push({ source: extractedNodes[i].id, target: extractedNodes[i + 1].id });
        }
      }

      setNodes(extractedNodes);
      setEdges(extractedEdges);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch graph.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", gap: "0.5rem", padding: "1rem" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter English query..."
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Loading..." : "Run"}
        </button>
      </div>

      {error && <div style={{ color: "red", paddingLeft: "1rem" }}>{error}</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Fallback graph - list */}
        <div style={{ flex: 2, overflowY: "auto", padding: "1rem" }}>
          <h3>Graph Nodes</h3>
          <ul>
            {nodes.map((n) => (
              <li key={n.id}>
                {n.name} ({n.type}) - id: {n.id}
              </li>
            ))}
          </ul>

          <h3>Graph Edges</h3>
          <ul>
            {edges.map((e, idx) => (
              <li key={idx}>
                {e.source} → {e.target} {e.type ? `(${e.type})` : ""}
              </li>
            ))}
          </ul>
        </div>

        {/* JSON Output */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#f7f7f7",
            borderLeft: "1px solid #ccc",
            overflowY: "auto",
            padding: "1rem",
          }}
        >
          <h3>JSON Output</h3>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {rawJson ? JSON.stringify(rawJson, null, 2) : "No data yet."}
          </pre>
        </div>
      </div>
    </div>
  );
}
