# Backend/knowledge_graph.py

import os
import re
import json
import asyncio
from typing import List, Dict, Any

from langchain_groq import ChatGroq
from models import Node, Relationship, KnowledgeGraphResponse
from llm_wrapper import call_llm # <-- Required for the insight explanation feature

# --- 1. Robust JSON Parser ---
def extract_json_from_text(text: str) -> Dict[str, Any]:
    """
    Finds and parses the first valid JSON object within a string.
    """
    # Use a greedy regex to find a curly brace enclosed block
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in the LLM response.")
    json_str = match.group(0)
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse the extracted JSON string: {json_str}")

# --- 2. High-Quality Extraction Prompt ---
GRAPH_EXTRACTION_PROMPT = """
You are a highly intelligent AI assistant specialized in materials science, chemistry, and semiconductor manufacturing. 
Your primary function is to analyze technical documents and extract a detailed knowledge graph.
From the text provided below, identify all relevant entities and the relationships that connect them.

**Entity Types:**
- Company, Person, Technology, Process, Material, Device, Chemical, Concept, Field, Metric, Tool

**Relationship Types:**
Use clear, uppercase verb phrases that describe the connection (e.g., "USED_IN", "DEVELOPED_BY", "IMPACTS", "MEASURES").

**Output Format Instructions (Follow Strictly):**
1.  Your entire output **MUST** be a single, valid JSON object.
2.  The JSON object must have two top-level keys: "nodes" and "relationships".
3.  The value for "nodes" must be a JSON array of objects, each with an "id" (the entity name) and a "type".
4.  The value for "relationships" must be a JSON array of objects, each with a "source" (source node id), "target" (target node id), and "type".

Analyze the following text and generate the knowledge graph:
---
{text}
---
"""

# --- 3. Core Graph Generation Logic ---
async def generate_graph_from_text_custom(text: str) -> KnowledgeGraphResponse:
    """
    Calls the LLM with the provided text to extract a single graph.
    """
    if not os.getenv("GROQ_API_KEY"):
        raise ValueError("GROQ_API_KEY environment variable not set.")

    model_name = os.getenv("GROQ_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct")
    llm = ChatGroq(model_name=model_name, temperature=0.0)
    prompt = GRAPH_EXTRACTION_PROMPT.format(text=text)

    try:
        response = await llm.ainvoke(prompt)
        content = response.content
    except Exception as e:
        raise RuntimeError(f"LLM API call failed. Error: {e}")

    try:
        graph_data = extract_json_from_text(content)
    except ValueError as e:
        # Save the failed response for debugging
        with open("llm_failed_response.txt", "w", encoding="utf-8") as f:
            f.write(content)
        raise RuntimeError(f"LLM returned malformed JSON. See 'llm_failed_response.txt'. Error: {e}")

    nodes_raw = graph_data.get("nodes", [])
    rels_raw = graph_data.get("relationships", [])

    if not isinstance(nodes_raw, list) or not isinstance(rels_raw, list):
         raise RuntimeError("The 'nodes' and 'relationships' keys in the JSON response must be arrays.")

    nodes = [Node(**n) for n in nodes_raw if isinstance(n, dict) and "id" in n and "type" in n]
    rels = [Relationship(**r) for r in rels_raw if isinstance(r, dict) and "source" in r and "target" in r and "type" in r]

    return KnowledgeGraphResponse(nodes=nodes, relationships=rels)

# --- 4. Chunking and Merging for Large Documents ---
def _chunk_text(text: str, chunk_size: int = 6000, overlap: int = 300) -> List[str]:
    """Splits a long text into smaller, overlapping chunks."""
    if len(text) <= chunk_size:
        return [text]
    return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size - overlap)]

def _merge_graphs(graphs: List[KnowledgeGraphResponse]) -> KnowledgeGraphResponse:
    """Merges multiple graph responses into a single, deduplicated graph."""
    merged_nodes: Dict[str, Node] = {}
    edge_set = set()
    merged_rels: List[Relationship] = []

    for graph in graphs:
        for node in graph.nodes:
            if node.id not in merged_nodes:
                merged_nodes[node.id] = node
        for rel in graph.relationships:
            edge_tuple = (rel.source, rel.target, rel.type)
            if edge_tuple not in edge_set:
                edge_set.add(edge_tuple)
                merged_rels.append(rel)
                
    return KnowledgeGraphResponse(nodes=list(merged_nodes.values()), relationships=merged_rels)

async def process_text_in_chunks(text: str) -> KnowledgeGraphResponse:
    """
    The main function for processing text. It handles chunking, parallel LLM calls, and merging.
    """
    chunks = _chunk_text(text)
    tasks = [generate_graph_from_text_custom(chunk) for chunk in chunks]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    successful_graphs = [res for res in results if isinstance(res, KnowledgeGraphResponse)]
    if not successful_graphs:
        errors = [str(res) for res in results if isinstance(res, Exception)]
        print(f"--- All chunks failed to process. Errors: {errors} ---")
        raise RuntimeError("Failed to generate a knowledge graph from any part of the document.")
    
    return _merge_graphs(successful_graphs)


# --- 5. Advanced Insight & Pathfinding Logic ---

def _build_adjacency(graph: KnowledgeGraphResponse) -> Dict[str, List[str]]:
    """Helper to create an adjacency list for efficient pathfinding."""
    adj: Dict[str, List[str]] = {node.id: [] for node in graph.nodes}
    for r in graph.relationships:
        if r.source in adj: adj[r.source].append(r.target)
        if r.target in adj: adj[r.target].append(r.source) # Allow reverse traversal
    return adj

def path_discovery(graph: KnowledgeGraphResponse, max_hops: int = 4, top_k: int = 5) -> List[List[str]]:
    """Heuristically find interesting multi-hop paths from source-like to outcome-like nodes."""
    adj = _build_adjacency(graph)
    if not adj: return []
    
    node_lower = {n.id: n.id.lower() for n in graph.nodes}
    source_keywords = ("contamin", "particle", "metal", "ion", "precursor", "surface", "membrane", "material", "impurity")
    outcome_keywords = ("yield", "loss", "failure", "degrad", "resist", "performance", "defect", "wafer", "corrosion")

    sources = [nid for nid, low in node_lower.items() if any(k in low for k in source_keywords)]
    targets = [nid for nid, low in node_lower.items() if any(k in low for k in outcome_keywords)]

    if not sources or not targets: return []

    from collections import deque
    all_paths = []
    for s in sources:
        for t in targets:
            if s == t: continue
            q = deque([(s, [s])])
            # Limit search space to avoid excessive computation on dense graphs
            visited_in_path = {s}
            while q:
                curr, path = q.popleft()
                if len(path) > max_hops: continue
                if curr == t:
                    all_paths.append(path)
                    continue
                for nb in adj.get(curr, []):
                    if nb not in visited_in_path:
                        visited_in_path.add(nb)
                        q.append((nb, path + [nb]))

    if not all_paths: return []
    
    all_paths.sort(key=len) # Prioritize shorter, more direct paths
    return all_paths[:top_k]

def extract_exceptional_insight(graph: KnowledgeGraphResponse, context_text: str) -> dict:
    """
    Finds candidate paths and uses an LLM to generate a concise,
    natural language explanation for why the top path is interesting.
    """
    candidate_paths = path_discovery(graph)
    if not candidate_paths:
        return {"found": False, "explanation": "No compelling multi-hop paths were discovered in the document.", "paths": []}

    path_strings = [" → ".join(p) for p in candidate_paths]
    
    top_path_str = path_strings[0]
    # Default explanation in case the LLM call fails
    explanation = f"A key relationship was discovered: {top_path_str}. This suggests a potential causal link or area for further investigation."

    # Best-effort explanation from LLM for a more "agentic" feel
    try:
        prompt = (
            "You are a scientific research analyst. The following path was automatically discovered in a knowledge graph. "
            "In a single, concise sentence, explain why this relationship might be scientifically interesting or important.\n\n"
            f"PATH: {top_path_str}\n\n"
            f"DOCUMENT CONTEXT (for reference):\n{context_text[:2500]}\n\n"
            "CONCISE EXPLANATION:"
        )
        llm_explanation = call_llm(prompt, max_tokens=256, temperature=0.2)
        if llm_explanation and "error" not in llm_explanation.lower():
            explanation = llm_explanation
    except Exception as e:
        print(f"Insight explanation LLM call failed: {e}") # Log error but don't crash

    return {
        "found": True,
        "explanation": explanation,
        "paths": path_strings
    }