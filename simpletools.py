"""My tools for RAG"""

import os
import sys
import time
import inspect
from typing import List
from tqdm import tqdm

from registry import register

# from example import example_indexer

# REGISTRY = {
#     "indexer": dict(),
#     "retriever": dict(),
#     "augmenter": dict(),
#     "generator": dict()
# }

# STACK = inspect.stack()

# def path_level_up(level):
#     """Add to sys path dir level levels upper than now"""
#     sys.path.append(os.path.dirname(os.path.abspath(__file__)).rsplit("/", level)[0])

# def import_path_find(stack):
#     """Get import path"""
#     files = [i.filename for i in stack if i.filename[-3:] == ".py"][:2]
#     pfx = os.path.commonprefix(files)
#     ans = [el[len(pfx):-3].split("/") for el in files]
#     ans = (len(ans[1]) - 1) * "^." + ".".join(ans[0])
#     return ans

# IMPORT_PATH = import_path_find(STACK) + "."

# def register(category: str):
#     """Add function to REGISTRY as name-linenumber pair"""
#     def decorator(fn):
#         REGISTRY[category][IMPORT_PATH + fn.__name__] = inspect.getsourcelines(fn)
#         return fn
#     return decorator

class Document:
    """Document or batch of document"""

    def __init__(self, utf8_content=None, metadata=None):
        self.utf8_content=utf8_content
        self.metadata=metadata

@register("indexer")
def simple_indexer(path: str) -> bool:
    """My indexer"""
    for _ in tqdm(range(10)):
        time.sleep(0.5)
    return True

@register("retriever")
def simple_retriever(query: str) -> List[Document]:
    """My retriever"""
    return [Document("lorem"), Document("ipsum"), Document(query)]

@register("augmenter")
def simple_augmenter(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return query + " " + " ".join([d.utf8_content for d in documents])

@register("generator")
def simple_generator(query: str) -> bool:
    """My generator"""
    for token in query.split(" "):
        time.sleep(0.5)
        print(token)
    return True

@register("indexer")
def simple_indexer_copy(path: str) -> bool:
    """My bad indexer"""
    for i in tqdm(range(10)):
        if i == 5:
            print(1/0)
        time.sleep(0.5)
    return True

@register("retriever")
def simple_retriever_copy(query: str) -> List[Document]:
    """My retriever"""
    return [Document("lorem"), Document("ipsum"), Document(query)]

@register("augmenter")
def simple_augmenter_copy(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return query + " " + " ".join([d.utf8_content for d in documents])

@register("generator")
def simple_generator_copy(query: str) -> bool:
    """My generator"""
    for token in query.split(" "):
        time.sleep(0.5)
        print(token)
    return True
