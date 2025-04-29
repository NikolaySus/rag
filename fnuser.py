"""Really cursed shit"""

import importlib.util
# from simpletools import DEFAULT_PIPELINE


def exec_task(fn_dict: dict, indexer: bool, **kwargs):
    """code execution"""
    if indexer:
        fn_dict["indexer"](kwargs.get("path", None))
    else:
        query = kwargs.get("query", None)
        fn_dict["generator"](fn_dict["augmenter"](query, fn_dict["retreiver"](query)))

def get_fn(path: str):
    """dynamic function import like from 'module.next.some_function' string"""
    module_name, fn = path.rsplit(".", 1)
    module_path = module_name.replace(".", "/") + ".py"
    module_spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return getattr(module, fn)

# fn_dict = {k: get_fn(v['path']) for k, v in DEFAULT_PIPELINE.items()}

# PATH = "2ip.ru"
# QUERY = "test"

# exec_task(fn_dict, True, path=PATH)
# exec_task(fn_dict, False, query=QUERY)
