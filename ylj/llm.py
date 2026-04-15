"""Local LLM loading and inference via Hugging Face Transformers."""

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from ylj.config import LLM_MAX_NEW_TOKENS, LLM_MODEL, LLM_TEMPERATURE

_model = None
_tokenizer = None


def get_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model():
    """Load and cache the LLM and tokenizer."""
    global _model, _tokenizer
    if _model is None:
        device = get_device()
        print(f"Loading {LLM_MODEL} on {device}...")

        _tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL)
        _model = AutoModelForCausalLM.from_pretrained(
            LLM_MODEL,
            torch_dtype=torch.float16 if device != "cpu" else torch.float32,
            device_map="auto",
        )
        print("Model loaded.")
    return _model, _tokenizer


RAG_PROMPT_TEMPLATE = """\
You are a helpful assistant. Answer the user's question based on the provided context.
If the context doesn't contain enough information, say so honestly.

Context:
{context}

Question: {question}

Answer:"""


def generate(question: str, context_chunks: list[dict]) -> str:
    """Generate a response using retrieved context."""
    model, tokenizer = load_model()

    context = "\n\n---\n\n".join(
        f"[Source: {c['source']}"
        + (f", Page {c['page']}" if c.get("page") else "")
        + f"]\n{c['text']}"
        for c in context_chunks
    )

    prompt = RAG_PROMPT_TEMPLATE.format(context=context, question=question)

    messages = [{"role": "user", "content": prompt}]
    input_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(input_text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=LLM_MAX_NEW_TOKENS,
            temperature=LLM_TEMPERATURE,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )

    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True)
    return response.strip()
