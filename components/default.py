"""Default components for RAG"""

from typing import List
import uuid
import httpx
from tqdm import tqdm
from qdrant_client.http.models import PointStruct
from qdrant_client.http.models import HnswConfigDiff
from qdrant_client.models import VectorParams, Distance
from qdrant_client.local.qdrant_local import QdrantLocal
from utils.registry import register
from utils.document import Document
from utils.readers import html_to_md
from utils.ollama_utils import ollama_model, ollama_chat_completion, ollama_embed
from utils.splitters import split_by_const

# def qdrant_collection(client, name: str, dim: int, create: bool):
#     """Check if collection exists and create, if needed"""
#     if client.collection_exists(collection_name=name) is False:
#         client.create_collection(
#             collection_name=name,
#             vectors_config=VectorParams(
#                 size=dim,
#                 distance=Distance.COSINE,
#                 on_disk=True,
#                 hnsw_config=HnswConfigDiff(ef_construct=100, m=16, on_disk=True)),
#             on_disk_payload=True
#         )
#         return create
#     return True


@register("indexer")
async def default_indexer(paths: str,
                          save: str = "./qdrant/",
                          name: str = "test_collection",
                          ollama_host: str = "http://localhost:11434",
                          ollama_embedding_model: str = "bge-m3:567m",
                          ollama_embedding_model_dim: int = 1024,
                          chunk_len: int = 2048,
                          chunk_overlap: int = 1024,
                          ollama_timeout: int = 60) -> bool:
    """My indexer"""
    if not ollama_model(ollama_embedding_model):
        return False
    paths = paths.split()
    client = QdrantLocal(save)
    result = True
    try:
        http_client = httpx.AsyncClient(headers={'User-Agent': 'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Safari/537.36'})
        # if not qdrant_collection(client, name, ollama_embedding_model_dim, True):
        #     return False
        if client.collection_exists(collection_name=name) is False:
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=ollama_embedding_model_dim,
                    distance=Distance.COSINE,
                    on_disk=True,
                    hnsw_config=HnswConfigDiff(ef_construct=100, m=16, on_disk=True)),
                on_disk_payload=True
            )
        for path in tqdm(paths):
            points = []
            text_md = await html_to_md(http_client, path)
            texts = split_by_const(text_md, chunk_len, chunk_overlap)
            response = await ollama_embed(ollama_host, ollama_timeout, ollama_embedding_model, texts)
            embs = response["embeddings"]
            for emb, text in zip(embs, texts):
                points.append(PointStruct(id=uuid.uuid4().hex, vector=emb, payload={"text": text}))
            client.upsert(
                collection_name=name,
                points=points
            )
    except Exception as e:
        print(e)
        result = False
    del client
    return result


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


@register("augmenter")
async def default_augmenter(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return "По запросу '" + query + "' найдена следующая информация:\n" + "\n\n".join([d.utf8_content for d in documents])


@register("generator")
async def default_generator(query: str,
                            tool_context: str,
                            seed: int = 42,
                            num_ctx: int = 4096,
                            temperature: float = 1.0,
                            model: str = 'gemma3:4b',
                            ollama_host: str = "http://localhost:11434",
                            sys_prompt = "Ты — ассистент, отвечающий на запросы пользователя исходя из найденной информации.") -> bool:
    """My generator"""
    # a = 1 / 0
    messages = [
        {
            "role": "system",
            "content": f"{sys_prompt}"
        },
        {
            "role": "user",
            "content": f"{tool_context}\n\n{query}"
        },
    ]
    if not ollama_model(model):
        return False
    await ollama_chat_completion(ollama_host, model, messages, seed=seed, num_ctx=num_ctx, temperature=temperature)
    return True
