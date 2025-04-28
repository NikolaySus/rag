"""All magic goes here"""

import asyncio
import sys
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from jupyter_client import MultiKernelManager

from asgiref.sync import sync_to_async
from .models import Calculation, Config


class KernelCLI:
    """MultiKernelManager wrapper"""

    def __init__(self):
        self.km = MultiKernelManager()
        self.pipelines = dict()
        # print("[✔] MultiKernelManager created")

    def create_kernel(self):
        """start ipython kernel"""
        kernel_id = self.km.start_kernel(kernel_name="python3")
        # print(f"[✔] Kernel created with ID: {kernel_id}")
        return kernel_id

    def list_active(self):
        """list active pipelines"""
        kernels = self.km.list_kernel_ids()
        # print("📚 Running Kernels:")
        # for kid in kernels:
        #     print(f" - {kid}")
        return list(kernels)

    # def delete_kernel(self, kernel_id):
    #     """stop ipython kernel"""
    #     if kernel_id in self.km:
    #         self.km.shutdown_kernel(kernel_id, now=True)
    #         print(f"[✖] Kernel {kernel_id} shut down.")
    #     else:
    #         print(f"[!] Kernel {kernel_id} not found or already shut down.")

    def execute_code(self, config_id, content_, indexer, path_or_query, on_output=None):
        """
        Run code in ipython kernel.
        If on_output is provided, call it with each output chunk.
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
        # if kernel_id not in self.km:
        #     msg = f"[!] Kernel {kernel_id} not found."
        #     if on_output:
        #         on_output(msg)
        #     # else:
        #     #     print(msg)
        #     return "fail"
        if config_id not in self.pipelines:
            kernel_id = self.create_kernel()
            self.pipelines[config_id] = kernel_id
            code = "from fnuser import get_fn, exec_task" + code
            if on_output:
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
                    if on_output:
                        on_output(text)
                    # else:
                    #     print(text)
                elif msg_type == "stream":
                    text = content["text"]
                    if "\r" in text:
                        last_line = text.split("\r")[-1]
                        if on_output:
                            on_output("\r" + last_line)
                        # else:
                        #     sys.stdout.write("\r" + last_line)
                        #     sys.stdout.flush()
                    else:
                        if on_output:
                            on_output(text)
                        # else:
                        #     print(text, end="")
                elif msg_type == "error":
                    ret = "fail"
                    err = "❌ Error:\n" + "\n".join(content["traceback"])
                    if on_output:
                        on_output(err)
                    # else:
                    #     print(err)
                elif msg_type == "status" and content["execution_state"] == "idle":
                    break

        client.stop_channels()
        return ret

    def shutdown_all_kernels(self):
        """stop all ipython kernels"""
        # print("👋 Shutting down all kernels...")
        self.pipelines = dict()
        for kernel_id in self.km.list_kernel_ids():
            self.km.shutdown_kernel(kernel_id, now=True)
            # print(f"[✖] Kernel {kernel_id} shut down.")
        # print("✅ Exit complete.")

    def help(self):
        """show avaible commands"""
        return """
Available commands:
  config <name> <type> <path>  Create pipeline configuration from json file
  create                       Create a new IPython kernel
  list                         List running kernels
  exec <id> <indexer> <arg>    Run pipeline with given configuration id
  delete <id>                  Delete a kernel
  exit                         Exit the CLI (all kernels will be shut down)
"""


class KMEConsumer(AsyncJsonWebsocketConsumer):
    """Ws consumer only for jsons"""

    async def connect(self):
        """for client on client connect"""
        self.cli = KernelCLI()
        await self.accept()
        await self.send_json({"status": "connected", "output": self.cli.help()})

    async def disconnect(self, _):
        self.cli.shutdown_all_kernels()

    async def receive_json(self, content=None, **kwargs) -> None:
        """do job from json"""
        try:
            if content is None:
                await self.send_json({"status": "error", "message": "No data received"})
                return

            command = content.get("command")
            args = content.get("args", [])

            if command == "create":
                kernel_id = self.cli.create_kernel()
                await self.send_json({"status": "ok", "kernel_id": kernel_id})
            elif command == "list":
                kernels = self.cli.list_active()
                await self.send_json({"status": "ok", "kernels": kernels})
            # elif command == "delete":
            #     kernel_id = args[0] if args else None
            #     if kernel_id:
            #         self.cli.delete_kernel(kernel_id)
            #         await self.send_json({"status": "ok", "message": f"Kernel {kernel_id} deleted"})
            #     else:
            #         await self.send_json({"status": "error", "message": "No kernel_id provided"})
            elif command == "exec":
                # kernel_id = args[0] if len(args) > 0 else None
                config_id = int(args[0]) if len(args) > 0 else None
                indexer = args[1] if len(args) > 1 else None
                path_or_query =  args[2] if len(args) > 2 else None
                if config_id and indexer and path_or_query:
                    config = await sync_to_async(Config.objects.get)(id=config_id)
                    content_ = config.content
                    calculation = await sync_to_async(Calculation.objects.create)(
                        status='running',
                        config_id=config_id,
                    )

                    loop = asyncio.get_running_loop()

                    async def send_output(text):
                        await self.send_json({"status": "output", "output": text})

                    def on_output(text):
                        asyncio.run_coroutine_threadsafe(send_output(text), loop)

                    status = await loop.run_in_executor(
                        None,
                        self.cli.execute_code,
                        config_id,
                        content_, indexer, path_or_query,
                        on_output
                    )

                    await self.update_calculation_status(calculation.id, status)

                    await self.send_json({"status": "ok", "message": "Execution finished"})
                else:
                    await self.send_json({"status": "error", "message": "config_id, indexer and path_or_query required"})
            elif command == "config":
                if len(args) < 3:
                    await self.send_json({"status": "error", "message": "Arguments required: name, type, content"})
                    return
                name, type_, content_ = args[0], args[1], args[2]
                try:
                    config = await sync_to_async(Config.objects.create)(
                        name=name,
                        type=type_,
                        content=content_,
                    )
                    await self.send_json({
                        "status": "ok",
                        "message": f"Config '{name}' created",
                        "config_id": config.id
                    })
                except Exception as e:
                    await self.send_json({"status": "error", "message": f"Failed to create config: {str(e)}"})
            else:
                await self.send_json({"status": "error", "message": "Unknown command"})
        except Exception as e:
            await self.send_json({"status": "error", "message": str(e)})
    
    @sync_to_async
    def update_calculation_status(self, calc_id, status):
        Calculation.objects.filter(id=calc_id).update(status=status)
