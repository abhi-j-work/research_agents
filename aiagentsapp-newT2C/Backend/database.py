import os
from neo4j import GraphDatabase

_neo4j_driver = None

def get_neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        uri = os.getenv("NEO4J_URI")
        user = os.getenv("NEO4J_USER")
        password = os.getenv("NEO4J_PASSWORD")
        if uri and user and password:
            try:
                _neo4j_driver = GraphDatabase.driver(uri, auth=(user, password))
            except Exception as e:
                print(f"Neo4j Connection Error: {e}")
    return _neo4j_driver

def run_query_if_neo4j(cypher: str, parameters: dict = None):
    """Executes a Cypher query against Neo4j."""
    driver = get_neo4j_driver()
    if not driver:
        return {"error": "Neo4j driver not available."}

    try:
        with driver.session() as session:
            # Modern Neo4j driver uses execute_read
            result = session.execute_read(
                lambda tx: [r.data() for r in tx.run(cypher, parameters or {})]
            )
        return result
    except Exception as e:
        return {"error": str(e)}