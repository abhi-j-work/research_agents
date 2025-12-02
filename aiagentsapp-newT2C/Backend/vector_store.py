# vector_store.py
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from typing import List, Dict

EMB_MODEL = SentenceTransformer("all-MiniLM-L6-v2")

class VectorStore:
    def __init__(self):
        self.dim = EMB_MODEL.get_sentence_embedding_dimension()
        self.index = faiss.IndexFlatL2(self.dim)
        # Store full dicts instead of just strings
        self.documents: List[Dict] = [] 
        self._count = 0

    def add_document(self, text: str, metadata: Dict):
        """
        metadata example: {"filename": "manual.pdf", "upload_date": "2023..."}
        """
        # Simple chunking (You can replace this with a better splitter)
        chunk_size = 500
        chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size-50)]
        
        if not chunks: return
        
        vectors = EMB_MODEL.encode(chunks, convert_to_numpy=True)
        self.index.add(vectors)
        
        for i, chunk in enumerate(chunks):
            self.documents.append({
                "text": chunk,
                "metadata": metadata,
                "chunk_id": i
            })
        self._count += len(chunks)

    def search(self, query: str, k=4) -> List[Dict]:
        """Returns list of {text, metadata, score}"""
        if self._count == 0: return []
        
        vec = EMB_MODEL.encode([query], convert_to_numpy=True)
        distances, indices = self.index.search(vec, k)
        
        results = []
        for i, idx in enumerate(indices[0]):
            if 0 <= idx < len(self.documents):
                doc = self.documents[idx]
                # Add distance score for relevance debugging
                results.append({
                    **doc,
                    "score": float(distances[0][i])
                })
        return results

vector_db = VectorStore()