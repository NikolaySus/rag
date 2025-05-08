"""CLI for client"""

import json
import asyncio
import websockets
from prompt_toolkit import PromptSession, ANSI
from prompt_toolkit.patch_stdout import patch_stdout
from prompt_toolkit.application import run_in_terminal
from prompt_toolkit.output import create_output


shutdown_event = asyncio.Event()
session = PromptSession()
output = create_output()

def print_in_terminal(text):
    """Prints formatted text in the terminal above the prompt."""
    if '\r' in text:
        output.write_raw(text)
        output.flush()
        return
    def _print():
        session.app.print_text(ANSI(text + '\n'))
    run_in_terminal(_print)

async def send_loop(websocket):
    """Loop to send kernel manager commands from user input"""
    while not shutdown_event.is_set():
        try:
            with patch_stdout():
                message = await session.prompt_async("kernel-cli> ")
            if message.lower() == "exit":
                shutdown_event.set()
                await websocket.close()
                print_in_terminal("👋 Bye!\n")
                break
            elif message:
                try:
                    parts = message.strip().split(" ", 3)
                    command = parts[0]
                    args = parts[1:]
                    if command == "config":
                        with open(args[2], 'r', encoding='utf-8') as infile:
                            args[2] = infile.read()
                    elif command == "update_config":
                        with open(args[2], 'r', encoding='utf-8') as infile:
                            args[2] = infile.read()
                    payload = {"command": command, "args": args}
                    await websocket.send(json.dumps(payload))
                except Exception as e:
                    print_in_terminal(f"[!] Error:\n{e}\n")
        except KeyboardInterrupt:
            print_in_terminal("[!] Use 'exit' to quit the CLI.\n")
            continue

async def receive_loop(websocket):
    """Loop to receive messages from server"""
    while not shutdown_event.is_set():
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    if not "output" in data:
                        #if not "message" in data:
                        print_in_terminal(f"[Server] {data}\n")
                    else:
                        print_in_terminal(data["output"])
                except Exception as e:
                    print_in_terminal(f"[Server!] {message}\n{e}\n")
        except websockets.exceptions.ConnectionClosed:
            print_in_terminal("🔌 Connection closed.\n")
            break

async def main():
    """Main async entry point"""
    print_in_terminal("🔧 Welcome to IPython Kernel Manager CLI!\nConnecting...")
    uri = "ws://127.0.0.1:8000/ws/kmengine/"
    try:
        async with websockets.connect(uri, origin="http://127.0.0.1:8000") as websocket:
            print_in_terminal("✅ Connected to server.")
            send_task = asyncio.create_task(send_loop(websocket))
            receive_task = asyncio.create_task(receive_loop(websocket))
            await asyncio.wait([send_task, receive_task], return_when=asyncio.FIRST_COMPLETED)
    except Exception as e:
        print_in_terminal(f"[!] Could not connect: {e}\n")

if __name__ == "__main__":
    asyncio.run(main())
