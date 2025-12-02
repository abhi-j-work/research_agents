// src/pages/GraphQueryPage.tsx
import { useState, useEffect, useRef } from "react";
import * as d3 from "d3";

interface Node {
  id: string;
  name?: string;
  [key: string]: any;
}

interface Edge {
  source: string;
  target: string;
  type?: string;
}

export function GraphQueryPage() {
  const [query, setQuery] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleSubmit = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `http://localhost:8002/api/graph/text-to-cypher?useLLM=true`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: query }),
        }
      );

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();

      const extractedNodes: Node[] = [];
      const extractedEdges: Edge[] = [];

      if (data.results?.length) {
        data.results.forEach((item: any) => {
          Object.values(item).forEach((node: any) => {
            if (node?.id && !extractedNodes.find((n) => n.id === node.id)) {
              extractedNodes.push({
                id: node.id,
                name: node.name || node.id,
                ...node,
              });
            }
          });
        });

        // If backend doesn't send relationships, create fallback edges
        if (Array.isArray(data.relationships)) {
          data.relationships.forEach((rel: any) => {
            if (rel.source && rel.target) {
              extractedEdges.push({
                source: rel.source,
                target: rel.target,
                type: rel.type || "",
              });
            }
          });
        }

        if (extractedEdges.length === 0 && extractedNodes.length > 1) {
          for (let i = 0; i < extractedNodes.length - 1; i++) {
            extractedEdges.push({
              source: extractedNodes[i].id,
              target: extractedNodes[i + 1].id,
            });
          }
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

  // Draw graph whenever nodes/edges change
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 600;
    const height = 400;

    // If no edges, arrange nodes in a circle layout
    if (edges.length === 0) {
      const radius = Math.min(width, height) / 2.5;
      const angleStep = (2 * Math.PI) / nodes.length;

      const circleNodes = nodes.map((n, i) => ({
        ...n,
        x: width / 2 + radius * Math.cos(i * angleStep),
        y: height / 2 + radius * Math.sin(i * angleStep),
      }));

      svg
        .append("g")
        .selectAll("circle")
        .data(circleNodes)
        .enter()
        .append("circle")
        .attr("r", 15)
        .attr("fill", "#4f46e5")
        .attr("cx", (d) => d.x!)
        .attr("cy", (d) => d.y!);

      svg
        .append("g")
        .selectAll("text")
        .data(circleNodes)
        .enter()
        .append("text")
        .text((d) => d.name || d.id)
        .attr("font-size", 10)
        .attr("text-anchor", "middle")
        .attr("dy", -20)
        .attr("x", (d) => d.x!)
        .attr("y", (d) => d.y!);
      return;
    }

    // Force-directed layout if edges exist
    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .attr("stroke", "#aaa")
      .selectAll("line")
      .data(edges)
      .enter()
      .append("line");

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", 15)
      .attr("fill", "#4f46e5");

    const labels = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((d) => d.name || d.id)
      .attr("font-size", 10)
      .attr("dy", -20);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => (d.source as any).x)
        .attr("y1", (d: any) => (d.source as any).y)
        .attr("x2", (d: any) => (d.target as any).x)
        .attr("y2", (d: any) => (d.target as any).y);

      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);

      labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });
  }, [nodes, edges]);

  return (
    <div style={{ padding: "1rem" }}>
      <h2>English → Cypher Graph Query</h2>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter English query..."
          style={{
            flex: 1,
            padding: "0.5rem",
            border: "1px solid #555",
            borderRadius: "0.5rem",
            background: "#0f172a",
            color: "#f1f5f9",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            background: "#4f46e5",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Run"}
        </button>
      </div>

      {error && <div style={{ color: "red" }}>{error}</div>}
      {nodes.length === 0 && !loading && <div>No results yet.</div>}

      {nodes.length > 0 && (
        <div style={{ display: "flex", gap: "1rem" }}>
          {/* Graph */}
          <svg
            ref={svgRef}
            width={600}
            height={400}
            style={{ border: "1px solid #ccc", borderRadius: "0.5rem" }}
          ></svg>

          {/* JSON output */}
          <div
            style={{
              flex: 1,
              maxHeight: 400,
              overflow: "auto",
              background: "#f8fafc",
              borderRadius: "0.5rem",
              padding: "0.5rem",
            }}
          >
            <h4>JSON Output</h4>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(nodes, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
