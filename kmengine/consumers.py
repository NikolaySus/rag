"""All magic goes here"""

import json
import asyncio
from typing import Any, Callable, List, Dict
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from jupyter_client import MultiKernelManager

from asgiref.sync import sync_to_async
from .models import Calculation, Config

class KernelCLI:
    """MultiKernelManager wrapper"""

    def __init__(self):
        self.km = MultiKernelManager()
        self.pipelines = dict()

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

    def run_pipeline(self, config_id: int, content_: str, indexer: str,
                     path_or_query: str, on_output: Callable[[str], None]) -> str:
        """
        Run pipeline in ipython kernel, call on_output with each output chunk.
        """
        if indexer == "true":
            larg = f"path='{path_or_query}'"
            indexer = "True"
        else:
            larg = f"query='{path_or_query}'"
            indexer = "False"
        code = f"""
code = {content_}
fn_dict = {{k: get_fn(v['path']) for k, v in code.items()}}
exec_task(fn_dict, {indexer}, {larg})
"""
        if config_id not in self.pipelines:
            kernel_id = self.km.start_kernel(kernel_name="python3")
            self.pipelines[config_id] = kernel_id
            code = "import tqdm_global_config\nfrom fnuser import get_fn, exec_task" + code
            on_output("Done some initial imports.\n")
        else:
            kernel_id = self.pipelines[config_id]

        ret = "ok"
        km = self.km.get_kernel(kernel_id)
        client = km.client()
        client.start_channels()
        client.wait_for_ready()

        msg_id = client.execute(code)
        while True:
            msg = client.get_iopub_msg(timeout=5)
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
                    err = "❌ Error:\n" + "\n".join(content["traceback"])
                    on_output(err)
                elif msg_type == "status" and content["execution_state"] == "idle":
                    break

        client.stop_channels()
        return ret

    def shutdown_all_kernels(self) -> None:
        """stop all ipython kernels"""
        self.pipelines = dict()
        for kernel_id in self.km.list_kernel_ids():
            self.km.shutdown_kernel(kernel_id, now=True)

    @staticmethod
    def list_configs() -> List[Dict[str, Any]]:
        """Return a list of all configs as dicts"""
        ret = list(Config.objects.all().values("id", "name", "type", "created_at", "updated_at"))
        for record in ret:
            record["created_at"] = str(record["created_at"])
            record["updated_at"] = str(record["updated_at"])
        return ret

    @staticmethod
    def delete_config(config_id: int) -> str:
        """Delete a config by id"""
        try:
            config = Config.objects.get(id=config_id)
            config.delete()
            return f"Config {config_id} deleted"
        except Config.DoesNotExist:
            return f"Config {config_id} does not exist"

    @staticmethod
    def get_config(config_id: int) -> Dict[str, Any]:
        """Get a config by id"""
        try:
            config = Config.objects.get(id=config_id)
            return {
                "id": config.id,
                "name": config.name,
                "type": config.type,
                "content": config.content,
                "created_at": str(config.created_at),
                "updated_at": str(config.updated_at),
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
        super().__init__(args, kwargs)
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
        }
        # Set of commands that are long-running and should be dispatched in background
        self.long_running_commands = {"run"}

    def gen_default(self):
        """Generate default config from first options in registry"""
        return {
            k: {"path": next(iter(self.registry[k])), "settings": dict()} for k in self.registry
        }
    
    def update_registry(self):
        """Update dict of options"""
        from simpletools import REGISTRY
        self.registry = REGISTRY
    
    async def connect(self) -> None:
        """for client on client connect"""
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
                                  "message": msg})
        else:
            await self.send_json({"status": "error",
                                  "message": "No config_id provided"})

    async def handle_run(self, args: List[Any]) -> None:
        """KernelCLI run_pipeline wrapper"""
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

        async def send_output(text):
            await self.send_json({"status": "output",
                                  "from": [config_id, calculation.id],
                                  "output": text})

        def on_output(text):
            asyncio.run_coroutine_threadsafe(send_output(text), loop)

        status = await loop.run_in_executor(
            None,
            self.cli.run_pipeline,
            config_id,
            content_, indexer, path_or_query,
            on_output
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
                              "deleted_id": config_id})

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
                                  "config": config})
        else:
            await self.send_json({"status": "error",
                                  "message": f"Config {config_id} does not exist"})
    
    async def handle_config_creation_info(self, args: List[Any]) -> None:
        """Send registry and default config for config creation UI"""
        self.update_registry()
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
        await self.send_json({"status": "ok", "updated_id": config_id})

    @sync_to_async
    def update_calculation_status(self, calc_id, status):
        """update calculation status"""
        Calculation.objects.filter(id=calc_id).update(status=status)
