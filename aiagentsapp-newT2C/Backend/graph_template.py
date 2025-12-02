# Backend/graph_template.py

import json
from models import KnowledgeGraphResponse

def create_graph_html(
    graph_data: KnowledgeGraphResponse, 
    insight: dict,
    pulse_enabled: bool,
    pulse_amplitude: float,
    pulse_speed: float
) -> str:
    """
    Generates the final, visually stunning HTML knowledge graph with
    a sharp "blinking" pulse effect.
    """
    nodes_list = []
    for node in graph_data.nodes:
        node_dict = node.dict()
        node_dict['label'] = node.id
        node_dict['group'] = node.type
        node_dict['title'] = f"Type: {node.type}"
        nodes_list.append(node_dict)

    edges_list = [
        {"from": rel.source, "to": rel.target, "label": rel.type} 
        for rel in graph_data.relationships
    ]

    nodes_json = json.dumps(nodes_list, indent=4)
    edges_json = json.dumps(edges_list, indent=4)
    highlight_nodes_json = json.dumps(insight.get("nodes", []))
    pulse_enabled_json = json.dumps(pulse_enabled)
    pulse_amplitude_json = json.dumps(pulse_amplitude)
    pulse_speed_json = json.dumps(pulse_speed)

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>AI Knowledge Graph</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.2/dist/dist/vis-network.min.css" />
        <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.2/dist/vis-network.min.js"></script>
        <style>
            html, body {{
                margin: 0; padding: 0; overflow: hidden;
                width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            }}
            #mynetwork {{
                width: 100%; height: 100vh;
                background-color: #0D1117;
                position: absolute; top: 0; left: 0; z-index: 1;
            }}
        </style>
    </head>
    <body>
        <div id="mynetwork"></div>

        <script type="text/javascript">
            var nodes, edges, network;

            function drawGraph() {{
                nodes = new vis.DataSet({nodes_json});
                edges = new vis.DataSet({edges_json});
                
                var container = document.getElementById('mynetwork');
                var data = {{ nodes: nodes, edges: edges }};
                
                var options = {{
                    nodes: {{
                        shape: 'dot',
                        borderWidth: 2,
                        font: {{ color: '#e0e0e0', size: 14, strokeWidth: 0 }}
                    }},
                    edges: {{
                        width: 1.5,
                        color: {{ color: 'rgba(100, 100, 100, 0.6)' }},
                        arrows: {{ to: {{ enabled: true, scaleFactor: 0.8, type: 'arrow' }} }},
                        smooth: {{ type: 'dynamic', roundness: 0.5 }}
                    }},
                    physics: {{
                        forceAtlas2Based: {{
                            gravitationalConstant: -40,
                            centralGravity: 0.005,
                            springLength: 250,
                            springConstant: 0.1,
                            avoidOverlap: 0.9
                        }},
                        solver: 'forceAtlas2Based',
                        stabilization: {{ iterations: 300 }}
                    }},
                    interaction: {{
                        hover: true,
                        tooltipDelay: 200,
                        dragNodes: true
                    }}
                }};
                
                network = new vis.Network(container, data, options);
                setupAdvancedFeatures();
            }}

            function setupAdvancedFeatures() {{
                const HIGHLIGHT_NODES = {highlight_nodes_json};
                const PULSE_ENABLED = {pulse_enabled_json};
                const PULSE_AMPLITUDE = {pulse_amplitude_json};
                const PULSE_STEP = {pulse_speed_json};

                function applyGlobalStyles() {{
                    // ... (This function is correct and remains the same)
                    const deg = {{}};
                    edges.get().forEach(e => {{ deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; }});
                    let maxDeg = Math.max(...Object.values(deg).map(Number), 1);
                    const updates = nodes.get().map(n => {{
                        const d = deg[n.id] || 0;
                        const size = Math.round(10 + (d / maxDeg) * 20);
                        let paletteColor = '#888888';
                        const g = String(n.group).toLowerCase();
                        if(g.includes('process')) paletteColor = '#F9A825';
                        else if(g.includes('material')) paletteColor = '#E91E63';
                        else if(g.includes('device')) paletteColor = '#FF5722';
                        else if(g.includes('technology')) paletteColor = '#03A9F4';
                        else if(g.includes('chemical')) paletteColor = '#9C27B0';
                        return {{ 
                            id: n.id, size: size, color: {{ background: paletteColor, border: paletteColor }},
                            shadow: {{ enabled: true, color: paletteColor, size: 25, x: 0, y: 0 }}
                        }};
                    }});
                    nodes.update(updates);
                }}

                function applyHighlight() {{
                    // ... (Highlight styles are correct and remain the same)
                    if (HIGHLIGHT_NODES.length === 0) return;
                    const highlightColor = '#00FFC4';
                    nodes.update(HIGHLIGHT_NODES.map(id => ({{
                        id: id,
                        color: {{ background: highlightColor, border: highlightColor }},
                        shadow: {{ enabled: true, color: highlightColor, size: 60 }},
                        font: {{ size: 18 }}
                    }})));
                    const allEdges = edges.get();
                    const edgeUpdates = [];
                    for(let i = 0; i < HIGHLIGHT_NODES.length - 1; i++) {{
                        const fromNode = HIGHLIGHT_NODES[i];
                        const toNode = HIGHLIGHT_NODES[i+1];
                        const foundEdges = allEdges.filter(e => (e.from === fromNode && e.to === toNode) || (e.from === toNode && e.to === fromNode));
                        foundEdges.forEach(edge => {{
                            edgeUpdates.push({{
                                id: edge.id, color: {{ color: highlightColor }}, width: 2.5,
                                shadow: {{ enabled: true, color: highlightColor, size: 30 }}
                            }});
                        }});
                    }}
                    edges.update(edgeUpdates);
                    
                    if (!PULSE_ENABLED) return;
                    
                    const baseSizes = {{}};
                    HIGHLIGHT_NODES.forEach(id => baseSizes[id] = nodes.get(id)?.size || 20);
                    
                    let phase = 0;
                    function raf() {{
                        phase += PULSE_STEP;
                        const updates = HIGHLIGHT_NODES.map(id => ({{
                            // --- NEW BLINKING EFFECT ---
                            // By raising the sin wave to a high power (e.g., 8), we turn the
                            // smooth wave into a sharp peak, creating a "blink" or "flash".
                            id: id, size: baseSizes[id] + PULSE_AMPLITUDE * Math.pow(Math.abs(Math.sin(phase)), 8)
                        }}));
                        nodes.update(updates);
						window.requestAnimationFrame(raf);
                    }};
                    raf();
                }}
                
                function onReady() {{
                    applyGlobalStyles();
                    applyHighlight();
                }}
                
                network.once('stabilizationIterationsDone', onReady);
            }}

            drawGraph();
        </script>
    </body>
    </html>
    """