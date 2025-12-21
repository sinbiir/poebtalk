import asyncio
import json
from typing import Dict, Set

import websockets
from websockets.server import WebSocketServerProtocol

# rooms[room] = set of websockets
rooms: Dict[str, Set[WebSocketServerProtocol]] = {}
# meta[ws] = {"name": str, "room": str, "pub": str}
meta: Dict[WebSocketServerProtocol, Dict[str, str]] = {}


async def broadcast(room: str, payload: dict) -> None:
    if room not in rooms:
        return
    msg = json.dumps(payload)
    dead = []
    for ws in rooms[room]:
        try:
            await ws.send(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        rooms[room].discard(ws)


async def handler(ws: WebSocketServerProtocol):
    try:
        async for raw in ws:
            data = json.loads(raw)

            if data.get("type") == "join":
                room = data["room"]
                name = data["name"]
                pub = data["pub"]  # base64 public key

                rooms.setdefault(room, set()).add(ws)
                meta[ws] = {"room": room, "name": name, "pub": pub}

                # отправим новому участнику список уже присутствующих
                peers = []
                for w in rooms[room]:
                    if w is not ws and w in meta:
                        peers.append({"name": meta[w]["name"], "pub": meta[w]["pub"]})
                await ws.send(json.dumps({"type": "peers", "peers": peers}))

                # уведомим остальных о новом участнике
                await broadcast(room, {"type": "peer_joined", "name": name, "pub": pub})
                continue

            if data.get("type") == "msg":
                room = meta.get(ws, {}).get("room")
                if not room:
                    continue
                # сервер НЕ расшифровывает payload — просто пересылает
                await broadcast(room, data)
                continue

    finally:
        info = meta.pop(ws, None)
        if info:
            room = info["room"]
            rooms.get(room, set()).discard(ws)
            await broadcast(room, {"type": "peer_left", "name": info["name"]})


async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Server on ws://0.0.0.0:8765")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
