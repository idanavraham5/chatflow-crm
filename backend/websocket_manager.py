from typing import Dict, List
from fastapi import WebSocket
import asyncio
import json


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        self._ping_task = None

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        # Close old connection if same user reconnects
        old_ws = self.active_connections.get(user_id)
        if old_ws:
            try:
                await old_ws.close()
            except Exception:
                pass
        self.active_connections[user_id] = websocket
        print(f"🔌 WebSocket connected: user {user_id} ({len(self.active_connections)} total)")

    def disconnect(self, user_id: int):
        removed = self.active_connections.pop(user_id, None)
        if removed:
            print(f"🔌 WebSocket disconnected: user {user_id} ({len(self.active_connections)} total)")

    async def send_personal(self, user_id: int, data: dict):
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def send_to_users(self, user_ids: List[int], data: dict):
        for uid in user_ids:
            await self.send_personal(uid, data)

    async def broadcast(self, data: dict):
        disconnected = []
        for user_id, ws in list(self.active_connections.items()):
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(user_id)
        for uid in disconnected:
            self.disconnect(uid)

    def get_online_users(self) -> List[int]:
        return list(self.active_connections.keys())

    async def start_ping_loop(self):
        """Send ping to all connections every 25 seconds to keep them alive."""
        while True:
            await asyncio.sleep(25)
            disconnected = []
            for user_id, ws in list(self.active_connections.items()):
                try:
                    await ws.send_json({"type": "ping"})
                except Exception:
                    disconnected.append(user_id)
            for uid in disconnected:
                self.disconnect(uid)


manager = ConnectionManager()
