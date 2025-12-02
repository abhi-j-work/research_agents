// src/vis-network-react.d.ts

declare module 'vis-network-react' {
  import { Component } from 'react';
  import { Network, Options, Data } from 'vis-network';

  export interface GraphProps {
    graph: Data;
    options?: Options;
    events?: Record<string, (params?: any) => void>;
    getNetwork?: (network: Network) => void;
    getNodes?: (nodes: any) => void; // Replace 'any' with more specific types if needed
    getEdges?: (edges: any) => void; // Replace 'any' with more specific types if needed
    style?: React.CSSProperties;
  }

  export default class Graph extends Component<GraphProps> {}
}