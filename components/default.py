"""Default components for RAG"""

from typing import List
from urllib.parse import urljoin
import ollama
import httpx
import uuid
#import chromadb
from tqdm import tqdm
from markdownify import markdownify
from bs4 import BeautifulSoup
from qdrant_client.http.models import PointStruct
from qdrant_client.http.models import HnswConfigDiff
from qdrant_client.models import VectorParams, Distance
from qdrant_client.local.qdrant_local import QdrantLocal
from utils.registry import register
from utils.document import Document


def check_ollama() -> bool:
    """Check if ollama is accessible"""
    try:
        ollama.ps()
    except ConnectionError as e:
        print(e)
        return False
    return True

def check_model(model: str) -> bool:
    """Check if model is accessible"""
    try:
        ollama.show(model)
    except ollama._types.ResponseError as e:
        print(e)
        return False
    return True

def try_pull_model(model: str) -> bool:
    """Try to pull model"""
    try:
        ollama.pull(model)
    except ollama._types.ResponseError as e:
        print(e)
        return False
    return True

async def ollama_chat_completion(model: str, messages, temperature=None, seed=None, num_ctx=None):
    """Async streaming example"""
    options = dict()
    if temperature is not None:
        options["temperature"] = temperature
    if seed is not None:
        options["seed"] = seed
    if num_ctx is not None:
        options["num_ctx"] = num_ctx
    async for part in await ollama.AsyncClient().chat(model=model, messages=messages, options=options, stream=True):
        print(part['message']['content'], end='', flush=True)
    print("")

# def chroma_db_collection(name: str, dim: int):
#     return []

def qdrant_collection(client, name: str, dim: int, create: bool):
    """Check if collection exists and create, if needed"""
    if client.collection_exists(collection_name=name) is False:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=dim,
                distance=Distance.COSINE,
                on_disk=True,
                hnsw_config=HnswConfigDiff(ef_construct=100, m=16, on_disk=True)),
            on_disk_payload=True
        )
        return create
    return True

def split_by_const(text: str, max_len: int, overlap_len: int) -> List[str]:
    """Split string into strings"""
    end = len(text)
    if max_len >= end:
        return [text]
    overlap_len = max_len // 2
    res = []
    start = 0
    while start < len(text):
        end = min(start + max_len, len(text))
        res.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap_len
    return res

async def html_to_md(client, url: str) -> str:
    """Download html by url and convert to md"""
    try:
        timeout = 5
        response = await client.get(url=url, timeout=timeout)
        if not response.is_success:
            return ""
        html_content = response.text
        soup = BeautifulSoup(html_content, 'html.parser')
        for tag in soup.find_all(['a', 'link', 'script', 'img']):
            attr = 'href' if tag.name in ['a', 'link'] else 'src'
            if tag.has_attr(attr):
                tag[attr] = urljoin(url, tag[attr])
        return markdownify(str(soup).replace(url + '#', ""))
    except Exception as e:
        return ""

@register("indexer")
async def default_indexer(paths: str) -> bool:
    """My indexer"""
    save = "./qdrant/"
    name = "test_collection"
    ollama_host = "http://localhost:11434"
    ollama_embedding_model = "bge-m3:567m"
    ollama_embedding_model_dim = 1024
    chunk_len = 2048
    chunk_overlap = 1024
    ollama_timeout = 60
    if check_ollama():
        if not check_model(ollama_embedding_model):
            if not try_pull_model(ollama_embedding_model):
                return False
        paths = paths.split()
        #client = chromadb.PersistentClient(path=save)
        #collection = chroma_db_collection(name, ollama_embedding_model_dim)
        client = QdrantLocal(save)
        try:
            http_client = httpx.AsyncClient(headers={'User-Agent': 'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Safari/537.36'})
            #print(client.heartbeat())
            if not qdrant_collection(client, name, ollama_embedding_model_dim, True):
                return False
            for path in tqdm(paths):
                points = []
                text_md = await html_to_md(http_client, path)
                texts = split_by_const(text_md, chunk_len, chunk_overlap)
                response = await ollama.AsyncClient(host=ollama_host, timeout=ollama_timeout).embed(
                    model=ollama_embedding_model,
                    input=texts
                )
                embs = response["embeddings"]
                for emb, text in zip(embs, texts):
                    points.append(PointStruct(id=uuid.uuid4().hex, vector=emb, payload={"text": text}))
                client.upsert(
                    collection_name=name,
                    points=points
                )
            return True
        except Exception as e:
            print(e)
        del client
    return False

@register("retriever")
async def default_retriever(query: str) -> List[Document]:
    """My retriever"""
    save = "./qdrant/"
    name = "test_collection"
    ollama_host = "http://localhost:11434"
    ollama_embedding_model = "bge-m3:567m"
    ollama_embedding_model_dim = 1024
    ollama_timeout = 60
    k = 1
    documents = []
    if check_ollama():
        if not check_model(ollama_embedding_model):
            if not try_pull_model(ollama_embedding_model):
                return []
        client = QdrantLocal(save)
        try:
            if not qdrant_collection(client, name, ollama_embedding_model_dim, True):
                return []
            response = await ollama.AsyncClient(host=ollama_host, timeout=ollama_timeout).embed(
                model=ollama_embedding_model,
                input=[query]
            )
            query_vector = response["embeddings"][0]
            top_k_results = client.search(
                collection_name=name,
                query_vector=query_vector,
                limit=k,
                with_payload=True,
            )
            for point in top_k_results:
                documents.append(Document(point.payload["text"]))
            return documents
        except Exception as e:
            print(e)
        del client
    return []

@register("augmenter")
async def default_augmenter(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return "По запросу '" + query + "' найдена следующая информация:\n" + "\n\n".join([d.utf8_content for d in documents])

@register("generator")
async def default_generator(query: str, tool_context: str) -> bool:
    """My generator"""
    #print(tool_context)
    model = 'gemma3:4b'
    messages = [
        {
            "role": "system",
            "content": (f"Ты — ассистент Alt Linux, отвечающий на запросы пользователя исходя из найденной информации."
                        f"\n{tool_context}")
        },
        # {
        #     "role": "tool",
        #     "content": tool_context
        # },
        {
            "role": "user",
            "content": query
        },
    ]
    if check_ollama():
        if not check_model(model):
            if not try_pull_model(model):
                return False
        await ollama_chat_completion(model, messages, seed=42)
        return True
    return False
