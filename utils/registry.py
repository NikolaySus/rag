"""Central registry and register decorator for function registration."""

import inspect

REGISTRY = {
    "indexer": dict(),
    "retriever": dict(),
    "augmenter": dict(),
    "generator": dict()
}


def get_default_args(func):
    """Default component settings"""
    signature = inspect.signature(func)
    return {
        k: v.default
        for k, v in signature.parameters.items()
        if v.default is not inspect.Parameter.empty
    }


def register(category: str):
    """Add function to REGISTRY"""
    def decorator(fn):
        # Use module and function name for uniqueness
        key = f"{fn.__module__}.{fn.__name__}"
        REGISTRY[category][key] = list(inspect.getsourcelines(fn))
        REGISTRY[category][key].append(get_default_args(fn))
        return fn
    return decorator
