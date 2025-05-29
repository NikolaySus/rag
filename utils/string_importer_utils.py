import sys
from typing import Dict, Any
from importlib.abc import Loader, MetaPathFinder
from importlib.machinery import ModuleSpec
from importlib.util import spec_from_file_location
from types import ModuleType

class StringImporter(MetaPathFinder):

    class Loader(Loader):
        def __init__(self, modules: dict[str, str | dict]) -> None:
            self._modules: dict[str, str | dict] = modules

        # noinspection PyMethodMayBeStatic
        def is_package(self, module_name: str) -> bool:
            return isinstance(self._modules[module_name], dict)

        # noinspection PyMethodMayBeStatic
        def get_code(self, module_name: str):
            return compile(self._modules[module_name], filename="<string>", mode="exec")

        def create_module(self, spec: ModuleSpec) -> ModuleType | None:
            return ModuleType(spec.name)

        def exec_module(self, module: ModuleType) -> None:
            if module.__name__ not in self._modules:
                raise ImportError(module.__name__)

            sys.modules[module.__name__] = module
            if not self.is_package(module.__name__):
                exec(self._modules[module.__name__], module.__dict__)
            else:
                for sub_module in self._modules[module.__name__]:
                    self._modules[".".join((module.__name__, sub_module))] = self._modules[module.__name__][
                        sub_module
                    ]
                exec(self._modules[module.__name__].get("__init__", ""), module.__dict__)

    def __init__(self, **modules: str | dict) -> None:
        self._modules: dict[str, str | dict] = modules
        self._loader = StringImporter.Loader(modules)

    def find_spec(
            self,
            fullname: str,
            path: "str | None",
            target: "ModuleType | None" = None,
    ) -> "ModuleSpec | None":
        if fullname in self._modules:
            spec: ModuleSpec = spec_from_file_location(fullname, loader=self._loader)
            spec.origin = "<string>"
            return spec
        return None


def reload_string_modules(modules: Dict[str, str | dict], importer_class=StringImporter):
    """
    Remove relevant modules from sys.modules, update the StringImporter in sys.meta_path,
    and ensure new code is used for subsequent imports.
    """
    # Remove modules and submodules from sys.modules
    def collect_module_names(mods: Dict[str, Any], prefix=""):
        names = []
        for k, v in mods.items():
            full_name = f"{prefix}.{k}" if prefix else k
            names.append(full_name)
            if isinstance(v, dict):
                # It's a package, collect submodules
                for subk in v:
                    if subk != "__init__":
                        names.extend(collect_module_names({subk: v[subk]}, prefix=full_name))
        return names

    module_names = collect_module_names(modules)
    for name in module_names:
        if name in sys.modules:
            del sys.modules[name]

    # Remove any previous StringImporter for these modules from sys.meta_path
    sys.meta_path = [
        finder for finder in sys.meta_path
        if not (isinstance(finder, importer_class) and
                any(name in finder._modules for name in module_names))
    ]

    # Add new StringImporter
    sys.meta_path.append(importer_class(**modules))
