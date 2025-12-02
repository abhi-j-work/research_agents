# graph_rag_index.py
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from typing import List, Dict

EMB_MODEL = SentenceTransformer("all-MiniLM-L6-v2")

class SimpleFAISSIndex:
    def __init__(self):
        self.dim = EMB_MODEL.get_sentence_embedding_dimension()
        self.index = faiss.IndexFlatL2(self.dim)
        self.metadatas: List[Dict] = []
        self._count = 0

    def add(self, texts: List[str], metas: List[Dict]):
        if not texts:
            return
        embs = EMB_MODEL.encode(texts, convert_to_numpy=True)
        embs = embs.astype("float32")
        self.index.add(embs)
        self.metadatas.extend(metas)
        self._count += len(texts)

    def search(self, q: str, k=5):
        if self._count == 0:
            return []
        qv = EMB_MODEL.encode([q], convert_to_numpy=True).astype("float32")
        D, I = self.index.search(qv, min(k, self._count))
        results = []
        for idx in I[0]:
            if idx < len(self.metadatas):
                results.append(self.metadatas[idx])
        return results

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 200):
    out = []
    start = 0
    n = len(text)
    while start < n:
        end = min(n, start + chunk_size)
        out.append(text[start:end])
        if end == n:
            break
        start = max(0, end - overlap)
    return out
