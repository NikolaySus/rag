"""Central registry and register decorator for function registration."""

import inspect

REGISTRY = {
    "indexer": dict(),
    "retriever": dict(),
    "augmenter": dict(),
    "generator": dict()
}

def register(category: str):
    """Add function to REGISTRY as name-linenumber pair"""
    def decorator(fn):
        # Use module and function name for uniqueness
        key = f"{fn.__module__}.{fn.__name__}"
        REGISTRY[category][key] = inspect.getsourcelines(fn)
        return fn
    return decorator
