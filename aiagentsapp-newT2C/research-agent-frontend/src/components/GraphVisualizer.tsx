// src/components/GraphVisualizer.tsx
import React, { useMemo } from 'react';
import Graph from 'vis-network-react';
  import type { GraphData } from '../App';

interface GraphVisualizerProps {
  graphData: GraphData;
}

// Define a neon color palette for consistent styling
const PALETTE = {
  cyan: '#22d3ee',
  purple: '#a78bfa',
  magenta: '#f472b6',
  dark: '#0f172a',
  light: '#f8fafc',
  grey: '#94a3b8',
};

const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ graphData }) => {
  const data = useMemo(() => {
    const nodes = graphData.nodes.map((node: { id: any; type: any; }, index: number) => {
      // Designate the first node as the "parent" for special styling
      const isParent = index === 0;

      return {
        id: node.id,
        label: node.id,
        title: node.type,
        group: node.type,
        // Parent node has a larger size and stronger glow
        size: isParent ? 30 : 18, 
        color: {
          background: PALETTE.dark,
          border: isParent ? PALETTE.cyan : PALETTE.magenta,
          highlight: {
            background: '#1e293b',
            border: PALETTE.purple,
          },
        },
        font: {
          color: PALETTE.light,
        },
        // Shadow properties are used to create the "glow" effect
        shadow: {
          enabled: true,
          color: isParent ? PALETTE.cyan : PALETTE.magenta,
          size: isParent ? 25 : 15, // Stronger glow for parent
          x: 0,
          y: 0,
        },
      };
    });

    const edges = graphData.relationships.map((rel: { source: any; target: any; type: any; }) => ({
      from: rel.source,
      to: rel.target,
      label: rel.type,
      color: {
        color: PALETTE.purple, // Using purple for edges
        highlight: PALETTE.cyan,
      },
      width: 2,
      font: { align: 'top', color: PALETTE.grey },
      arrows: {
        to: { 
          enabled: true, 
          scaleFactor: 1.2, // Slightly larger arrows
          type: 'arrow' 
        },
      },
      // Note: Gradient strokes on edges are not supported by the underlying library.
      // A solid bright color is used instead to maintain the neon theme.
      smooth: { type: 'curvedCW', roundness: 0.2 },
    }));

    return { nodes, edges };
  }, [graphData]);

  const options = {
    layout: { hierarchical: false },
    nodes: {
      shape: 'dot',
      borderWidth: 2,
      // Note: A true pulsating animation via CSS is not possible. 
      // The parent node's distinct, strong glow creates a focal point.
    },
    edges: {
      smooth: true,
    },
    physics: {
      forceAtlas2Based: {
        gravitationalConstant: -35,
        centralGravity: 0.005,
        springLength: 200,
        springConstant: 0.05,
      },
      solver: 'forceAtlas2Based',
      stabilization: { iterations: 250 },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      hideEdgesOnDrag: false,
    },
    height: '100%',
    width: '100%',
  };

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Graph graph={data} options={options} />
    </div>
  );
};

export default GraphVisualizer;