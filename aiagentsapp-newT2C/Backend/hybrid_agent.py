# hybrid_agent.py
import os
import asyncio
import json
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser

# --- IMPORTS ---
from vector_store import vector_db
from database import run_query_if_neo4j
from chat_agent import text_to_cypher_and_run, search_web_only # <--- Import Web Search
from models import Citation

async def get_combined_response(query: str):
    """
    Executes Triple RAG:
    1. Vector DB (Manuals/Docs)
    2. Knowledge Graph (Relationships)
    3. Web Search (Live Info)
    """
    
    citations_list = []

    # --- Task A: Vector Search ---
    async def task_vector():
        raw_docs = vector_db.search(query, k=3)
        context_str = ""
        if not raw_docs: return "No relevant internal documents found."

        for i, doc in enumerate(raw_docs):
            ref_id = f"Doc-{i+1}"
            snippet = doc['text']
            fname = doc.get('metadata', {}).get('filename', 'Unknown')
            
            context_str += f"[{ref_id}] (File: {fname}): {snippet}\n\n"
            
            citations_list.append(Citation(
                id=ref_id, type="text", content=snippet, source_file=fname
            ))
        return context_str

    # --- Task B: Graph Search ---
    async def task_graph():
        try:
            response = await text_to_cypher_and_run(query, run_query_fn=run_query_if_neo4j, use_llm=True)
            data = response.get("results", [])
            cypher = response.get("cypher", "")
            
            if not data: return "No graph data found."

            ref_id = "Graph-1"
            json_str = json.dumps(data, indent=2)
            
            citations_list.append(Citation(
                id=ref_id, type="graph", content=f"Cypher: {cypher}", metadata={"data": data}
            ))
            return f"[{ref_id}] Cypher: {cypher}\nResults: {json_str}"
        except Exception as e:
            return f"Graph Error: {e}"

    # --- Task C: Web Search (NEW) ---
    async def task_web():
        web_text = await search_web_only(query)
        if not web_text: return "No web results found."
        
        ref_id = "Web-1"
        citations_list.append(Citation(
            id=ref_id, type="web", content=web_text, source_file="DuckDuckGo"
        ))
        return f"[{ref_id}] Live Search Results: {web_text}"

    # --- Execution: Run All 3 in Parallel ---
    print(f"--- [Triple-RAG] Analyzing: {query} ---")
    vector_ctx, graph_ctx, web_ctx = await asyncio.gather(
        task_vector(), 
        task_graph(), 
        task_web()
    )

    # --- Synthesis: The Prompt ---
    template = """
    You are an advanced Entegris Research Agent.
    Answer the user's question by synthesizing the provided contexts.

    SOURCES:
    1. **Internal Docs** (Vector DB): Technical manuals and PDF content.
    2. **Knowledge Graph** (Neo4j): Structured relationships and product hierarchies.
    3. **Live Web** (DuckDuckGo): Public news and recent updates.

    INSTRUCTIONS:
    - You MUST cite your sources using the tags provided (e.g., [Doc-1], [Graph-1], [Web-1]).
    - Prioritize Internal Docs and Graph for technical specs.
    - Use Web for news or broader context.
    - If sources conflict, prioritize the Graph.

    --- INTERNAL DOCS ---
    {vector_ctx}

    --- KNOWLEDGE GRAPH ---
    {graph_ctx}

    --- WEB SEARCH ---
    {web_ctx}

    --- USER QUESTION ---
    {question}

    ANSWER:
    """
    
    prompt = ChatPromptTemplate.from_template(template)
    model = ChatGroq(model=os.getenv("GROQ_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct"), temperature=0)
    chain = prompt | model | StrOutputParser()
    
    final_answer = await chain.ainvoke({
        "vector_ctx": vector_ctx,
        "graph_ctx": graph_ctx,
        "web_ctx": web_ctx,
        "question": query
    })

    return {
        "answer": final_answer,
        "citations": citations_list
    }