"""Contract test for GET /api/config.

The chat UI resolves its model id from this endpoint instead of hardcoding
one, so a silent change to its shape would break model selection on the
frontend without any Python-side test failure.
"""

from fastapi.testclient import TestClient

from ylj import server


def test_config_endpoint_shape():
    client = TestClient(server.app)
    r = client.get("/api/config")
    assert r.status_code == 200

    body = r.json()
    assert set(body.keys()) == {"llm_model", "embedding_model", "embedding_dimension"}
    assert isinstance(body["llm_model"], str) and body["llm_model"]
    assert isinstance(body["embedding_model"], str) and body["embedding_model"]
    assert isinstance(body["embedding_dimension"], int)
    assert body["embedding_dimension"] > 0


def test_config_endpoint_reflects_module_constants():
    client = TestClient(server.app)
    body = client.get("/api/config").json()
    assert body["llm_model"] == server.LLM_MODEL
    assert body["embedding_model"] == server.EMBEDDING_MODEL
    assert body["embedding_dimension"] == server.EMBEDDING_DIMENSION
