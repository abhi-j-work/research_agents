#!/usr/bin/env python3
"""
load_demo_graph.py

Load a readable demo graph into Neo4j (Aura) in an idempotent way.
"""

import os
import sys
from neo4j import GraphDatabase

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j+s://556b1426.databases.neo4j.io")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "kXsESYrk7mAg_atGJmB5UjbO7zML3XBevBwyCY_YxZc")
WIPE = os.getenv("WIPE", "false").lower() in ("1", "true", "yes")

if not (NEO4J_URI and NEO4J_USER and NEO4J_PASSWORD):
    print("ERROR: Please set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD (see README).")
    sys.exit(1)

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def run_queries(session, queries):
    """Run a list of queries one by one"""
    for q in queries:
        session.run(q)

with driver.session() as session:
    try:
        if WIPE:
            print("WIPING database...")
            session.run("MATCH (n) DETACH DELETE n")
            print("Done wipe.")

        # --- Constraints ---
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (v:Vendor) REQUIRE v.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Material) REQUIRE m.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (b:Batch) REQUIRE b.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (t:LIMSTest) REQUIRE t.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Plant) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (prod:Product) REQUIRE prod.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE"
        ]
        run_queries(session, constraints)
        print("Constraints ensured.")

        # --- Demo nodes (MERGE + SET) ---
        nodes_queries = [
            # Vendors
            "MERGE (v1:Vendor {id:'VEND-1'}) SET v1.name='UltraChem Supplies', v1.certificate_ref='UC-2025-0610-CERT', v1.issued_date='2025-06-10'",
            "MERGE (v2:Vendor {id:'VEND-2'}) SET v2.name='PureMaterials Ltd', v2.certificate_ref='PM-2025-0901-ADVISORY', v2.issued_date='2025-09-01'",

            # Materials
            """MERGE (mA1:Material {id:'MAT-SOL-01-A1'})
               SET mA1.name='SOL-01 A1', mA1.description='Solvent SOL-01, organic solvent blend for coating',
                   mA1.lot='A1', mA1.purity=99.93, mA1.metal_ppm=0.9, mA1.particle_count=40,
                   mA1.storage_condition='15-25C sealed', mA1.certificate_confidence='High', mA1.blended_on='2025-05-28'""",
            """MERGE (mB2:Material {id:'MAT-SOL-01-B2'})
               SET mB2.name='SOL-01 B2', mB2.description='Solvent SOL-01 promotional lot',
                   mB2.lot='B2', mB2.purity=99.70, mB2.metal_ppm=3.8, mB2.particle_count=120,
                   mB2.certificate_confidence='Medium'""",

            # Plant and Product
            "MERGE (p1:Plant {id:'PLANT-01'}) SET p1.name='Fab East'",
            "MERGE (prod:Product {id:'PROD-ALPHA'}) SET prod.name='Alpha Coating'",

            # Batches
            """MERGE (b1:Batch {id:'BATCH-001'})
               SET b1.name='Batch 001', b1.start_time='2025-06-07T08:15:00Z', b1.end_time='2025-06-07T12:30:00Z',
                   b1.operator='J. Singh', b1.process_version='PROCESS-COAT-1 v2.3'""",
            """MERGE (b2:Batch {id:'BATCH-002'})
               SET b2.name='Batch 002', b2.start_time='2025-09-03T09:00:00Z', b2.end_time='2025-09-03T13:45:00Z',
                   b2.operator='L. Chen', b2.process_version='PROCESS-COAT-1 v2.3'""",

            # LIMS Tests & Samples
            """MERGE (t1:LIMSTest {id:'LIMS-T-1001'})
               SET t1.name='LIMS-T-1001 metal_ppm', t1.metric='metal_ppm', t1.value=7.2, t1.units='ppm',
                   t1.instrument='ICP-MS-3', t1.detection_limit=0.01, t1.spec_limit=5.0, t1.result='OUT_OF_SPEC', t1.confidence='High'""",
            "MERGE (s1:LIMSSample {id:'LIMS-S-1001'}) SET s1.name='LIMS-S-1001', s1.collected_at='2025-06-07T10:00:00Z'",
            """MERGE (t2:LIMSTest {id:'LIMS-T-1003'})
               SET t2.name='LIMS-T-1003 particle_count', t2.metric='particle_count', t2.value=320, t2.units='particles/cm3',
                   t2.method='laser-particle-counter', t2.spec_limit=150, t2.result='OUT_OF_SPEC', t2.confidence='High'""",
            "MERGE (s3:LIMSSample {id:'LIMS-S-1003'}) SET s3.name='LIMS-S-1003', s3.collected_at='2025-06-07T12:15:00Z'",
            """MERGE (t3:LIMSTest {id:'LIMS-T-1002'})
               SET t3.name='LIMS-T-1002 metal_ppm', t3.metric='metal_ppm', t3.value=2.1, t3.units='ppm',
                   t3.instrument='ICP-MS-1', t3.result='WITHIN_SPEC', t3.confidence='Medium'""",
            "MERGE (s2:LIMSSample {id:'LIMS-S-1002'}) SET s2.name='LIMS-S-1002', s2.collected_at='2025-09-03T11:30:00Z'",

            # Customer / Complaint
            "MERGE (cust:Customer {id:'CUST-33'}) SET cust.name='WaferWorks Inc.'",
            """MERGE (compl:Complaint {id:'COMP-2025-06-20-77'})
               SET compl.name='Yield drop complaint', compl.date='2025-06-20', compl.yield_drop=4.0, compl.failure_mode='particle_defects'""",

            # Supplier note / Investigation
            "MERGE (reply:SupplierNote {id:'UC-2025-0615-REPLY'}) SET reply.name='Vendor Response 2025-06-15', reply.date='2025-06-15', reply.note='Vendor re-tested, metal_ppm=0.95'",
            "MERGE (invest:Investigation {id:'INV-2025-06-09'}) SET invest.name='Investigation by Sandeep', invest.date='2025-06-09'"
        ]
        run_queries(session, nodes_queries)
        print("Nodes created/updated (idempotent).")

        # --- Relationships (MERGE) ---
        rel_queries = [
            "MATCH (mA1:Material {id:'MAT-SOL-01-A1'}), (v1:Vendor {id:'VEND-1'}) MERGE (mA1)-[:SUPPLIED_BY]->(v1)",
            "MATCH (mB2:Material {id:'MAT-SOL-01-B2'}), (v2:Vendor {id:'VEND-2'}) MERGE (mB2)-[:SUPPLIED_BY]->(v2)",
            "MATCH (mA1:Material {id:'MAT-SOL-01-A1'}), (p1:Plant {id:'PLANT-01'}) MERGE (mA1)-[:RECEIVED_AT {date:'2025-06-01', location:'S-10'}]->(p1)",
            "MATCH (mB2:Material {id:'MAT-SOL-01-B2'}), (p1:Plant {id:'PLANT-01'}) MERGE (mB2)-[:RECEIVED_AT {date:'2025-09-02', status:'HOLD'}]->(p1)",
            "MATCH (b1:Batch {id:'BATCH-001'}), (mA1:Material {id:'MAT-SOL-01-A1'}) MERGE (b1)-[:USED_MATERIAL]->(mA1)",
            "MATCH (b2:Batch {id:'BATCH-002'}), (mB2:Material {id:'MAT-SOL-01-B2'}) MERGE (b2)-[:USED_MATERIAL]->(mB2)",
            "MATCH (b1:Batch {id:'BATCH-001'}), (prod:Product {id:'PROD-ALPHA'}) MERGE (b1)-[:PRODUCED]->(prod)",
            "MATCH (b2:Batch {id:'BATCH-002'}), (prod:Product {id:'PROD-ALPHA'}) MERGE (b2)-[:PRODUCED]->(prod)",
            "MATCH (b1:Batch {id:'BATCH-001'}), (p1:Plant {id:'PLANT-01'}) MERGE (b1)-[:PERFORMED_AT]->(p1)",
            "MATCH (b2:Batch {id:'BATCH-002'}), (p1:Plant {id:'PLANT-01'}) MERGE (b2)-[:PERFORMED_AT]->(p1)",
            "MATCH (b1:Batch {id:'BATCH-001'}), (t1:LIMSTest {id:'LIMS-T-1001'}) MERGE (b1)-[:HAS_TEST]->(t1)",
            "MATCH (b1:Batch {id:'BATCH-001'}), (t2:LIMSTest {id:'LIMS-T-1003'}) MERGE (b1)-[:HAS_TEST]->(t2)",
            "MATCH (b2:Batch {id:'BATCH-002'}), (t3:LIMSTest {id:'LIMS-T-1002'}) MERGE (b2)-[:HAS_TEST]->(t3)",
            "MATCH (t1:LIMSTest {id:'LIMS-T-1001'}), (s1:LIMSSample {id:'LIMS-S-1001'}) MERGE (t1)-[:SAMPLE_OF]->(s1)",
            "MATCH (t2:LIMSTest {id:'LIMS-T-1003'}), (s3:LIMSSample {id:'LIMS-S-1003'}) MERGE (t2)-[:SAMPLE_OF]->(s3)",
            "MATCH (t3:LIMSTest {id:'LIMS-T-1002'}), (s2:LIMSSample {id:'LIMS-S-1002'}) MERGE (t3)-[:SAMPLE_OF]->(s2)",
            "MATCH (compl:Complaint {id:'COMP-2025-06-20-77'}), (b1:Batch {id:'BATCH-001'}) MERGE (compl)-[:REPORTS]->(b1)",
            "MATCH (cust:Customer {id:'CUST-33'}), (compl:Complaint {id:'COMP-2025-06-20-77'}) MERGE (cust)-[:RAISED]->(compl)",
            "MATCH (v1:Vendor {id:'VEND-1'}), (reply:SupplierNote {id:'UC-2025-0615-REPLY'}) MERGE (v1)-[:REPLIED_WITH]->(reply)",
            "MATCH (invest:Investigation {id:'INV-2025-06-09'}), (b1:Batch {id:'BATCH-001'}) MERGE (invest)-[:INVESTIGATED]->(b1)",
            "MATCH (s1:LIMSSample {id:'LIMS-S-1001'}), (b1:Batch {id:'BATCH-001'}) MERGE (s1)-[:SAMPLED_BY]->(b1)",
            "MATCH (s3:LIMSSample {id:'LIMS-S-1003'}), (b1:Batch {id:'BATCH-001'}) MERGE (s3)-[:SAMPLED_BY]->(b1)",
            "MATCH (s2:LIMSSample {id:'LIMS-S-1002'}), (b2:Batch {id:'BATCH-002'}) MERGE (s2)-[:SAMPLED_BY]->(b2)"
        ]
        run_queries(session, rel_queries)
        print("Relationships created/updated (idempotent).")

        # --- Simple verification ---
        labels = ["Vendor","Material","Plant","Product","Batch","LIMSTest","LIMSSample","Customer","Complaint","SupplierNote","Investigation"]
        for lbl in labels:
            rec = session.run(f"MATCH (n:{lbl}) RETURN count(n) AS cnt").single()
            cnt = rec["cnt"] if rec else 0
            print(f"{lbl}: {cnt}")

        print("\nQuick sample outputs:")
        sample = session.run("MATCH (m:Material)-[:SUPPLIED_BY]->(v:Vendor) RETURN m.id AS material, m.name AS mat_name, v.name AS vendor LIMIT 10")
        for r in sample:
            print("-", r["material"], "|", r["mat_name"], "| supplied by ->", r["vendor"])

    except Exception as e:
        print("ERROR during load:", e)
    finally:
        driver.close()
