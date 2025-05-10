"""Default components for RAG"""

import time
from typing import List
from tqdm import tqdm
from utils.registry import register
from utils.document import Document

@register("indexer")
def default_indexer(path: str) -> bool:
    """My indexer"""
    for _ in tqdm(range(10)):
        time.sleep(0.5)
    return True

@register("retriever")
def default_retriever(query: str) -> List[Document]:
    """My retriever"""
    return [Document("lorem"), Document("ipsum"), Document(query)]

@register("augmenter")
def default_augmenter(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return query + " " + " ".join([d.utf8_content for d in documents])

@register("generator")
def default_generator(query: str) -> bool:
    """My generator"""
    for token in query.split(" "):
        time.sleep(0.5)
        print(token)
    return True
