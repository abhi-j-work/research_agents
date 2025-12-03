import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USER")
password = os.getenv("NEO4J_PASSWORD")

print(f"Testing connection to: {uri}")

try:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    driver.verify_connectivity()
    print("✅ Connection Verified!")
    
    with driver.session() as session:
        # Run a simple query to ensure read permissions
        result = session.run("MATCH (n) RETURN count(n) AS count")
        print(f"✅ Database contains {result.single()['count']} nodes.")
        
    driver.close()
except Exception as e:
    print(f"❌ Connection Failed: {e}")
    print("Tip: If using Neo4j Aura (Cloud), ensure URI starts with 'neo4j+s://'")