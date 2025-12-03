import asyncio
import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_community.tools import DuckDuckGoSearchRun 
# append to chat_agent.py (paste at end)
import os
from typing import Optional, Callable, Dict, Any
from langchain_core.runnables import RunnablePassthrough
# reuse the simple generator
from utils import text_to_cypher_simple


async def answer_entegris_question(query: str) -> dict:
    """
    Answers a user's question about Entegris using a RAG pipeline.
    1. Searches the web for relevant context using DuckDuckGo.
    2. Injects the context into a prompt.
    3. Calls an LLM to generate a final answer.
    """
    if not os.getenv("GROQ_API_KEY"):
        raise ValueError("GROQ_API_KEY environment variable not set.")

    # --- 1. Retrieval Step ---
    print(f"Searching the web for: '{query}'") # Helpful for debugging
    search_tool = DuckDuckGoSearchRun() # <-- 2. INSTANTIATE THE TOOL
    
    # Enhance the query for better search results
    search_query = f"Entegris company products, services, or news related to: {query}"
    
    try:
        # The .run() method performs the search and returns a formatted string of results
        retrieved_context = search_tool.run(search_query) # <-- 3. USE THE TOOL
    except Exception as e:
        print(f"DuckDuckGo Search failed: {e}")
        retrieved_context = f"Could not perform web search. Error: {e}"

    if not retrieved_context.strip():
        retrieved_context = "No specific information found for this query."
    
    print("--- Retrieved Context ---")
    print(retrieved_context)
    print("-------------------------")


    # --- 2. Augmentation & Generation Step (Prompt + LLM) ---
    prompt_template = """
    You are a professional, expert assistant for the company Entegris. Your task is to answer the user's question based *only* on the provided context from a web search.

    Follow these rules strictly:
    - Synthesize the information from the context into a clear, concise answer.
    - Do not make up information. If the context does not contain the answer, state that you couldn't find specific details in the provided information.
    - Do not mention that you are basing your answer on 'the context' or 'the provided text'. Just answer the question directly.

    CONTEXT:
    {context}

    QUESTION:
    {question}

    ANSWER:
    """
    prompt = ChatPromptTemplate.from_template(prompt_template)
    model = ChatGroq(model=os.getenv("GROQ_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct"), temperature=0)
    output_parser = StrOutputParser()

    # --- 3. Create and run the RAG chain ---
    # This chain is now simpler. It takes the query, passes it to the `question` field,
    # and uses a lambda function to provide the `retrieved_context` we already fetched.
    rag_chain = (
        {
            "context": lambda x: retrieved_context, # Provide the context we found
            "question": RunnablePassthrough()       # Pass the original query through
        }
        | prompt
        | model
        | output_parser
    )

    answer = await rag_chain.ainvoke(query)

    # Return the final answer and the context for potential display or logging
    return {"answer": answer, "retrieved_context": retrieved_context}



#new additions
from utils import text_to_cypher_simple

async def text_to_cypher_and_run(
    natural_text: str,
    run_query_fn: Optional[Callable[[str], Any]] = None,
    use_llm: bool = False,
) -> Dict[str, Any]:
    """
    Convert natural_text -> Cypher (simple rules or optional LLM), and optionally run it.
    Returns: { 'cypher': <str>, 'results': <list> or None, 'note': <str> }
    """
    print(f"\n--- [DEBUG] Starting text_to_cypher_and_run ---")
    print(f"[DEBUG] Input Text: '{natural_text}'")
    print(f"[DEBUG] Use LLM: {use_llm}")

    cypher = None
    note = ""

    # 1) Optionally use LLM to generate Cypher
    if use_llm and os.getenv("GROQ_API_KEY"):
        print("[DEBUG] LLM Flag is ON and API Key found. Initializing ChatGroq...")
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_groq import ChatGroq
            
            prompt_template = """
            You are a Cypher query generator. Given a short natural language request, output ONLY a single Cypher query (no explanation).
            Be conservative: do not output CREATE/DELETE/SET. Only MATCH/RETURN/WHERE/LIMIT/ORDER BY are allowed.
            Request: {request}
            Cypher:
            """

            prompt = ChatPromptTemplate.from_template(prompt_template)
            
            # --- UPDATED MODEL NAME ---
            model_name = os.getenv("GROQ_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct")
            print(f"[DEBUG] Using Groq Model: {model_name}")
            
            model = ChatGroq(model=model_name, temperature=0)
            
            rag_chain = (
                {"request": RunnablePassthrough()}
                | prompt
                | model
            )
            
            print("[DEBUG] Invoking LLM...")
            resp = await rag_chain.ainvoke(natural_text)
            
            raw_cypher = resp.content if hasattr(resp, "content") else str(resp)
            print(f"[DEBUG] Raw LLM Output: {raw_cypher}")
            
            # Cleanup markdown code blocks if present
            cypher = raw_cypher.strip().strip('`').replace('cypher', '').strip()
            print(f"[DEBUG] Cleaned Cypher: {cypher}")
            
            note = "generated_via_llm"
        except Exception as e:
            print(f"[ERROR] LLM Generation Failed: {e}")
            note = f"llm_generation_failed: {e}"
            cypher = text_to_cypher_simple(natural_text)

    # 2) Fallback: rule-based generator
    if not cypher:
        print("[DEBUG] No Cypher generated yet (or LLM failed). Using Rule-Based fallback.")
        cypher = text_to_cypher_simple(natural_text)
        if not note:
            note = "generated_via_rule_based"
        print(f"[DEBUG] Rule-Based Cypher: {cypher}")

    results = None

    # 3) If the caller provided a function to execute the cypher, use it
    if run_query_fn:
        print("[DEBUG] Executing via provided 'run_query_fn'...")
        try:
            results = run_query_fn(cypher)
            count = len(results) if isinstance(results, list) else "N/A"
            print(f"[DEBUG] Execution successful. Records found: {count}")
        except Exception as e:
            print(f"[ERROR] run_query_fn failed: {e}")
            results = {"error": str(e)}
            note += " | run_query_fn_failed"

        return {"cypher": cypher, "results": results, "note": note}

    # 4) Else try to auto-run against Neo4j if env vars exist
    neo_uri = os.getenv("NEO4J_URI")
    neo_user = os.getenv("NEO4J_USER")
    neo_pass = os.getenv("NEO4J_PASSWORD")
    
    if neo_uri and neo_user and neo_pass:
        print(f"[DEBUG] Attempting direct Neo4j connection to: {neo_uri}")
        try:
            from neo4j import GraphDatabase
            driver = GraphDatabase.driver(neo_uri, auth=(neo_user, neo_pass))
            
            # Optional: Verify connectivity before running query
            try:
                driver.verify_connectivity()
                print("[DEBUG] Connection verified successfully.")
            except Exception as conn_err:
                 print(f"[ERROR] Connection verification failed: {conn_err}")
                 raise conn_err

            with driver.session() as session:
                def _run(tx):
                    print(f"[DEBUG] Executing Cypher inside transaction: {cypher}")
                    res = tx.run(cypher)
                    
                    # --- CRITICAL FIX & LOGGING START ---
                    # Convert to list to consume the result
                    records = list(res)
                    
                    print(f"[DEBUG] Query executed. Fetched {len(records)} records.")
                    
                    # Deep inspection log to verify the fix works
                    if len(records) > 0:
                        first_record = records[0]
                        print(f"[DEBUG] Sample Record Type: {type(first_record)}")
                        print(f"[DEBUG] Sample Record Keys: {first_record.keys()}")
                        
                        # Check if it holds Node objects (what we want) or dicts
                        sample_value = first_record[0] if len(first_record.values()) > 0 else None
                        print(f"[DEBUG] Sample Value Type: {type(sample_value)}")
                        if hasattr(sample_value, 'labels'):
                            print(f"[DEBUG] ✅ Success: Value is a Neo4j Node with labels: {sample_value.labels}")
                        else:
                            print(f"[DEBUG] ⚠️ Warning: Value does not look like a Node object (might be a dict/string).")

                    return records
                    # --- CRITICAL FIX & LOGGING END ---
                
                results = session.read_transaction(_run)
            
            driver.close()
            print(f"[DEBUG] Direct Neo4j execution successful. Total Records: {len(results)}")
            note += " | executed_on_neo4j"
        except Exception as e:
            print(f"[ERROR] Direct Neo4j execution failed: {e}")
            # detailed error logging
            import traceback
            traceback.print_exc()
            results = {"error": f"neo4j_exec_failed: {e}"}
            note += " | neo4j_exec_failed"
    else:
        print("[DEBUG] No Neo4j credentials found or run_query_fn provided. Returning Cypher only.")

    print(f"--- [DEBUG] End text_to_cypher_and_run ---\n")
    return {"cypher": cypher, "results": results, "note": note}


async def search_web_only(query: str) -> str:
    """
    Performs the search and returns raw text context.
    Non-blocking.
    """
    print(f"Searching the web for: '{query}'")
    search_tool = DuckDuckGoSearchRun()
    search_query = f"Entegris products and news: {query}"

    try:
        loop = asyncio.get_running_loop()
        # Run synchronous tool in thread to avoid blocking
        retrieved_context = await loop.run_in_executor(None, search_tool.run, search_query)
    except Exception as e:
        print(f"DuckDuckGo Search failed: {e}")
        retrieved_context = ""

    if not retrieved_context.strip():
        return ""
    
    return retrieved_context