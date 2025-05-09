import time
from typing import List
from tqdm import tqdm
from simpletools import register

@register("indexer")
def example_indexer(path: str) -> bool:
    """My indexer"""
    for _ in tqdm(range(10)):
        time.sleep(0.5)
    return True
