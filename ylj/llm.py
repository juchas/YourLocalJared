"""LLM inference via the local Ollama daemon.

The Ollama daemon (default http://localhost:11434) handles model loading,
quantization, and GPU offload. We just POST a chat request and surface
clean errors when the daemon is down or the model isn't pulled.
"""

import httpx

from ylj.config import (
    LLM_MAX_NEW_TOKENS,
    LLM_MODEL,
    LLM_TEMPERATURE,
    OLLAMA_HOST,
)

RAG_PROMPT_TEMPLATE = """\
You are a helpful assistant. Answer the user's question based on the provided context.
If the context doesn't contain enough information, say so honestly.

Context:
{context}

Question: {question}

Answer:"""


def _format_context(context_chunks: list[dict]) -> str:
    return "\n\n---\n\n".join(
        f"[Source: {c['source']}"
        + (f", Page {c['page']}" if c.get("page") else "")
        + f"]\n{c['text']}"
        for c in context_chunks
    )


def generate(question: str, context_chunks: list[dict]) -> str:
    """Generate a response using retrieved context via Ollama."""
    prompt = RAG_PROMPT_TEMPLATE.format(
        context=_format_context(context_chunks),
        question=question,
    )

    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": LLM_TEMPERATURE,
            "num_predict": LLM_MAX_NEW_TOKENS,
        },
    }

    url = f"{OLLAMA_HOST.rstrip('/')}/api/chat"

    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(url, json=payload)
    except httpx.ConnectError as e:
        raise RuntimeError(
            f"Ollama daemon not reachable at {OLLAMA_HOST}. "
            "Is it running? Try `ollama serve` or install from https://ollama.com."
        ) from e
    except httpx.HTTPError as e:
        raise RuntimeError(f"Ollama request failed: {e}") from e

    if response.status_code == 404:
        raise RuntimeError(
            f"Model '{LLM_MODEL}' not pulled. Run: ollama pull {LLM_MODEL}"
        )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Ollama returned HTTP {response.status_code}: {response.text[:200]}"
        )

    try:
        data = response.json()
    except ValueError as e:
        raise RuntimeError(
            f"Ollama returned invalid JSON: {response.text[:200]}"
        ) from e

    if not isinstance(data, dict):
        raise RuntimeError("Ollama returned an unexpected response format.")

    message = data.get("message")
    if not isinstance(message, dict):
        raise RuntimeError("Ollama response missing 'message' object.")

    content = message.get("content")
    if not isinstance(content, str):
        raise RuntimeError("Ollama response missing 'message.content' string.")

    return content.strip()
def status() -> dict:
    """Check Ollama daemon reachability and list pulled models.

    Never raises — returns running=false on any error so the UI can render
    a clean warning instead of a 500.
    """
    base = OLLAMA_HOST.rstrip("/")
    try:
        with httpx.Client(timeout=2) as client:
            version = client.get(f"{base}/api/version").json()
            tags = client.get(f"{base}/api/tags").json()
        models = [m.get("name") for m in tags.get("models", []) if m.get("name")]
        return {"running": True, "version": version.get("version"), "models": models}
    except Exception:
        return {"running": False, "version": None, "models": []}
