"""Some more tools"""

import importlib.util


async def exec_task(fn_dict: dict, indexer: bool, **kwargs):
    """code execution"""
    if indexer:
        result = await fn_dict["indexer"](kwargs.get("path", None))
    else:
        query = kwargs.get("query", None)
        retreived = await fn_dict["retriever"](query)
        augmented = await fn_dict["augmenter"](query, retreived)
        generated = await fn_dict["generator"](query, augmented)

def get_fn(path: str):
    """dynamic function import like from 'module.next.some_function' string"""
    parts = path.split("^.")
    count = len(parts) - 1
    remaining = parts[-1]
    path_parts = remaining.split(".")
    path = ".".join(path_parts[count:])  # colapse "^." parts
    module_name, fn = path.rsplit(".", 1)
    module_path = module_name.replace(".", "/") + ".py"
    module_spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return getattr(module, fn)
