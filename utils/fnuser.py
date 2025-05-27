"""Some more tools"""

import importlib.util


async def exec_task(fn_dict: dict, indexer: bool, **kwargs):
    """code execution"""
    if indexer:
        result = await fn_dict["indexer"][0](kwargs.get("path", None), **fn_dict["indexer"][1])
    else:
        query = kwargs.get("query", None)
        retreived = await fn_dict["retriever"][0](query, **fn_dict["retriever"][1])
        augmented = await fn_dict["augmenter"][0](query, retreived, **fn_dict["augmenter"][1])
        generated = await fn_dict["generator"][0](query, augmented, **fn_dict["generator"][1])

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
