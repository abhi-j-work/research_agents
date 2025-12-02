from typing import List, Dict, Any, Optional
from graph_rag_index import SimpleFAISSIndex, chunk_text
import json

class GraphRAG:
    def __init__(self):
        # instantiate two separate indexes: text chunks and graph nodes
        self.text_index = SimpleFAISSIndex()
        self.node_index = SimpleFAISSIndex()

    def index_document_and_graph(self, doc_id: str, full_text: str, merged_doc):
        """
        merged_doc expected to be SimpleGraphDocument-like: nodes with .id,.type and relationships.
        """
        # Index text chunks
        chunks = chunk_text(full_text)
        metas = []
        for i, c in enumerate(chunks):
            metas.append({"type": "doc_chunk", "doc_id": doc_id, "chunk_id": i, "text": c})
        self.text_index.add(chunks, metas)

        # Build node descriptions and add
        node_texts = []
        node_metas = []
        # compute neighbors map for basic adjacency context
        adj = {}
        for r in getattr(merged_doc, "relationships", []):
            s = getattr(r.source, "id", getattr(r.source, "source", None))
            t = getattr(r.target, "id", getattr(r.target, "target", None))
            if s:
                adj.setdefault(s, set()).add(t)
            if t:
                adj.setdefault(t, set()).add(s)
        for n in getattr(merged_doc, "nodes", []):
            nid = str(n.id)
            ntype = str(getattr(n, "type", ""))
            neighbors = ", ".join(sorted([str(x) for x in adj.get(nid, []) if x]))
            desc = f"{nid} ({ntype})" + (f". Neighbors: {neighbors}" if neighbors else "")
            node_texts.append(desc)
            node_metas.append({"type": "graph_node", "doc_id": doc_id, "node_id": nid, "text": desc})
        self.node_index.add(node_texts, node_metas)

    def retrieve(self, query: str, path_nodes: Optional[List[str]] = None, topk_text: int = 4, topk_nodes: int = 6) -> Dict[str, Any]:
        text_hits = self.text_index.search(query, k=topk_text)
        node_hits = self.node_index.search(query, k=topk_nodes)

        path_context = []
        if path_nodes:
            for pn in path_nodes:
                # best-effort retrieval by node id text
                hits = self.node_index.search(pn, k=1)
                if hits:
                    path_context.append(hits[0])
        return {"text_hits": text_hits, "node_hits": node_hits, "path_context": path_context}
