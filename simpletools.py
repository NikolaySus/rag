"""My tools for RAG"""
import time
from typing import List
from tqdm import tqdm


class Document:
    """Document or batch of document"""

    def __init__(self, utf8_content=None, metadata=None):
        self.utf8_content=utf8_content
        self.metadata=metadata

def simple_indexer(path: str) -> bool:
    """My indexer"""
    for _ in tqdm(range(10)):
        time.sleep(0.5)
    return True

def simple_retreiver(query: str) -> List[Document]:
    """My retreiver"""
    return [Document("lorem"), Document("ipsum"), Document(query)]

def simple_augmenter(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return query + " " + " ".join([d.utf8_content for d in documents])

def simple_generator(query: str) -> bool:
    """My generator"""
    for token in query.split(" "):
        time.sleep(0.5)
        print(token)
    return True
