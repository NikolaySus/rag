"""Module description preset"""

from typing import List
import uuid
import httpx
from tqdm import tqdm
from qdrant_client.http.models import PointStruct
from qdrant_client.http.models import HnswConfigDiff
from qdrant_client.models import VectorParams
from qdrant_client.models import Distance
from qdrant_client.local.qdrant_local import QdrantLocal
from utils.registry import register
from utils.document import Document
from utils.readers import html_to_md
from utils.ollama_utils import ollama_model
from utils.ollama_utils import ollama_chat_completion
from utils.ollama_utils import ollama_embed
from utils.splitters import split_by_const


@register("retriever")
async def default_retriever(query: str,
                            save: str = "./qdrant/",
                            name: str = "test_collection",
                            ollama_host: str = "http://localhost:11434",
                            ollama_embedding_model: str = "bge-m3:567m",
                            # ollama_embedding_model_dim: int = 1024,
                            ollama_timeout: int = 60) -> List[Document]:
    """My retriever"""
    k = 1
    documents = []
    if not ollama_model(ollama_embedding_model):
        return []
    client = QdrantLocal(save)
    try:
        # if not qdrant_collection(client, name, ollama_embedding_model_dim, True):
        if client.collection_exists(collection_name=name) is False:
            print(f"No '{name}' collection")
            return []
        response = await ollama_embed(ollama_host, ollama_timeout, ollama_embedding_model, [query])
        query_vector = response["embeddings"][0]
        top_k_results = client.search(
            collection_name=name,
            query_vector=query_vector,
            limit=k,
            with_payload=True,
        )
        for point in top_k_results:
            documents.append(Document(point.payload["text"]))
    except Exception as e:
        print(e)
    del client
    return documents
