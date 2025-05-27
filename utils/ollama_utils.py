"""Ollama utils"""

from typing import List
import ollama


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


def ollama_model(model: str) -> bool:
    """True if successful model access"""
    if check_ollama():
        if not check_model(model):
            print("Trying to pull...")
            if not try_pull_model(model):
                return False
        return True
    return False


async def ollama_chat_completion(ollama_host: str, model: str, messages, temperature=None, seed=None, num_ctx=None):
    """Async streaming example"""
    options = dict()
    if temperature is not None:
        options["temperature"] = temperature
    if seed is not None:
        options["seed"] = seed
    if num_ctx is not None:
        options["num_ctx"] = num_ctx
    async for part in await ollama.AsyncClient(host=ollama_host).chat(model=model, messages=messages, options=options, stream=True):
        print(part['message']['content'], end='', flush=True)
    print("")


async def ollama_embed(ollama_host: str, ollama_timeout, ollama_embedding_model: str, texts: List[str]):
    """Async embedding example"""
    return await ollama.AsyncClient(
        host=ollama_host, timeout=ollama_timeout).embed(
            model=ollama_embedding_model, input=texts)
