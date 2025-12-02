#!/usr/bin/env python3
"""
load_demo_graph_dense.py

Load a richly connected demo graph into Neo4j (idempotent).
Generates many Vendors, Materials, Batches, Plants, Products, Customers,
LIMS Tests/Samples, Complaints, Investigations, SupplierNotes and many relations.
"""

import os
import sys
import random
from datetime import datetime, timedelta
from neo4j import GraphDatabase

# --- Configuration: adjust these to scale the graph up/down -----------------
NUM_VENDORS = 8
NUM_PLANTS = 3
NUM_PRODUCTS = 4
NUM_MATERIALS = 60
NUM_BATCHES = 40
NUM_CUSTOMERS = 10
NUM_COMPLAINTS = 12
NUM_INVESTIGATIONS = 12
NUM_SUPPLIER_NOTES = 24
# tests ~= batches * avg_tests_per_batch
AVG_TESTS_PER_BATCH = 2
# --------------------------------------------------------------------------

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j+s://556b1426.databases.neo4j.io")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "kXsESYrk7mAg_atGJmB5UjbO7zML3XBevBwyCY_YxZc")
WIPE = os.getenv("WIPE", "false").lower() in ("1", "true", "yes")

if not (NEO4J_URI and NEO4J_USER and NEO4J_PASSWORD):
    print("ERROR: Please set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD (see README).")
    sys.exit(1)

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# deterministic reproducible generation
random.seed(42)

METRICS = ["particle_count", "metal_ppm", "resistivity", "viscosity"]
CONFIDENCES = ["High", "Medium", "Low"]

def run_queries(session, queries):
    """Run a list of queries one by one"""
    for q in queries:
        session.run(q)

def chunked(iterable, size):
    it = list(iterable)
    for i in range(0, len(it), size):
        yield it[i:i+size]

with driver.session() as session:
    try:
        if WIPE:
            print("WIPING database...")
            session.run("MATCH (n) DETACH DELETE n")
            print("Done wipe.")

        # --- Constraints / uniqueness ---------------------------------------
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (v:Vendor) REQUIRE v.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Material) REQUIRE m.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (b:Batch) REQUIRE b.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (t:LIMSTest) REQUIRE t.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (s:LIMSSample) REQUIRE s.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Plant) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (prod:Product) REQUIRE prod.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (cust:Customer) REQUIRE cust.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (compl:Complaint) REQUIRE compl.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (note:SupplierNote) REQUIRE note.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (inv:Investigation) REQUIRE inv.id IS UNIQUE"
        ]
        run_queries(session, constraints)
        print("Constraints ensured.")

        # --- Generate node payloads ----------------------------------------
        # vendors
        vendor_names = ["UltraChem Supplies", "PureMaterials Ltd", "QuantumChem", "SigmaSource", "NanoBlend Co", "EastFab Suppliers", "GlobalResins", "PrecisionChem"]
        vendors = []
        for i in range(NUM_VENDORS):
            vid = f"VEND-{i+1:02d}"
            vendors.append({
                "id": vid,
                "name": vendor_names[i % len(vendor_names)] + (f" {i+1}" if i >= len(vendor_names) else ""),
                "rating": round(random.uniform(3.5, 5.0), 2),
                "country": random.choice(["US", "DE", "JP", "KR", "IN", "CN", "TW"]),
                "preferred_since": (datetime(2024,1,1) + timedelta(days=random.randint(0,600))).date().isoformat()
            })

        # plants
        plants = []
        plant_names = ["Fab East", "Fab West", "Pilot Plant"]
        for i in range(NUM_PLANTS):
            pid = f"PLANT-{i+1:02d}"
            plants.append({"id": pid, "name": plant_names[i % len(plant_names)], "location": random.choice(["Austin", "Singapore", "Hsinchu", "Bangalore"]) })

        # products
        products = []
        prod_names = ["Alpha Coating", "Beta Barrier", "Gamma Primer", "Delta Top"]
        for i in range(NUM_PRODUCTS):
            pid = f"PROD-{['ALPHA','BETA','GAMMA','DELTA'][i%4]}"
            products.append({"id": pid, "name": prod_names[i % len(prod_names)], "product_family": "DemoCoatings"})

        # materials
        materials = []
        base_date = datetime(2025, 1, 1)
        for i in range(NUM_MATERIALS):
            mid = f"MAT-{i+1:04d}"
            purity = round(random.uniform(90.0, 99.99), 2)
            m = {
                "id": mid,
                "name": f"Material-{i+1:04d}",
                "lot": f"L{random.randint(100,999)}-{random.choice(['A','B','C'])}",
                "purity": purity,
                "metal_ppm": round(random.uniform(0.1, 50.0), 2),
                "particle_count": random.randint(5, 2000),
                "certificate_confidence": random.choice(CONFIDENCES),
                "blended_on": (base_date + timedelta(days=random.randint(0,240))).date().isoformat()
            }
            materials.append(m)

        # batches
        batches = []
        batch_start = datetime(2025, 5, 1, 6, 0)
        operators = ["J. Singh", "L. Chen", "S. Park", "M. Gupta", "E. Santos"]
        for i in range(NUM_BATCHES):
            bid = f"BATCH-{i+1:03d}"
            start = batch_start + timedelta(days=i, hours=random.randint(0,6))
            end = start + timedelta(hours=random.randint(3,8))
            batches.append({
                "id": bid,
                "name": f"Batch {i+1:03d}",
                "start_time": start.isoformat() + "Z",
                "end_time": end.isoformat() + "Z",
                "operator": random.choice(operators),
                "process_version": random.choice(["PROCESS-COAT-1 v2.3", "PROCESS-COAT-2 v1.4"])
            })

        # customers
        customers = []
        cust_names = ["WaferWorks Inc.", "SiliconEdge", "MicroFab Ltd", "NanoCircuits", "ChipSmith"]
        for i in range(NUM_CUSTOMERS):
            cid = f"CUST-{i+1:03d}"
            customers.append({"id": cid, "name": cust_names[i % len(cust_names)], "account_tier": random.choice(["Standard","Priority","Enterprise"])})

        # supplier notes
        supplier_notes = []
        for i in range(NUM_SUPPLIER_NOTES):
            nid = f"NOTE-{i+1:03d}"
            supplier_notes.append({"id": nid, "name": f"Vendor Note {i+1}", "date": (datetime(2025,5,1)+timedelta(days=random.randint(0,200))).date().isoformat(), "note": f"Re-test results {random.randint(1,100)}"})

        # complaints
        complaints = []
        for i in range(NUM_COMPLAINTS):
            cid = f"COMP-{2025}-{i+1:03d}"
            complaints.append({"id": cid, "name": f"Complaint {i+1}", "date": (datetime(2025,6,1)+timedelta(days=random.randint(0,120))).date().isoformat(), "yield_drop": round(random.uniform(0.5,8.0),2), "failure_mode": random.choice(["particle_defects","delamination","contamination"])})

        # investigations
        investigations = []
        for i in range(NUM_INVESTIGATIONS):
            iid = f"INV-{2025}-{i+1:03d}"
            investigations.append({"id": iid, "name": f"Investigation {i+1}", "date": (datetime(2025,6,1)+timedelta(days=random.randint(0,150))).date().isoformat()})

        # tests & samples (generate tests tied to batches)
        lims_tests = []
        lims_samples = []
        test_links = []  # {test, batch, sample}
        test_id_counter = 1000
        for b in batches:
            num_tests = random.randint(max(1, AVG_TESTS_PER_BATCH-1), AVG_TESTS_PER_BATCH+1)
            for _ in range(num_tests):
                tid = f"LIMS-T-{test_id_counter}"
                sid = f"LIMS-S-{test_id_counter}"
                metric = random.choice(METRICS)
                # link some values to material averages by sampling a material used later for this batch
                value = None
                if metric == "metal_ppm":
                    v = round(random.uniform(0.05, 30.0), 2)
                    spec = round(random.uniform(1.0, 10.0), 2)
                else:
                    v = round(random.uniform(1, 2000), 2)
                    spec = round(random.uniform(50, 1500), 2)
                result = "WITHIN_SPEC" if v <= spec else "OUT_OF_SPEC"
                confidence = random.choice(CONFIDENCES)
                lims_tests.append({"id": tid, "name": f"{tid} {metric}", "metric": metric, "value": v, "units": ("ppm" if metric == "metal_ppm" else "particles/cm3"), "instrument": random.choice(["ICP-MS-1","ICP-MS-3","laser-particle-counter"]), "spec_limit": spec, "result": result, "confidence": confidence})
                lims_samples.append({"id": sid, "name": sid, "collected_at": (datetime.fromisoformat(b["start_time"].replace("Z","")) + timedelta(minutes=random.randint(15,180))).isoformat() + "Z"})
                test_links.append({"test": tid, "batch": b["id"], "sample": sid})
                test_id_counter += 1

        # --- Create nodes in batches using UNWIND / MERGE -------------------
        # chunk large lists if necessary
        session.run("UNWIND $vendors AS v MERGE (n:Vendor {id: v.id}) SET n += v", vendors=vendors)
        session.run("UNWIND $plants AS p MERGE (n:Plant {id: p.id}) SET n += p", plants=plants)
        session.run("UNWIND $products AS pr MERGE (n:Product {id: pr.id}) SET n += pr", products=products)
        session.run("UNWIND $materials AS m MERGE (n:Material {id: m.id}) SET n += m", materials=materials)
        session.run("UNWIND $batches AS b MERGE (n:Batch {id: b.id}) SET n += b", batches=batches)
        session.run("UNWIND $customers AS c MERGE (n:Customer {id: c.id}) SET n += c", customers=customers)
        session.run("UNWIND $supplier_notes AS sn MERGE (n:SupplierNote {id: sn.id}) SET n += sn", supplier_notes=supplier_notes)
        session.run("UNWIND $complaints AS cm MERGE (n:Complaint {id: cm.id}) SET n += cm", complaints=complaints)
        session.run("UNWIND $investigations AS inv MERGE (n:Investigation {id: inv.id}) SET n += inv", investigations=investigations)
        session.run("UNWIND $tests AS t MERGE (n:LIMSTest {id: t.id}) SET n += t", tests=lims_tests)
        session.run("UNWIND $samples AS s MERGE (n:LIMSSample {id: s.id}) SET n += s", samples=lims_samples)

        print("Nodes created/updated.")

        # --- Relationships: make graph dense & interconnected ---------------
        # 1) SUPPLIED_BY: each material gets 1-3 vendors
        supply_rels = []
        for m in materials:
            suppliers = random.sample(vendors, random.randint(1, min(3, len(vendors))))
            for v in suppliers:
                supply_rels.append({"mat": m["id"], "vend": v["id"], "date": (datetime.fromisoformat(m["blended_on"]) - timedelta(days=random.randint(0,30))).date().isoformat(), "status": random.choice(["OK","HOLD"])})

        session.run("""
            UNWIND $rels AS r
            MATCH (m:Material {id: r.mat}), (v:Vendor {id: r.vend})
            MERGE (m)-[rel:SUPPLIED_BY]->(v)
            SET rel.date = r.date, rel.status = r.status
        """, rels=supply_rels)

        # 2) RECEIVED_AT: materials -> plants (1-2 plants)
        received_rels = []
        for m in materials:
            ps = random.sample(plants, random.randint(1, min(2, len(plants))))
            for p in ps:
                received_rels.append({"mat": m["id"], "plant": p["id"], "date": (datetime.fromisoformat(m["blended_on"]) + timedelta(days=random.randint(1,30))).date().isoformat(), "location": f"S-{random.randint(1,20)}"})

        session.run("""
            UNWIND $rr AS r
            MATCH (m:Material {id: r.mat}), (p:Plant {id: r.plant})
            MERGE (m)-[rel:RECEIVED_AT]->(p)
            SET rel.date = r.date, rel.location = r.location
        """, rr=received_rels)

        # 3) USED_MATERIAL: make each batch use 2-6 materials (causes sharing)
        used_rels = []
        for b in batches:
            used_mats = random.sample(materials, random.randint(2, min(6, len(materials))))
            for um in used_mats:
                used_rels.append({"batch": b["id"], "material": um["id"], "qty": round(random.uniform(0.1, 25.0), 3), "lot": um["lot"]})
        session.run("""
            UNWIND $used AS u
            MATCH (b:Batch {id: u.batch}), (m:Material {id: u.material})
            MERGE (b)-[r:USED_MATERIAL]->(m)
            SET r.qty = u.qty, r.lot = u.lot
        """, used=used_rels)

        # 4) PRODUCED: link batches to products (a batch can produce multiple products occasionally)
        produced_rels = []
        for b in batches:
            prods = random.sample(products, random.randint(1, min(2, len(products))))
            for pr in prods:
                produced_rels.append({"batch": b["id"], "product": pr["id"]})
        session.run("""
            UNWIND $prs AS p
            MATCH (b:Batch {id: p.batch}), (pr:Product {id: p.product})
            MERGE (b)-[:PRODUCED]->(pr)
        """, prs=produced_rels)

        # 5) PERFORMED_AT: link batches -> plants (each batch at one plant)
        perf = []
        for i,b in enumerate(batches):
            plant = plants[i % len(plants)]
            perf.append({"batch": b["id"], "plant": plant["id"]})
        session.run("""
            UNWIND $perf AS p
            MATCH (b:Batch {id: p.batch}), (pl:Plant {id: p.plant})
            MERGE (b)-[:PERFORMED_AT]->(pl)
        """, perf=perf)

        # 6) HAS_TEST / SAMPLE_OF relationships (tests -> samples; tests -> batch)
        session.run("""
            UNWIND $links AS l
            MATCH (t:LIMSTest {id: l.test}), (b:Batch {id: l.batch}), (s:LIMSSample {id: l.sample})
            MERGE (b)-[:HAS_TEST]->(t)
            MERGE (t)-[:SAMPLE_OF]->(s)
            MERGE (s)-[:SAMPLED_BY]->(b)
        """, links=test_links)

        # 7) SAMPLED_BY duplicates: some samples are related to multiple batches to create more links
        # link random existing samples to additional batches
        extra_sample_links = []
        for tl in random.sample(test_links, min(40, len(test_links))):
            other_batch = random.choice(batches)["id"]
            extra_sample_links.append({"sample": tl["sample"], "batch": other_batch})
        session.run("""
            UNWIND $links AS l
            MATCH (s:LIMSSample {id: l.sample}), (b:Batch {id: l.batch})
            MERGE (s)-[:SAMPLED_BY]->(b)
        """, links=extra_sample_links)

        # 8) CUSTOMERS purchased PRODUCTS and RAISED complaints
        purchase_rels = []
        for c in customers:
            purchases = random.sample(products, random.randint(1, len(products)))
            for p in purchases:
                purchase_rels.append({"cust": c["id"], "product": p["id"], "date": (datetime(2025,5,1)+timedelta(days=random.randint(0,200))).date().isoformat()})
        session.run("""
            UNWIND $p AS r
            MATCH (c:Customer {id: r.cust}), (pr:Product {id: r.product})
            MERGE (c)-[:PURCHASED]->(pr)
            SET pr.last_purchase_date = r.date
        """, p=purchase_rels)

        # complaints: connect customers -> complaint -> batch/product
        comp_rels = []
        comp_cust_links = []
        comp_batch_links = []
        for i, comp in enumerate(complaints):
            cust = random.choice(customers)["id"]
            # link to a batch and a product to increase connectivity
            batch = random.choice(batches)["id"]
            product = random.choice(products)["id"]
            comp_cust_links.append({"complaint": comp["id"], "cust": cust})
            comp_batch_links.append({"complaint": comp["id"], "batch": batch, "product": product})
        session.run("""
            UNWIND $cl AS cl
            MATCH (c:Customer {id: cl.cust}), (cm:Complaint {id: cl.complaint})
            MERGE (c)-[:RAISED]->(cm)
        """, cl=comp_cust_links)
        session.run("""
            UNWIND $bl AS b
            MATCH (cm:Complaint {id: b.complaint}), (ba:Batch {id: b.batch}), (pr:Product {id: b.product})
            MERGE (cm)-[:REPORTS]->(ba)
            MERGE (cm)-[:ABOUT_PRODUCT]->(pr)
        """, bl=comp_batch_links)

        # 9) Investigations: link each investigation to 1-3 complaints, 1-2 batches and 1-2 vendors
        inv_links = []
        inv_comp_links = []
        for inv in investigations:
            linked_complaints = random.sample(complaints, random.randint(1, min(3, len(complaints))))
            linked_batches = random.sample(batches, random.randint(1, min(2, len(batches))))
            linked_vendors = random.sample(vendors, random.randint(1, min(2, len(vendors))))
            for c in linked_complaints:
                inv_comp_links.append({"inv": inv["id"], "complaint": c["id"]})
            for b in linked_batches:
                inv_links.append({"inv": inv["id"], "batch": b["id"]})
            for v in linked_vendors:
                inv_links.append({"inv_vendor": inv["id"], "vendor": v["id"]})
        # complaints -> investigations
        session.run("""
            UNWIND $ic AS ic
            MATCH (inv:Investigation {id: ic.inv}), (cm:Complaint {id: ic.complaint})
            MERGE (inv)-[:INVESTIGATES]->(cm)
        """, ic=inv_comp_links)
        # investigation -> batch
        inv_batch_links = [x for x in inv_links if 'batch' in x]
        if inv_batch_links:
            session.run("""
                UNWIND $ib AS ib
                MATCH (inv:Investigation {id: ib.inv}), (b:Batch {id: ib.batch})
                MERGE (inv)-[:INVESTIGATED]->(b)
            """, ib=inv_batch_links)
        # investigation -> vendor
        inv_vendor_links = [x for x in inv_links if 'vendor' in x]
        if inv_vendor_links:
            session.run("""
                UNWIND $iv AS iv
                MATCH (inv:Investigation {id: iv.inv_vendor}), (v:Vendor {id: iv.vendor})
                MERGE (inv)-[:RELATED_VENDOR]->(v)
            """, iv=inv_vendor_links)

        # 10) Supplier notes link to vendors and sometimes to investigations
        note_links = []
        for note in supplier_notes:
            vendor = random.choice(vendors)["id"]
            note_links.append({"note": note["id"], "vendor": vendor})
        session.run("""
            UNWIND $nl AS nl
            MATCH (note:SupplierNote {id: nl.note}), (v:Vendor {id: nl.vendor})
            MERGE (v)-[:REPLIED_WITH]->(note)
        """, nl=note_links)
        # randomly attach some notes to investigations
        note_inv_links = []
        for note in random.sample(supplier_notes, min(12, len(supplier_notes))):
            inv = random.choice(investigations)["id"]
            note_inv_links.append({"note": note["id"], "inv": inv})
        if note_inv_links:
            session.run("""
                UNWIND $n AS n
                MATCH (note:SupplierNote {id: n.note}), (inv:Investigation {id: n.inv})
                MERGE (note)-[:MENTIONS_INVESTIGATION]->(inv)
            """, n=note_inv_links)

        # 11) BLENDED_WITH / RELATED_TO between materials to create dense mesh
        blend_rels = []
        for m in materials:
            partners = random.sample([x for x in materials if x["id"] != m["id"]], k=min(3, len(materials)-1))
            for p in partners:
                blend_rels.append({"a": m["id"], "b": p["id"], "ratio": round(random.uniform(0.01,0.6), 3)})
        session.run("""
            UNWIND $bl AS bl
            MATCH (a:Material {id: bl.a}), (b:Material {id: bl.b})
            MERGE (a)-[r:BLENDED_WITH]->(b)
            SET r.ratio = bl.ratio
        """, bl=blend_rels)

        # 12) Vendor partnerships & VENDOR supplies to PLANT
        partner_rels = []
        supplies_to_plant = []
        for v in vendors:
            partners = random.sample([x for x in vendors if x["id"] != v["id"]], k=min(2, len(vendors)-1))
            for p in partners:
                partner_rels.append({"a": v["id"], "b": p["id"]})
            # vendors supply to 1-2 plants
            plant_targets = random.sample(plants, random.randint(1, min(2, len(plants))))
            for pl in plant_targets:
                supplies_to_plant.append({"vendor": v["id"], "plant": pl["id"], "since": (datetime(2024,1,1)+timedelta(days=random.randint(0,700))).date().isoformat()})
        session.run("""
            UNWIND $pr AS pr
            MATCH (a:Vendor {id: pr.a}), (b:Vendor {id: pr.b})
            MERGE (a)-[:PARTNERS_WITH]->(b)
        """, pr=partner_rels)
        session.run("""
            UNWIND $stp AS s
            MATCH (v:Vendor {id: s.vendor}), (pl:Plant {id: s.plant})
            MERGE (v)-[r:SUPPLIES_TO_PLANT]->(pl)
            SET r.since = s.since
        """, stp=supplies_to_plant)

        # 13) Link sequential batches (NEXT_BATCH) to show flow
        seq_links = []
        for i in range(len(batches)-1):
            seq_links.append({"a": batches[i]["id"], "b": batches[i+1]["id"], "step": i+1})
        session.run("""
            UNWIND $seq AS s
            MATCH (a:Batch {id: s.a}), (b:Batch {id: s.b})
            MERGE (a)-[:NEXT_BATCH {step: s.step}]->(b)
        """, seq=seq_links)

        # 14) Extra cross-links: some batches reference vendors directly (e.g., subcontracted)
        batch_vendor_links = []
        for b in random.sample(batches, min(len(batches), 30)):
            v = random.choice(vendors)["id"]
            batch_vendor_links.append({"batch": b["id"], "vendor": v, "role": random.choice(["subcontractor", "coating_supplier"])})
        session.run("""
            UNWIND $bv AS bv
            MATCH (b:Batch {id: bv.batch}), (v:Vendor {id: bv.vendor})
            MERGE (b)-[r:INVOLVES_VENDOR]->(v)
            SET r.role = bv.role
        """, bv=batch_vendor_links)

        print("Relationships created/updated (dense mesh).")

        # --- Simple verification / counts -----------------------------------
        labels = ["Vendor","Material","Plant","Product","Batch","LIMSTest","LIMSSample","Customer","Complaint","SupplierNote","Investigation"]
        for lbl in labels:
            rec = session.run(f"MATCH (n:{lbl}) RETURN count(n) AS cnt").single()
            cnt = rec["cnt"] if rec else 0
            print(f"{lbl}: {cnt}")

        print("\nQuick sample outputs:")
        sample = session.run("MATCH (m:Material)-[:SUPPLIED_BY]->(v:Vendor) RETURN m.id AS material, m.name AS mat_name, v.name AS vendor LIMIT 10")
        for r in sample:
            print("-", r["material"], "|", r["mat_name"], "| supplied by ->", r["vendor"])

        # show a batch with many used materials
        sample2 = session.run("MATCH (b:Batch)-[:USED_MATERIAL]->(m:Material) RETURN b.id AS batch, collect(m.id)[0..10] AS materials LIMIT 5")
        for r in sample2:
            print("Batch", r["batch"], "uses materials", r["materials"])

    except Exception as e:
        print("ERROR during load:", e)
    finally:
        driver.close()
