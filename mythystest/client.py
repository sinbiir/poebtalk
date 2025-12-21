import argparse
import asyncio
import base64
import json
import sys
from typing import Dict, Optional

import websockets
from nacl.public import PrivateKey, PublicKey, Box


def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode("utf-8")


def b64d(s: str) -> bytes:
    return base64.b64decode(s.encode("utf-8"))


class E2EEClient:
    def __init__(self, name: str, room: str, url: str):
        self.name = name
        self.room = room
        self.url = url

        self.sk = PrivateKey.generate()
        self.pk_b64 = b64e(bytes(self.sk.public_key))

        # peers[name] = Box(self.sk, peer_pk)
        self.peers: Dict[str, Box] = {}

    def add_peer(self, peer_name: str, peer_pub_b64: str):
        if peer_name == self.name:
            return
        peer_pk = PublicKey(b64d(peer_pub_b64))
        self.peers[peer_name] = Box(self.sk, peer_pk)

    def encrypt_for(self, peer_name: str, plaintext: str) -> str:
        box = self.peers[peer_name]
        ct = box.encrypt(plaintext.encode("utf-8"))  # nonce внутри
        return b64e(ct)

    def decrypt_from(self, peer_name: str, ciphertext_b64: str) -> str:
        box = self.peers[peer_name]
        pt = box.decrypt(b64d(ciphertext_b64))
        return pt.decode("utf-8")

    async def run(self):
        async with websockets.connect(self.url) as ws:
            await ws.send(json.dumps({
                "type": "join",
                "room": self.room,
                "name": self.name,
                "pub": self.pk_b64
            }))

            print(f"Connected as {self.name} in room '{self.room}'")
            print("Type messages and press Enter. Ctrl+C to exit.\n")

            receiver = asyncio.create_task(self._recv_loop(ws))
            sender = asyncio.create_task(self._send_loop(ws))

            done, pending = await asyncio.wait(
                {receiver, sender},
                return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()

    async def _recv_loop(self, ws):
        async for raw in ws:
            data = json.loads(raw)
            t = data.get("type")

            if t == "peers":
                for p in data.get("peers", []):
                    self.add_peer(p["name"], p["pub"])
                if self.peers:
                    print(f"[system] peers: {', '.join(self.peers.keys())}")
                continue

            if t == "peer_joined":
                self.add_peer(data["name"], data["pub"])
                print(f"[system] {data['name']} joined")
                continue

            if t == "peer_left":
                name = data["name"]
                self.peers.pop(name, None)
                print(f"[system] {name} left")
                continue

            if t == "msg":
                frm = data.get("from")
                if not frm or frm == self.name:
                    continue
                if frm not in self.peers:
                    # нет ключа — не сможем расшифровать
                    print(f"[system] got msg from unknown peer '{frm}'")
                    continue
                try:
                    text = self.decrypt_from(frm, data["ct"])
                    print(f"{frm}: {text}")
                except Exception:
                    print(f"[system] failed to decrypt message from {frm}")
                continue

    async def _send_loop(self, ws):
        loop = asyncio.get_running_loop()
        while True:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                return
            line = line.rstrip("\n")
            if not line:
                continue

            if not self.peers:
                print("[system] no peers yet (wait for someone to join)")
                continue

            # Для простоты: шифруем одно и то же сообщение отдельно каждому пиру
            for peer_name in list(self.peers.keys()):
                ct_b64 = self.encrypt_for(peer_name, line)
                await ws.send(json.dumps({
                    "type": "msg",
                    "room": self.room,
                    "from": self.name,
                    "to": peer_name,
                    "ct": ct_b64
                }))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--room", default="main")
    ap.add_argument("--url", default="ws://127.0.0.1:8765")
    args = ap.parse_args()

    client = E2EEClient(args.name, args.room, args.url)
    asyncio.run(client.run())


if __name__ == "__main__":
    main()
