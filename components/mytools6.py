"""Module description preset"""

import time
from typing import List
from tqdm import tqdm
from utils.registry import register
from utils.document import Document


@register("generator")
def default_generator(query: str) -> bool:
    """My generator"""
    for token in query.split(" "):
        time.sleep(0.5)
        print(token)
    return True
