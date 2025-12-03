# main.py

import os
import base64
import json
import asyncio,httpx
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import logging
from fastapi import HTTPException, Query
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.runnables import RunnablePassthrough


logger = logging.getLogger("API")
logger.setLevel(logging.INFO)



# --- 1. CONFIGURATION & MODELS ---
load_dotenv()

# Import Pydantic Models
from models import (
    ChatRequestBody, 
    ChatResponse, 
    TextRequestBody, 
    GraphGenerationResponse,
    ExperimentRequestBody, 
    ExperimentResponse,
    Citation # Ensure Citation is defined in models.py
)

# --- 2. CORE LOGIC IMPORTS ---
# Database & Stores
from database import get_neo4j_driver, run_query_if_neo4j
from vector_store import vector_db

# Agents & Logic
from hybrid_agent import get_combined_response  # <--- The Unified RAG Agent
from chat_agent import text_to_cypher_and_run   # For the standalone cypher endpoint
from knowledge_graph import (
    process_text_in_chunks, 
    extract_exceptional_insight, 
    extract_json_from_text
)
from utils import get_text_from_upload
from graph_template import create_graph_html
from redis_cache import cache_set, cache_get
from llm_wrapper import call_llm

# Legacy/Experiment RAG (Optional: Keep if you use specific experiment logic)
from graph_rag import GraphRAG 

# --- 3. APP INITIALIZATION ---
app = FastAPI(
    title="Entegris AI Research Agent API",
    description="Unified API for Knowledge Graphs, Hybrid RAG (Vector+Graph+Web), and Experiments.",
    version="6.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change to specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Legacy RAG for Experiments (if needed)
rag_system = GraphRAG() 

@app.on_event("startup")
async def startup_event():
    if not os.getenv("GROQ_API_KEY"):
        print("WARNING: GROQ_API_KEY not set. LLM features will fail.")

# --- 4. HELPER FUNCTIONS ---
class ToolQuery(BaseModel):
    query: str
    tool: str | None = None
    
def process_neo4j_records(records):
    """Converts Neo4j driver records into a JSON-friendly graph format for Frontend."""
    nodes = {}
    edges = []
    print(records)
    for record in records:
        for key, value in record.items():
            # Handle Nodes
            if hasattr(value, 'labels') and hasattr(value, 'id'):
                node_id = str(value.id) # Internal Neo4j ID
                props = dict(value)
                # Use a custom ID property if available, else internal ID
                display_id = props.get('id', node_id)
                
                if display_id not in nodes:
                    nodes[display_id] = {
                        "id": display_id,
                        "labels": list(value.labels),
                        **props
                    }
            # Handle Relationships
            elif hasattr(value, 'start_node') and hasattr(value, 'end_node'):
                edges.append({
                    "source": str(dict(value.start_node).get('id', value.start_node.id)),
                    "target": str(dict(value.end_node).get('id', value.end_node.id)),
                    "type": value.type,
                    **dict(value)
                })
                
    return {"nodes": list(nodes.values()), "edges": edges}

async def _generate_graph_and_insight(text_content: str, document_id: str) -> dict:
    """Generates graph structure from text using LLM."""
    graph_data = await process_text_in_chunks(text_content)
    insight = extract_exceptional_insight(graph_data, text_content)
    
    # Cache for experiment design
    cache_set(f"doc_text:{document_id}", text_content, expire_seconds=86400)
    
    # Index into legacy RAG (optional, for experiment endpoint)
    try:
        rag_system.index_document_and_graph(document_id, text_content, graph_data)
    except Exception as e:
        print(f"Legacy RAG Indexing Warning: {e}")

    return {"graph_data": graph_data, "insight": insight}

def save_graph_to_neo4j(graph_data):
    """Writes the Pydantic Graph object to Neo4j."""
    driver = get_neo4j_driver()
    if not driver: 
        print("❌ Neo4j Driver not available. Skipping save.")
        return

    print(f"💾 Saving {len(graph_data.nodes)} nodes to Neo4j...")
    try:
        with driver.session() as session:
            # 1. Merge Nodes
            for node in graph_data.nodes:
                # Sanitize label
                clean_type = node.type.replace(" ", "_").replace("-", "_")
                # Query: Merge based on ID, set Label and Properties
                cypher = f"""
                MERGE (n:Entity {{id: $id}})
                SET n :`{clean_type}`, n.type = $type
                """
                session.run(cypher, {"id": node.id, "type": node.type})

            # 2. Merge Relationships
            for rel in graph_data.relationships:
                clean_rel_type = rel.type.upper().replace(" ", "_").replace("-", "_")
                cypher = f"""
                MATCH (source:Entity {{id: $source_id}})
                MATCH (target:Entity {{id: $target_id}})
                MERGE (source)-[r:`{clean_rel_type}`]->(target)
                """
                session.run(cypher, {"source_id": rel.source, "target_id": rel.target})
        print("✅ Graph saved to Neo4j.")
    except Exception as e:
        print(f"❌ Error saving to Neo4j: {e}")


# --- 5. API ENDPOINTS ---

@app.get("/", tags=["Status"])
async def health_check():
    return {"status": "ok", "message": "Entegris AI Agent API is running."}

# --- A. HYBRID RAG & CHAT (The Main Feature) ---

@app.post("/api/hybrid/upload", tags=["Hybrid Setup"])
async def upload_and_ingest_hybrid(file: UploadFile = File(...)):
    """
    Ingests a document into:
    1. Vector DB (FAISS) for text search.
    2. Neo4j Graph DB for relationship search.
    """
    try:
        filename = file.filename or "uploaded_doc"
        print(f"📥 Processing '{filename}'...")
        
        text_content = await get_text_from_upload(file)

        # 1. Add to Vector Store
        vector_db.add_document(text_content, metadata={"filename": filename})

        # 2. Generate & Save Graph
        graph_result = await _generate_graph_and_insight(text_content, filename)
        save_graph_to_neo4j(graph_result["graph_data"])

        return {
            "message": "Ingestion Complete", 
            "details": f"Indexed {len(text_content)} chars. Saved graph to Neo4j."
        }
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat", response_model=ChatResponse, tags=["Chat Agent"])
async def chat_endpoint(body: ChatRequestBody):
    """
    Unified Chat Endpoint.
    - Performs Vector Search (Internal Docs)
    - Performs Graph Search (Neo4j)
    - Performs Web Search (DuckDuckGo)
    - Synthesizes a single answer with citations.
    """
    try:
        # We ignore body.useHybrid flag now, or use it to toggle web search if desired.
        # Defaulting to the full combined response.
        result = await get_combined_response(body.query)

        return ChatResponse(
            answer=result["answer"],
            citations=result["citations"]
        )
    except Exception as e:
        print(f"Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- B. KNOWLEDGE GRAPH VISUALIZATION (Legacy/UI Features) ---

@app.post("/api/graph/from-file", response_model=GraphGenerationResponse, tags=["Knowledge Graph"])
async def create_kg_from_file(
    file: UploadFile = File(...),
    pulse_on: bool = Query(True, alias="pulseOn"),
    pulse_amp: float = Query(6.0, alias="pulseAmp"),
    pulse_speed: float = Query(0.12, alias="pulseSpeed")
):
    """Generates a standalone HTML visualization from a file."""
    try:
        text_content = await get_text_from_upload(file)
        document_id = file.filename or "uploaded_document"
        
        result = await _generate_graph_and_insight(text_content, document_id)
        
        html_content = create_graph_html(
            graph_data=result["graph_data"], 
            insight=result["insight"],
            pulse_enabled=pulse_on,
            pulse_amplitude=pulse_amp,
            pulse_speed=pulse_speed
        )
        
        b64_html = base64.b64encode(html_content.encode('utf-8')).decode('utf-8')
        return GraphGenerationResponse(html_content=html_content, download_url=f"data:text/html;base64,{b64_html}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/graph/from-conversation", response_model=GraphGenerationResponse, tags=["Knowledge Graph"])
async def create_kg_from_conversation(body: TextRequestBody):
    """Generates a standalone HTML visualization from raw text."""
    try:
        result = await _generate_graph_and_insight(body.text, "conversation_context")
        html_content = create_graph_html(
            graph_data=result["graph_data"],
            insight=result["insight"],
            pulse_enabled=True
        )
        b64_html = base64.b64encode(html_content.encode('utf-8')).decode('utf-8')
        return GraphGenerationResponse(html_content=html_content, download_url=f"data:text/html;base64,{b64_html}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- C. DEBUG & UTILS ---

@app.post("/api/graph/text-to-cypher", tags=["Knowledge Graph"])
async def text_to_cypher_endpoint(
    body: TextRequestBody,
    useLLM: bool = Query(False, alias="useLLM")
):
    """Debug endpoint to see what Cypher query is generated for a text."""
    
    logger.info("ENTER text_to_cypher_endpoint")
    logger.info(f"Request Body: {body.text}")
    logger.info(f"useLLM flag: {useLLM}")

    try:
        # Generate and run Cypher
        out = await text_to_cypher_and_run(
            body.text,
            run_query_fn=run_query_if_neo4j,
            use_llm=useLLM
        )

        logger.info("Cypher generated successfully")
        logger.debug(f"Generated Cypher Query: {out.get('cypher')}")
        logger.debug(f"Raw Neo4j Output: {out}")

        # Convert Neo4j records for frontend
        graph_data = process_neo4j_records(out.get("results", []) or [])

        logger.info("Graph processing complete")
        
        response = {
            "cypher": out.get("cypher"),
            "graph": graph_data,
            "results": out.get("results")
        }

        logger.info("EXIT text_to_cypher_endpoint (Success)")
        return response

    except Exception as e:
        # RCA-friendly detailed log
        logger.error("Error in text_to_cypher_endpoint", exc_info=True)
        logger.error(f"RCA: Failure occurred while processing request text='{body.text}' "
                     f"with useLLM={useLLM}. Possible root causes include: "
                     f"(1) Invalid Cypher generated, "
                     f"(2) Neo4j query execution failure, "
                     f"(3) Data format mismatch in result parsing, "
                     f"(4) Unexpected internal bug or network timeout.")

        logger.info("EXIT text_to_cypher_endpoint (Failure)")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/graph/node-associations", tags=["Knowledge Graph"])
async def get_node_associations_endpoint(nodeId: str = Query(..., alias="nodeId")):
    """Fetches neighbors of a specific node from Neo4j."""
    try:
        cypher_query = """
        MATCH (n) WHERE n.id = $node_id
        OPTIONAL MATCH (n)-[r]-(m)
        RETURN n, collect(DISTINCT r) as relationships, collect(DISTINCT m) as associatedNodes
        """
        raw_results = run_query_if_neo4j(cypher_query, parameters={"node_id": nodeId})
        
        if isinstance(raw_results, dict) and "error" in raw_results:
             raise HTTPException(status_code=500, detail=raw_results["error"])

        # Flatten the complex return structure for the frontend
        # Note: The 'process_neo4j_records' helper expects a flat list of nodes/rels.
        # Since this query returns 'n', 'relationships' (list), 'associatedNodes' (list),
        # we need to unpack it slightly or just return raw if frontend handles it.
        # For simplicity, we return the raw results here as the frontend likely parses this specific structure.
        return {
            "cypher": cypher_query,
            "results": raw_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- D. EXPERIMENT DESIGN (Agent Actions) ---

@app.post("/api/graph/design-experiment", response_model=ExperimentResponse, tags=["Agent Actions"])
async def design_experiment_for_path(body: ExperimentRequestBody):
    """
    Uses the Legacy GraphRAG + LLM to design an experiment based on a graph path.
    """
    try:
        # Retrieve context from cache (original text)
        doc_text = cache_get(f"doc_text:{body.document_id}")
        if not doc_text:
            # Fallback: try to get from vector store if possible, or fail
            doc_text = "Original document text not found in cache."

        # Retrieve context from RAG
        rag_context_hits = rag_system.retrieve(query=body.path_string)
        rag_context = json.dumps(rag_context_hits, indent=2)

        # Import Prompt (assuming it's available)
        from prompts import DESIGN_EXPERIMENT_PROMPT 
        
        prompt = DESIGN_EXPERIMENT_PROMPT.format(
            path=body.path_string,
            context=f"SOURCE DOCUMENT:\n{doc_text}\n\nRAG CONTEXT:\n{rag_context}"
        )
        
        llm_response_str = call_llm(prompt, max_tokens=3072, temperature=0.1)
        parsed_json = json.loads(extract_json_from_text(llm_response_str))

        return ExperimentResponse(
            path_string=body.path_string,
            prompt=prompt,
            llm_response=llm_response_str,
            parsed_json=parsed_json
        )
    except Exception as e:
        print(f"Experiment Design Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tools/query", tags=["Unified Tools"])
async def tools_query_endpoint(payload: ToolQuery):
    """
    Handles specific tool requests: Web Search, Arxiv, or Neo4j Agent.
    """
    query = payload.query
    tool = payload.tool
    q_lower = query.lower()
    
    logger.info(f"Received Tool Query: '{query}' with tool: '{tool}'")
    
    try:
        # Route based on Tool Selection
        if tool == "arxiv" or (tool is None and "arxiv" in q_lower):
            result = await run_arxiv_search(query)
            
        elif tool == "neo4j_agent" or (tool is None and "graph" in q_lower):
            # Use the existing robust Cypher generator we fixed
            logger.info("[Tool] Routing to Neo4j Agent...")
            out = await text_to_cypher_and_run(query, run_query_fn=run_query_if_neo4j, use_llm=True)
            
            # Format answer nicely
            records = out.get("results", [])
            cypher = out.get("cypher", "")
            
            if isinstance(records, list) and len(records) > 0:
                # Basic summarization of results
                answer = f"Executed Cypher: {cypher}\n\nFound {len(records)} records. Top result: {str(records[0])[:200]}..."
            else:
                answer = f"Executed Cypher: {cypher}\n\nNo records found or query returned empty."
                
            result = {"source": "neo4j_aura", "answer": answer, "context": cypher}
            
        else:
            # Default to Web Search
            result = await run_duckduckgo_pipeline(query)
            
        return result
        
    except Exception as e:
        logger.exception(f"Error handling tool query '{query}'")
        raise HTTPException(status_code=500, detail=str(e))
    
NEO4J_CREDENTIALS_FILE = os.environ.get("NEO4J_CREDENTIALS_FILE")
if NEO4J_CREDENTIALS_FILE:
    logger.info(f"Loading Neo4j credentials from: {NEO4J_CREDENTIALS_FILE}")
    if os.path.exists(NEO4J_CREDENTIALS_FILE):
        load_dotenv(NEO4J_CREDENTIALS_FILE)
        # Print credentials (for debugging only, remove in production!)
        logger.info(f"CLIENT_ID: {os.getenv('CLIENT_ID')}")
        logger.info(f"CLIENT_SECRET: {os.getenv('CLIENT_SECRET')}")
    else:
        logger.warning("NEO4J_CREDENTIALS_FILE path does not exist!")
 
AURA_AGENT_API_URL = os.environ.get("AURA_AGENT_API_URL")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
AURA_AUTH_URL = "https://api.neo4j.io/oauth/token"
 
# -----------------------------
# LLM Helper
# -----------------------------
def get_llm_model():
    if not os.getenv("GROQ_API_KEY"):
        raise ValueError("Missing GROQ_API_KEY environment variable.")
    return ChatGroq(
        model=os.getenv("GROQ_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct"),
        temperature=0
    )
 
# -----------------------------
# DuckDuckGo + Groq
# -----------------------------
async def run_duckduckgo_pipeline(query: str):
    logger.info(f"[DuckDuckGo] Searching: {query}")
    search_tool = DuckDuckGoSearchRun()
    search_query = f"Entegris company products, services, or news related to: {query}"
    try:
        retrieved_context = search_tool.run(search_query)
    except Exception as e:
        logger.error(f"DuckDuckGo search failed: {e}")
        retrieved_context = f"Search failed: {e}"
    if not retrieved_context.strip():
        retrieved_context = "No specific results found."
 
    prompt_template = """
    You are an expert assistant for Entegris. Using only the provided context,
    give a clear, concise answer. If not found, say so.
 
    CONTEXT:
    {context}
 
    QUESTION:
    {question}
 
    ANSWER:
    """
    prompt = ChatPromptTemplate.from_template(prompt_template)
    model = get_llm_model()
    parser = StrOutputParser()
 
    rag_chain = (
        {"context": lambda _: retrieved_context, "question": RunnablePassthrough()}
        | prompt
        | model
        | parser
    )
    try:
        answer = await rag_chain.ainvoke(query)
    except Exception as e:
        logger.error(f"GROQ model failed: {e}")
        answer = "Error generating answer."
 
    return {"source": "duckduckgo", "answer": answer, "context": retrieved_context}
 
# -----------------------------
# arXiv Search
# -----------------------------
ARXIV_API_URL = "https://export.arxiv.org/api/query"
async def run_arxiv_search(query: str):
    logger.info(f"[arXiv] Searching: {query}")
    params = {"search_query": f"all:{query}", "start": 0, "max_results": 5}
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.get(ARXIV_API_URL, params=params)
            response.raise_for_status()
        except Exception as e:
            logger.error(f"arXiv API failed: {e}")
            raise HTTPException(status_code=500, detail=f"arXiv API error: {e}")
 
        data = response.text
 
    titles = []
    for line in data.splitlines():
        if "<title>" in line and "arXiv" not in line:
            titles.append(line.replace("<title>", "").replace("</title>", "").strip())
    if not titles:
        titles = ["No papers found."]
    return {"source": "arxiv", "query": query, "answer": titles}
 
# -----------------------------
# Neo4j Aura Agent
# -----------------------------
async def get_aura_token():
    CLIENT_ID = os.getenv("CLIENT_ID", "").strip()
    CLIENT_SECRET = os.getenv("CLIENT_SECRET", "").strip()
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail=f"CLIENT_ID or CLIENT_SECRET missing! CLIENT_ID={CLIENT_ID}, CLIENT_SECRET={'set' if CLIENT_SECRET else 'None'}"
        )
 
    logger.info("[Neo4j] Requesting Aura token")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                AURA_AUTH_URL,
                auth=(CLIENT_ID, CLIENT_SECRET),
                data={"grant_type": "client_credentials"},
            )
            response.raise_for_status()
        except Exception as e:
            logger.error(f"Failed to get Aura token: {e}")
            raise HTTPException(status_code=500, detail=f"Aura token error: {e}")
 
        token = response.json().get("access_token")
        if not token:
            logger.error(f"Aura token missing, full response: {response.json()}")
            raise HTTPException(status_code=500, detail="Aura token missing in response")
        return token
 
 
async def run_neo4j_aura_agent(question: str):
    token = await get_aura_token()
    logger.info(f"[Neo4j] Sending query: {question}")
    async with httpx.AsyncClient(timeout=60*5) as client:
        try:
            response = await client.post(
                AURA_AGENT_API_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                json={"input": question},
            )
            response.raise_for_status()
        except Exception as e:
            logger.error(f"Neo4j Aura API error: {e}")
            raise HTTPException(status_code=500, detail=f"Neo4j Aura error: {e}")
 
        data = response.json()
 
    answer_parts = [item.get("text") for item in data.get("content", []) if item and item.get("type")=="text"]
    answer = "\n".join(answer_parts) if answer_parts else "No response from Aura Agent."
    logger.info(f"[Neo4j] Answer generated: {answer[:100]}...")
    return {"source": "neo4j_aura", "answer": answer}