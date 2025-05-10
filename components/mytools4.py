import time
from typing import List
from tqdm import tqdm
from utils.registry import register
from utils.document import Document


@register("retriever")
def default_retriever(query: str) -> List[Document]:
    """My retriever"""
    return [Document("lorem"), Document("ipsum"), Document(query)]
