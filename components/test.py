"""Module description preset"""

import time
from typing import List
from tqdm import tqdm
from utils.registry import register
from utils.document import Document


@register("indexer")
def test_indexer(path: str) -> bool:
    """My indexer"""
    for _ in tqdm(range(10)):
        time.sleep(0.5)
    return True
