"""
rag.py — Retrieval-Augmented Generation pipeline
Uses sentence-transformers (all-MiniLM-L6-v2) for free local embeddings
and FAISS (flat inner-product) for vector search.
No paid services. No LangChain.
"""

import pickle
import logging
import numpy as np
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────
INDEX_DIR     = Path("faiss_index")
INDEX_FILE    = INDEX_DIR / "index.faiss"
METADATA_FILE = INDEX_DIR / "metadata.pkl"

CHUNK_SIZE  = 800   # characters per chunk
OVERLAP     = 150   # overlap between consecutive chunks
TOP_K       = 4     # chunks to retrieve per query
MIN_SCORE   = 0.10  # cosine-similarity threshold (0–1)
EMBED_DIM   = 384   # all-MiniLM-L6-v2 output dimension

# ── Lazy singletons ──────────────────────────────────────────
_model  = None
_index  = None
_chunks: List[dict] = []   # [{"text": ..., "source": ...}]


def _get_model():
    global _model
    if _model is None:
        logger.info("Loading sentence-transformer model (all-MiniLM-L6-v2)…")
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("✅ Embedding model loaded")
    return _model


def _get_index():
    global _index, _chunks
    if _index is None:
        if INDEX_FILE.exists() and METADATA_FILE.exists():
            _load_from_disk()
        else:
            _init_empty()
    return _index


def _init_empty():
    global _index
    import faiss
    _index = faiss.IndexFlatIP(EMBED_DIM)
    logger.info("Created fresh FAISS index")


def _load_from_disk():
    global _index, _chunks
    import faiss
    _index = faiss.read_index(str(INDEX_FILE))
    with open(METADATA_FILE, "rb") as f:
        _chunks = pickle.load(f)
    logger.info(f"Loaded FAISS index: {_index.ntotal} vectors, {len(_chunks)} chunks")


def _save_to_disk():
    import faiss
    INDEX_DIR.mkdir(exist_ok=True)
    faiss.write_index(_index, str(INDEX_FILE))
    with open(METADATA_FILE, "wb") as f:
        pickle.dump(_chunks, f)
    logger.info(f"FAISS index saved ({_index.ntotal} vectors)")


# ── Text splitting ───────────────────────────────────────────
def split_text(text: str) -> List[str]:
    """Split text into overlapping chunks using RecursiveCharacterTextSplitter."""
    if not text:
        return []
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=OVERLAP,
    )
    return text_splitter.split_text(text)


# ── Public API ───────────────────────────────────────────────
def add_texts(texts: List[str], source: str = "unknown") -> int:
    """Embed and index a list of raw text strings. Returns chunk count added."""
    global _chunks
    model = _get_model()
    index = _get_index()

    all_chunks = []
    for t in texts:
        print(f"Extracted text length: {len(t)}")
        all_chunks.extend(split_text(t))

    print("Chunks:", len(all_chunks))

    if not all_chunks:
        return 0

    embeddings = model.encode(all_chunks, normalize_embeddings=True, show_progress_bar=False)
    embeddings = np.array(embeddings, dtype="float32")
    index.add(embeddings)

    for chunk in all_chunks:
        _chunks.append({"text": chunk, "source": source})

    _save_to_disk()
    logger.info(f"Added {len(all_chunks)} chunks from '{source}'. Total: {index.ntotal}")
    print(f"FAISS index size: {index.ntotal}")
    return len(all_chunks)


def query(question: str, k: int = TOP_K) -> List[str]:
    """Return the top-k most relevant chunks for a question."""
    index = _get_index()
    if index.ntotal == 0:
        return []

    model = _get_model()
    q_emb = model.encode([question], normalize_embeddings=True, show_progress_bar=False)
    q_emb = np.array(q_emb, dtype="float32")

    k_actual = min(k, index.ntotal)
    scores, indices = index.search(q_emb, k_actual)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx >= 0 and float(score) >= MIN_SCORE:
            results.append(_chunks[idx]["text"])
    return results


def get_stats() -> dict:
    index = _get_index()
    sources = list(set(c["source"] for c in _chunks)) if _chunks else []
    return {
        "total_chunks": int(index.ntotal),
        "total_sources": len(sources),
        "sources": sources,
    }


def clear_index():
    global _index, _chunks
    _init_empty()
    _chunks = []
    if INDEX_FILE.exists():
        INDEX_FILE.unlink()
    if METADATA_FILE.exists():
        METADATA_FILE.unlink()
    logger.info("FAISS index cleared")
