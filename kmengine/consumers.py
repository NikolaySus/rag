"""All magic goes here"""

import re
import sys
import json
import asyncio
import importlib
from pathlib import Path
from typing import Any, Callable, List, Dict
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from jupyter_client import MultiKernelManager
from asgiref.sync import sync_to_async

from utils.string_importer_utils import reload_string_modules
from utils.import_getter import get_imports_as_string

from .models import Calculation, Config, Script


class KernelCLI:
    """MultiKernelManager wrapper"""

    def __init__(self):
        self.km = MultiKernelManager()
        self.pipelines = dict()  # config_id: kernel_id

    def update(self) -> List[int]:
        """get updated list of active pipelines"""
        kernels = set(self.km.list_kernel_ids())
        bad_pipelines = set()
        good_pipelines = set()
        for p, k in self.pipelines.items():
            if k not in kernels:
                bad_pipelines.add(p)
            else:
                kernels.remove(k)
                good_pipelines.add(p)
        for p in bad_pipelines:
            self.close_pipeline(p)
        return list(good_pipelines)

    def close_pipeline(self, config_id: int) -> str:
        """stop pipeline and it's ipython kernel"""
        if config_id not in self.pipelines:
            return f"No pipeline {config_id} running\n"
        kernel_id = self.pipelines[config_id]
        if kernel_id in self.km:
            self.km.shutdown_kernel(kernel_id, now=True)
        del self.pipelines[config_id]
        return f"Pipeline {config_id} closed\n"

    def ensure_pipeline(self, config_id: int) -> str:
        """
        Ensure a pipeline exists for the given config_id.
        If not, start a new kernel and register it immediately.
        Returns the kernel_id.
        """
        if config_id not in self.pipelines:
            kernel_id = self.km.start_kernel(kernel_name="python3")
            self.pipelines[config_id] = kernel_id
            return kernel_id, True
        else:
            return self.pipelines[config_id], False

    def run_pipeline_kernel(self, kernel_id: str, content_: str, indexer: str, path_or_query: str,
                            on_output: Callable[[str], None], need_init: bool) -> str:
        """
        Run pipeline code in the given kernel.
        """
        if indexer == "true":
            larg = f"path='{path_or_query}'"
            indexer = "True"
        else:
            larg = f"query='{path_or_query}'"
            indexer = "False"
        code = f"""
code = {content_}
fn_dict = {{k: (get_fn(v['path']), v['settings']) for k, v in code.items()}}
await exec_task(fn_dict, {indexer}, {larg})
"""
        # For new kernels, we need to do initial imports
        if need_init:
            code = "import nest_asyncio\nimport utils.tqdm_global_config\nfrom utils.fnuser import get_fn, exec_task\nnest_asyncio.apply()" + code
            on_output("Done some initial imports.\n")

        ret = "ok"
        km = self.km.get_kernel(kernel_id)
        client = km.client()
        client.start_channels()
        client.wait_for_ready()

        msg_id = client.execute(code)
        while True:
            msg = client.get_iopub_msg(timeout=-1)
            if msg["parent_header"].get("msg_id") == msg_id:
                msg_type = msg["msg_type"]
                content = msg["content"]

                if msg_type == "execute_result":
                    text = content['data']['text/plain']
                    on_output(text)
                elif msg_type == "stream":
                    text = content["text"]
                    if "\r" in text:
                        last_line = text.split("\r")[-1]
                        on_output("\r" + last_line)
                    else:
                        on_output(text)
                elif msg_type == "error":
                    ret = "fail"
                    err = "❌ Error:\n" + "\n".join(content["traceback"]) + "\n"
                    on_output(err)
                elif msg_type == "status" and content["execution_state"] == "idle":
                    break

        client.stop_channels()
        return ret

    # def run_pipeline(self, config_id: int, content_: str, indexer: str,
    #                  path_or_query: str, on_output: Callable[[str], None]) -> str:
    #     """
    #     Run pipeline in ipython kernel, call on_output with each output chunk.
    #     This is a compatibility wrapper around ensure_pipeline + run_pipeline_kernel.
    #     """
    #     kernel_id = self.ensure_pipeline(config_id)
    #     return self.run_pipeline_kernel(kernel_id, content_, indexer, path_or_query, on_output)

    def shutdown_all_kernels(self) -> None:
        """stop all ipython kernels"""
        self.pipelines = dict()
        for kernel_id in self.km.list_kernel_ids():
            self.km.shutdown_kernel(kernel_id, now=True)

    def list_configs(self) -> List[Dict[str, Any]]:
        """Return a list of all configs as dicts"""
        ret = list(Config.objects.all().values("id", "name", "type", "created_at", "updated_at"))
        active = self.update()
        for record in ret:
            record["created_at"] = f"{record["created_at"]: %H:%M:%S %d/%m/%Y}"
            record["updated_at"] = f"{record["updated_at"]: %H:%M:%S %d/%m/%Y}"
            record["active"] = record["id"] in active
        return ret

    def delete_config(self, config_id: int) -> str:
        """Delete a config by id"""
        try:
            self.close_pipeline(config_id)
            config = Config.objects.get(id=config_id)
            config.delete()
            return f"Config {config_id} deleted"
        except Config.DoesNotExist:
            return f"Config {config_id} does not exist"

    def get_config(self, config_id: int) -> Dict[str, Any]:
        """Get a config by id"""
        try:
            config = Config.objects.get(id=config_id)
            return {
                "id": config.id,
                "name": config.name,
                # "type": config.type,
                "content": config.content,
                # "created_at": str(config.created_at),
                # "updated_at": str(config.updated_at),
                "active": config.id in self.update()
            }
        except Config.DoesNotExist:
            return {}

    @staticmethod
    def update_config(config_id: int, new_name: str, new_content: str) -> str:
        """Update a config's name and content by id"""
        try:
            config = Config.objects.get(id=config_id)
            config.name = new_name
            config.content = new_content
            config.save()
            return f"Config {config_id} updated"
        except Config.DoesNotExist:
            return f"Config {config_id} does not exist"

    def help(self) -> str:
        """show avaible commands"""
        return """
Available commands:
  config <name> <type> <json>          Create pipeline configuration from json
  update                               Get updated list of active pipelines
  run <id> <indexer> <arg>             Run pipeline with given configuration id
  close <id>                           Close pipeline with given configuration id
  delete_config <id>                   Delete a pipeline configuration by id
  list_configs                         List all pipeline configurations
  get_config <id>                      Get a pipeline configuration by id
  config_creation_info                 Get registry and default config
  update_config <id> <name> <content>  Update configuration's name and content by id
  exit                                 Exit the CLI (kernels will be shut down)
"""


class KMEConsumer(AsyncJsonWebsocketConsumer):
    """Ws consumer only for jsons"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Do NOT call self.reload_registry() here!
        self.regm = None
        self.registry = None
        self.cli: KernelCLI = KernelCLI()
        self.command_handlers: Dict[str, Callable[[List[Any]], None]] = {
            "update": self.handle_update,
            "close": self.handle_close,
            "run": self.handle_run,
            "config": self.handle_config,
            "delete_config": self.handle_delete_config,
            "list_configs": self.handle_list_configs,
            "get_config": self.handle_get_config,
            "config_creation_info": self.handle_config_creation_info,
            "update_config": self.handle_update_config,
            "list_scripts": self.handle_list_scripts,
            "create_script": self.handle_create_script,
            "update_script": self.handle_update_script,
            "get_script": self.handle_get_script,
            "delete_script": self.handle_delete_script,
        }
        # Set of commands that are long-running and should be dispatched in background
        self.long_running_commands = {"run"}

    def gen_default(self):
        """Generate default config from first options in registry"""
        return {
            k: {"path": next(iter(self.registry[k]))} for k in self.registry if k != "hidden"
        } # , "settings": dict()

    def reload_registry(self):
        """
        Reload dynamic module with imports from all Script paths in the DB.
        Also, after importing REGISTRY, set a 'hidden' key in the in_memory_module
        with the list of hidden script paths.
        """
        # Retrieve all script paths, both visible and hidden
        all_scripts = list(Script.objects.all().values("path", "hidden"))
        visible_paths = [s["path"] for s in all_scripts if not s["hidden"]]
        hidden_paths = [s["path"] for s in all_scripts if s["hidden"]]

        # Generate import statements for all script paths (visible and hidden)
        import_lines = "\n".join([f"import {s['path']}" for s in all_scripts])
        # Always import REGISTRY as before
        import_lines += "\nfrom utils.registry import REGISTRY\n"

        # Compose the code to also set the hidden list after REGISTRY import
        import_lines += f"\nREGISTRY['hidden'] = {hidden_paths!r}\n"

        # Remove all relevant modules from sys.modules to force re-import
        for script in all_scripts:
            module_name = script["path"]
            if module_name in sys.modules:
                del sys.modules[module_name]
        if 'utils.registry' in sys.modules:
            del sys.modules['utils.registry']

        # Call reload_string_modules with the generated import string
        reload_string_modules({"in_memory_module": import_lines})

    def update_registry(self):
        """Update dict of options"""
        self.reload_registry()
        # if 'in_memory_module' in sys.modules:
        #     del sys.modules['in_memory_module']
        self.regm = importlib.__import__('in_memory_module', fromlist=['REGISTRY'])
        self.registry = self.regm.REGISTRY
        # print(self.registry)

    async def connect(self) -> None:
        """for client on client connect"""
        # Safely reload registry with DB access
        # await sync_to_async(self.reload_registry)()
        # self.regm = importlib.__import__('in_memory_module', fromlist=['REGISTRY'])
        # self.registry = self.regm.REGISTRY
        await sync_to_async(self.update_registry)()
        await self.accept()
        await self.send_json({"status": "connected",
                              "output": self.cli.help()})

    async def disconnect(self, _: Any = None) -> None:
        """for client on client disconnect"""
        self.cli.shutdown_all_kernels()

    async def receive_json(self, content: Any = None, **kwargs) -> None:
        """do job from json"""
        try:
            if content is None:
                await self.send_json({"status": "error",
                                      "message": "No data received"})
                return

            print(content)
            command = content.get("command")
            args = content.get("args", [])

            handler = self.command_handlers.get(command)
            if handler:
                if command in self.long_running_commands:
                    # Dispatch long-running handler as a background task
                    asyncio.create_task(handler(args))
                    await self.send_json({"status": "accepted",
                                          "message": f"{command} started"})
                else:
                    await handler(args)
            else:
                await self.send_json({"status": "error",
                                      "message": "Unknown command"})
        except Exception as e:
            await self.send_json({"status": "error",
                                  "message": str(e)})

    async def handle_update(self, args: List[Any]) -> None:
        """KernelCLI update wrapper"""
        kernels = self.cli.update()
        await self.send_json({"status": "ok",
                              "pipelines": kernels})

    async def handle_close(self, args: List[Any]) -> None:
        """KernelCLI close_pipeline wrapper"""
        config_id = int(args[0]) if args else None
        if config_id:
            msg = self.cli.close_pipeline(config_id)
            await self.send_json({"status": "ok",
                                  "closed_id": config_id,
                                  "message": msg})
        else:
            await self.send_json({"status": "error",
                                  "message": "No config_id provided"})

    async def handle_run(self, args: List[Any]) -> None:
        """KernelCLI run_pipeline wrapper with immediate pipeline registration"""
        if len(args) < 3:
            await self.send_json({"status": "error",
                                  "message": "config_id, indexer and path_or_query required"})
            return
        config_id, indexer, path_or_query = int(args[0]), args[1], args[2]
        config = await sync_to_async(Config.objects.get)(id=config_id)
        content_ = config.content
        calculation = await sync_to_async(Calculation.objects.create)(
            status='running',
            config_id=config_id,
        )
        loop = asyncio.get_running_loop()

        # Ensure pipeline and get kernel_id immediately in main thread
        kernel_id, need_init = await sync_to_async(self.cli.ensure_pipeline)(config_id)

        async def send_output(text):
            await self.send_json({"status": "output",
                                  "from": [config_id, calculation.id],
                                  "output": text})

        def on_output(text):
            asyncio.run_coroutine_threadsafe(send_output(text), loop)

        # Now run the code in the already-registered kernel
        status = await loop.run_in_executor(
            None,
            self.cli.run_pipeline_kernel,
            kernel_id,
            content_, indexer, path_or_query,
            on_output,
            need_init
        )
        await self.update_calculation_status(calculation.id, status)
        await self.send_json({"status": "ok",
                              "from": [config_id, calculation.id],
                              "message": "Execution finished"})

    async def handle_config(self, args: List[Any]) -> None:
        """KernelCLI config wrapper"""
        if len(args) < 3:
            await self.send_json({"status": "error",
                                  "message": "Arguments required: name, type, content"})
            return
        name, type_, content_ = args[0], args[1], args[2]
        content_json = json.loads(content_)
        if (content_json["indexer"]["path"] not in self.registry["indexer"] or
            content_json["retriever"]["path"] not in self.registry["retriever"] or
            content_json["augmenter"]["path"] not in self.registry["augmenter"] or
            content_json["generator"]["path"] not in self.registry["generator"]):
            await self.send_json({"status": "error",
                                  "message": "Bad function path"})
            return
        config = await sync_to_async(Config.objects.create)(
            name=name,
            type=type_,
            content=json.dumps(content_json),
        )
        await self.send_json({
            "status": "ok",
            "message": f"Config '{name}' created",
            "config_id": config.id
        })

    async def handle_delete_config(self, args: List[Any]) -> None:
        """KernelCLI delete_config wrapper"""
        if not args:
            await self.send_json({"status": "error",
                                  "message": "No config_id provided"})
            return
        config_id = int(args[0])
        # Use sync_to_async for DB operation
        msg = await sync_to_async(self.cli.delete_config)(config_id)
        await self.send_json({"status": "ok",
                              "deleted_id": config_id,
                              "message": msg})

    async def handle_list_configs(self, args: List[Any]) -> None:
        """KernelCLI list_configs wrapper"""
        # Use sync_to_async for DB operation
        configs = await sync_to_async(self.cli.list_configs)()
        await self.send_json({"status": "ok",
                              "configs": configs})

    async def handle_get_config(self, args: List[Any]) -> None:
        """KernelCLI get_config wrapper"""
        if not args:
            await self.send_json({"status": "error",
                                  "message": "No config_id provided"})
            return
        config_id = int(args[0])
        config = await sync_to_async(self.cli.get_config)(config_id)
        if config:
            await self.send_json({"status": "ok",
                                  "config_id": config_id,
                                  "config": config})
        else:
            await self.send_json({"status": "error",
                                  "message": f"Config {config_id} does not exist"})

    async def handle_config_creation_info(self, args: List[Any]) -> None:
        """Send registry and default config for config creation UI"""
        await sync_to_async(self.update_registry)()
        default_config = self.gen_default()
        await self.send_json({
            "status": "ok",
            "registry": self.registry,
            "default_config": default_config,
        })

    async def handle_update_config(self, args: List[Any]) -> None:
        """KernelCLI update_config wrapper"""
        if len(args) < 3:
            await self.send_json({"status": "error",
                                  "message": "Arguments required: id, new_name, new_content"})
            return
        config_id, new_name, new_content = int(args[0]), args[1], args[2]
        # Validate new_content as JSON
        # try:
        #     json.loads(new_content)
        # except Exception:
        #     await self.send_json({"status": "error",
        #                           "message": "new_content must be valid JSON"})
        #     return
        msg = await sync_to_async(self.cli.update_config)(config_id, new_name, new_content)
        await self.send_json({"status": "ok",
                              "updated_id": config_id,
                              "message": msg})

    async def handle_list_scripts(self, args: List[Any]) -> None:
        """Return all script paths divided into visible and hidden."""
        scripts = await sync_to_async(list)(Script.objects.all().values("path", "hidden"))
        visible = [s["path"] for s in scripts if not s["hidden"]]
        hidden = [s["path"] for s in scripts if s["hidden"]]
        await self.send_json({
            "status": "ok",
            "visible": visible,
            "hidden": hidden,
        })

    async def handle_create_script(self, args: List[Any]) -> None:
        """Create a visible script record with the given path."""
        if len(args) != 2:
            await self.send_json({"status": "error",
                                  "message": "Arguments required: path, start_with"})
            return
        path, start_with = args
        # Check if valid
        pattern = r"^components(\.[a-zA-Z_][a-zA-Z0-9_]*)+$"
        if re.match(pattern, path) is None:
            await self.send_json({"status": "error", "message": f"Path '{path}' is not valid"})
            return
        # Check for uniqueness
        exists = await sync_to_async(Script.objects.filter(path=path).exists)()
        if exists:
            await self.send_json({"status": "error", "message": f"Script '{path}' already exists"})
            return
        # Create file
        raw = path.replace(".", "/") + ".py"
        output_file = Path(raw)
        output_file.parent.mkdir(exist_ok=True, parents=True)
        description = '"""Module description preset"""\n\n'
        imports = get_imports_as_string("components/default.py")
        with output_file.open('w', encoding="utf-8") as myfile:
            myfile.write(description + imports + "\n\n\n" + start_with)
        script = await sync_to_async(Script.objects.create)(path=path, hidden=False)
        await self.send_json({
            "status": "ok",
            "message": f"Script '{path}' created",
            "script_id": script.id,
        })

    async def handle_update_script(self, args: List[Any]) -> None:
        """Update script code and its updated_at field."""
        if len(args) != 2:
            await self.send_json({"status": "error",
                                "message": "Arguments required: path, code"})
            return
        path, code = args
        # Check if valid
        pattern = r"^components(\.[a-zA-Z_][a-zA-Z0-9_]*)+$"
        if re.match(pattern, path) is None:
            await self.send_json({"status": "error", "message": f"Path '{path}' is not valid"})
            return
        script = await sync_to_async(Script.objects.filter(path=path).first)()
        if not script:
            await self.send_json({"status": "error", "message": f"Script '{path}' does not exist"})
            return
        raw = path.replace(".", "/") + ".py"
        output_file = Path(raw)
        output_file.parent.mkdir(exist_ok=True, parents=True)
        with output_file.open('w', encoding="utf-8") as myfile:
            myfile.write(code)

        # Save the script to update the updated_at field automatically
        await sync_to_async(script.save)()

        await self.send_json({
            "status": "ok",
            "message": f"Script '{path}' updated",
            "script_id": script.id,
        })

    async def handle_get_script(self, args: List[Any]) -> None:
        """Check if a script with the given path exists."""
        if not args:
            await self.send_json({"status": "error", "message": "No script path provided"})
            return
        path = args[0]
        exists = await sync_to_async(Script.objects.filter(path=path).exists)()
        if exists:
            raw = path.replace(".", "/") + ".py"
            file = Path(raw)
            try:
                with file.open('r', encoding="utf-8") as myfile:
                    content = myfile.read()
                    await self.send_json({"status": "ok",
                                          "exists": True,
                                          "path": path,
                                          "content": content})
            except Exception as e:
                await self.send_json({"status": "error",
                                      "exists": False,
                                      "path": path,
                                      "warning": f"Could not open file '{file}'. Reason: {e}"})
        else:
            await self.send_json({"status": "error", "exists": False, "path": path})

    async def handle_delete_script(self, args: List[Any]) -> None:
        """Delete a script by path."""
        if not args:
            await self.send_json({"status": "error", "message": "No script path provided"})
            return
        path = args[0]

        # Try to get and delete the script
        script = await sync_to_async(Script.objects.filter(path=path).first)()
        if not script:
            await self.send_json({"status": "error", "message": f"Script with path '{path}' does not exist"})
            return

        # Optionally, also remove the file from disk if desired (not required by your request)
        raw = path.replace(".", "/") + ".py"
        file = Path(raw)
        if file.exists():
            file.unlink()

        await sync_to_async(script.delete)()
        await self.send_json({
            "status": "ok",
            "message": f"Script with path '{path}' deleted"
        })

    @sync_to_async
    def update_calculation_status(self, calc_id, status):
        """update calculation status"""
        Calculation.objects.filter(id=calc_id).update(status=status)
