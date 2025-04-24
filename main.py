import sys
from datetime import datetime
from jupyter_client import MultiKernelManager


class KernelCLI:
    def __init__(self):
        self.km = MultiKernelManager()

    def create_kernel(self):
        kernel_id = self.km.start_kernel(kernel_name="python3")
        print(f"[✔] Kernel created with ID: {kernel_id}")
        return kernel_id

    def list_kernels(self):
        kernels = self.km.list_kernel_ids()
        print("📚 Running Kernels:")
        for kid in kernels:
            print(f" - {kid}")
        return list(kernels)

    def delete_kernel(self, kernel_id):
        if kernel_id in self.km:
            self.km.shutdown_kernel(kernel_id, now=True)
            print(f"[✖] Kernel {kernel_id} shut down.")
        else:
            print(f"[!] Kernel {kernel_id} not found or already shut down.")

    def execute_code(self, kernel_id, code):
        if kernel_id not in self.km:
            print(f"[!] Kernel {kernel_id} not found.")
            return

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
                    print(f"🔢 Result: {content['data']['text/plain']}")
                elif msg_type == "stream":
                    text = content["text"]
                    if "\r" in text:
                        last_line = text.split("\r")[-1]
                        sys.stdout.write("\r" + last_line)
                        sys.stdout.flush()
                    else:
                        print(text, end="")
                elif msg_type == "error":
                    print("❌ Error:")
                    print("\n".join(content["traceback"]))
                elif msg_type == "status" and content["execution_state"] == "idle":
                    break

        client.stop_channels()

    def shutdown_all_kernels(self):
        for kernel_id in self.km.list_kernel_ids():
            self.km.shutdown_kernel(kernel_id, now=True)
            print(f"[✖] Kernel {kernel_id} shut down.")

    def help(self):
        print(
            """
Available commands:
  create                  Create a new IPython kernel
  list                    List running kernels
  exec <id> <code>        Execute code on a kernel
  delete <id>             Delete a kernel
  exit                    Exit the CLI (all kernels will be shut down)
"""
        )


def main():
    cli = KernelCLI()
    print("🔧 Welcome to the Jupyter Kernel CLI (Interactive)")
    cli.help()

    while True:
        try:
            command = input("kernel-cli> ").strip()
            if not command:
                continue

            parts = command.split(" ", 2)
            cmd = parts[0]

            if cmd == "create":
                cli.create_kernel()
            elif cmd == "list":
                cli.list_kernels()
            elif cmd == "delete" and len(parts) > 1:
                cli.delete_kernel(parts[1])
            elif cmd == "exec" and len(parts) > 2:
                cli.execute_code(parts[1], parts[2])
            elif cmd == "help":
                cli.help()
            elif cmd == "exit":
                print("👋 Shutting down all kernels...")
                cli.shutdown_all_kernels()
                print("✅ Exit complete.")
                break
            else:
                print("[!] Unknown command. Type 'help' to see available commands.")

        except KeyboardInterrupt:
            print("\n[!] Use 'exit' to quit the CLI.")
        except Exception as e:
            print(f"[!] Error: {e}")


if __name__ == "__main__":
    main()
