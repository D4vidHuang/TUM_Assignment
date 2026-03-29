"""Real-time collaboration via WebSocket — share cursors and annotations."""
import json
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from ..auth import SECRET_KEY, ALGORITHM

router = APIRouter(tags=["collaboration"])

# Room key = "case_{case_id}" — users viewing same case are in same room
# Each room stores: {user_id: {"ws": WebSocket, "name": str, "color": str}}
rooms: Dict[str, Dict[int, dict]] = {}

COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]


def _get_color(index: int) -> str:
    return COLORS[index % len(COLORS)]


def _verify_ws_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except (JWTError, Exception):
        return None


@router.websocket("/ws/collab/{case_id}")
async def collab_websocket(websocket: WebSocket, case_id: int, token: str = Query(...)):
    # Verify token
    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = int(payload.get("sub", 0))
    if not user_id:
        await websocket.close(code=4001, reason="Invalid user")
        return

    await websocket.accept()

    room_key = f"case_{case_id}"
    if room_key not in rooms:
        rooms[room_key] = {}

    # Ask client for their name
    color = _get_color(len(rooms[room_key]))
    rooms[room_key][user_id] = {"ws": websocket, "name": f"User {user_id}", "color": color}

    # Notify others of join
    await _broadcast(room_key, user_id, {
        "type": "user_joined",
        "user_id": user_id,
        "color": color,
        "peers": [
            {"user_id": uid, "name": info["name"], "color": info["color"]}
            for uid, info in rooms[room_key].items()
        ],
    })

    # Send peer list to the joining user
    await websocket.send_json({
        "type": "peer_list",
        "peers": [
            {"user_id": uid, "name": info["name"], "color": info["color"]}
            for uid, info in rooms[room_key].items() if uid != user_id
        ],
        "your_color": color,
    })

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "set_name":
                rooms[room_key][user_id]["name"] = msg.get("name", f"User {user_id}")
                await _broadcast(room_key, user_id, {
                    "type": "user_renamed",
                    "user_id": user_id,
                    "name": rooms[room_key][user_id]["name"],
                })

            elif msg_type == "cursor_move":
                # Forward cursor position to other users
                await _broadcast(room_key, user_id, {
                    "type": "cursor_move",
                    "user_id": user_id,
                    "name": rooms[room_key][user_id]["name"],
                    "color": rooms[room_key][user_id]["color"],
                    "x": msg.get("x"),
                    "y": msg.get("y"),
                    "series": msg.get("series"),
                    "slice": msg.get("slice"),
                })

            elif msg_type == "annotation_update":
                # Forward live annotation drawing to others
                await _broadcast(room_key, user_id, {
                    "type": "annotation_update",
                    "user_id": user_id,
                    "name": rooms[room_key][user_id]["name"],
                    "color": rooms[room_key][user_id]["color"],
                    "shape": msg.get("shape"),
                    "series": msg.get("series"),
                    "slice": msg.get("slice"),
                })

            elif msg_type == "annotation_saved":
                # Notify all that an annotation was saved
                await _broadcast(room_key, user_id, {
                    "type": "annotation_saved",
                    "user_id": user_id,
                    "annotation_id": msg.get("annotation_id"),
                })

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if room_key in rooms and user_id in rooms[room_key]:
            del rooms[room_key][user_id]
            if not rooms[room_key]:
                del rooms[room_key]
            else:
                await _broadcast(room_key, user_id, {
                    "type": "user_left",
                    "user_id": user_id,
                })


async def _broadcast(room_key: str, sender_id: int, message: dict):
    """Send message to all users in the room except the sender."""
    if room_key not in rooms:
        return
    dead = []
    for uid, info in rooms[room_key].items():
        if uid != sender_id:
            try:
                await info["ws"].send_json(message)
            except Exception:
                dead.append(uid)
    for uid in dead:
        rooms[room_key].pop(uid, None)
