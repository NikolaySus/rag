"""Just split string into more strings"""

from typing import List


def split_by_const(text: str, max_len: int, overlap_len: int) -> List[str]:
    """Split string into strings"""
    end = len(text)
    if max_len >= end:
        return [text]
    if overlap_len >= max_len:
        raise Exception("overlap_len must be less than max_len")
    res = []
    start = 0
    while start < len(text):
        end = min(start + max_len, len(text))
        res.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap_len
    return res
