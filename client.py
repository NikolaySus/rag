"""simple websocket client"""

import asyncio
import websockets
from prompt_toolkit import PromptSession
from prompt_toolkit.patch_stdout import patch_stdout

shutdown_event = asyncio.Event()
session = PromptSession()


async def send_loop(websocket):
    """Loop to send messages from user input"""
    while not shutdown_event.is_set():
        try:
            with patch_stdout():
                message = await session.prompt_async("kernel-cli> ")
            if message.lower() == "exit":
                shutdown_event.set()
                await websocket.close()
                print("👋 Bye!")
                break
            elif message:
                await websocket.send(f'{{"message": "{message}"}}')
        except KeyboardInterrupt:
            print("\n[!] Use 'exit' to quit the CLI.")
            continue

async def receive_loop(websocket):
    """Loop to receive messages from server"""
    while not shutdown_event.is_set():
        try:
            async for message in websocket:
                print(message)
        except websockets.exceptions.ConnectionClosed:
            print("🔌 Connection closed.")
            break

async def main():
    """Main async entry point"""
    print("🔧 Welcome to chat client CLI!\nConnecting...")
    uri = "ws://127.0.0.1:8000/ws/chat/lobby/"
    try:
        async with websockets.connect(uri, origin="http://127.0.0.1:8000") as websocket:
            print("✅ Connected to server.")
            send_task = asyncio.create_task(send_loop(websocket))
            receive_task = asyncio.create_task(receive_loop(websocket))
            await asyncio.wait([send_task, receive_task], return_when=asyncio.FIRST_COMPLETED)
    except Exception as e:
        print(f"[!] Could not connect: {e}")

if __name__ == "__main__":
    asyncio.run(main())
