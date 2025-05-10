"""Пресет описания модуля"""

import time
from typing import List
from tqdm import tqdm
from utils.registry import register
from utils.document import Document


@register("augmenter")
def default_augmenter(query: str, documents: List[Document]) -> str:
    """My augmenter"""
    return query + " " + " ".join([d.utf8_content for d in documents])
