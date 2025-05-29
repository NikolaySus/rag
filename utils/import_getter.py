"""Get imports from file"""

import ast
from collections import namedtuple

Import = namedtuple("Import", ["module", "name", "alias"])

def get_imports(path):
    """Get imports from file"""
    with open(path, encoding="utf-8") as fh:
        root = ast.parse(fh.read(), path)

    for node in ast.iter_child_nodes(root):
        if isinstance(node, ast.Import):
            module = []
        elif isinstance(node, ast.ImportFrom):
            module = node.module.split('.')
        else:
            continue

        for n in node.names:
            yield Import(module, n.name.split('.'), n.asname)

def get_imports_as_string(path):
    """Get imports from file as a single string"""
    lines = []
    for imp in get_imports(path):
        module_path = ".".join(imp.module)
        name_path = ".".join(imp.name)

        if module_path:  # This was a 'from ... import ...'
            line = f"from {module_path} import {name_path}"
        else:  # This was an 'import ...'
            line = f"import {name_path}"

        if imp.alias:
            line += f" as {imp.alias}"

        lines.append(line)

    return "\n".join(lines)
