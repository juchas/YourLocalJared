"""Configuration for YourLocalJared RAG system."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DOCUMENTS_DIR = Path(os.getenv("YLJ_DOCUMENTS_DIR", PROJECT_ROOT / "documents"))
MODELS_DIR = Path(os.getenv("YLJ_MODELS_DIR", PROJECT_ROOT / "models"))

# Qdrant (local file-based storage, no Docker needed)
QDRANT_PATH = Path(os.getenv("YLJ_QDRANT_PATH", PROJECT_ROOT / "qdrant_data"))
COLLECTION_NAME = os.getenv("YLJ_COLLECTION_NAME", "documents")

# Embedding model
EMBEDDING_MODEL = os.getenv("YLJ_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIMENSION = int(os.getenv("YLJ_EMBEDDING_DIMENSION", "384"))

# LLM (via Ollama)
OLLAMA_HOST = os.getenv("YLJ_OLLAMA_HOST", "http://localhost:11434")
LLM_MODEL = os.getenv("YLJ_LLM_MODEL", "qwen2.5:7b")
LLM_MAX_NEW_TOKENS = int(os.getenv("YLJ_LLM_MAX_NEW_TOKENS", "512"))
LLM_TEMPERATURE = float(os.getenv("YLJ_LLM_TEMPERATURE", "0.7"))

# RAG
CHUNK_SIZE = int(os.getenv("YLJ_CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("YLJ_CHUNK_OVERLAP", "50"))
TOP_K = int(os.getenv("YLJ_TOP_K", "5"))

# Server
SERVER_HOST = os.getenv("YLJ_SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("YLJ_SERVER_PORT", "8000"))
