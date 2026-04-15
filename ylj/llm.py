"""Local LLM inference via Ollama."""

import requests

from ylj.config import LLM_MAX_NEW_TOKENS, LLM_MODEL, LLM_TEMPERATURE

OLLAMA_URL = "http://localhost:11434/api/chat"

RAG_PROMPT_TEMPLATE = """\
You are a helpful assistant. Answer the user's question based on the provided context.
If the context doesn't contain enough information, say so honestly.

Context:
{context}

Question: {question}

Answer:"""

DIRECT_PROMPT_TEMPLATE = """\
You are a helpful assistant. Answer the user's question to the best of your ability.

Question: {question}

Answer:"""


def generate(question: str, context_chunks: list[dict]) -> str:
    """Generate a response via Ollama, with or without retrieved context."""
    if context_chunks:
        context = "\n\n---\n\n".join(
            f"[Source: {c['source']}"
            + (f", Page {c['page']}" if c.get("page") else "")
            + f"]\n{c['text']}"
            for c in context_chunks
        )
        prompt = RAG_PROMPT_TEMPLATE.format(context=context, question=question)
    else:
        prompt = DIRECT_PROMPT_TEMPLATE.format(question=question)

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "num_predict": LLM_MAX_NEW_TOKENS,
                "temperature": LLM_TEMPERATURE,
            },
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["message"]["content"].strip()
