"""Consensus Conference Mode — MDT meeting with host-controlled navigation and voting."""
import json
import datetime
from typing import Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import JWTError, jwt

from ..auth import SECRET_KEY, ALGORITHM, get_current_user
from ..database import get_db
from ..models import User

router = APIRouter(tags=["conference"])

# Active conferences: {conference_id: ConferenceState}
conferences: Dict[str, dict] = {}

COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"]


def _verify_ws_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except (JWTError, Exception):
        return None


class ConferenceCreate(BaseModel):
    case_id: int
    title: str = "Consensus Conference"


# REST endpoints for conference management
rest_router = APIRouter(prefix="/api/conferences", tags=["conference"])


@rest_router.post("/")
def create_conference(data: ConferenceCreate, user: User = Depends(get_current_user)):
    """Create a new conference session. The creator becomes the host."""
    conf_id = f"conf_{data.case_id}_{int(datetime.datetime.utcnow().timestamp())}"
    conferences[conf_id] = {
        "id": conf_id,
        "case_id": data.case_id,
        "title": data.title,
        "host_id": user.id,
        "host_name": user.full_name,
        "created_at": datetime.datetime.utcnow().isoformat(),
        "state": {
            "series_index": 0,
            "slice_index": 0,
            "active_vote": None,  # {question, options, votes: {user_id: choice}}
        },
        "participants": {},  # {user_id: {name, color, ws}}
        "chat": [],  # [{user_id, name, message, timestamp}]
        "votes_history": [],
    }
    return {"id": conf_id, "case_id": data.case_id, "title": data.title}


@rest_router.get("/")
def list_conferences(user: User = Depends(get_current_user)):
    """List active conferences."""
    return [
        {
            "id": c["id"],
            "case_id": c["case_id"],
            "title": c["title"],
            "host_name": c["host_name"],
            "participant_count": len(c["participants"]),
            "created_at": c["created_at"],
        }
        for c in conferences.values()
    ]


@rest_router.delete("/{conf_id}")
def end_conference(conf_id: str, user: User = Depends(get_current_user)):
    if conf_id in conferences:
        conf = conferences[conf_id]
        if conf["host_id"] != user.id:
            raise HTTPException(403, "Only the host can end the conference")
        del conferences[conf_id]
    return {"ok": True}


# WebSocket endpoint
@router.websocket("/ws/conference/{conf_id}")
async def conference_websocket(websocket: WebSocket, conf_id: str, token: str = Query(...)):
    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = int(payload.get("sub", 0))
    if not user_id:
        await websocket.close(code=4001)
        return

    if conf_id not in conferences:
        await websocket.close(code=4004, reason="Conference not found")
        return

    await websocket.accept()
    conf = conferences[conf_id]
    color = COLORS[len(conf["participants"]) % len(COLORS)]
    conf["participants"][user_id] = {"name": f"User {user_id}", "color": color, "ws": websocket}

    # Send initial state
    await websocket.send_json({
        "type": "conference_state",
        "conf_id": conf_id,
        "title": conf["title"],
        "host_id": conf["host_id"],
        "host_name": conf["host_name"],
        "case_id": conf["case_id"],
        "your_color": color,
        "is_host": user_id == conf["host_id"],
        "state": conf["state"],
        "participants": [
            {"user_id": uid, "name": p["name"], "color": p["color"]}
            for uid, p in conf["participants"].items()
        ],
        "chat": conf["chat"][-50:],
    })

    # Notify others
    await _broadcast(conf, user_id, {
        "type": "participant_joined",
        "user_id": user_id,
        "participant_count": len(conf["participants"]),
    })

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            mtype = msg.get("type")

            if mtype == "set_name":
                conf["participants"][user_id]["name"] = msg.get("name", f"User {user_id}")
                await _broadcast_all(conf, {
                    "type": "participants_update",
                    "participants": [
                        {"user_id": uid, "name": p["name"], "color": p["color"]}
                        for uid, p in conf["participants"].items()
                    ],
                })

            elif mtype == "navigate" and user_id == conf["host_id"]:
                # Host controls navigation for everyone
                conf["state"]["series_index"] = msg.get("series_index", conf["state"]["series_index"])
                conf["state"]["slice_index"] = msg.get("slice_index", conf["state"]["slice_index"])
                await _broadcast_all(conf, {
                    "type": "navigate",
                    "series_index": conf["state"]["series_index"],
                    "slice_index": conf["state"]["slice_index"],
                })

            elif mtype == "start_vote" and user_id == conf["host_id"]:
                # Host starts a vote
                vote = {
                    "question": msg.get("question", "Do you agree?"),
                    "options": msg.get("options", ["Agree", "Disagree", "Unsure"]),
                    "votes": {},
                }
                conf["state"]["active_vote"] = vote
                await _broadcast_all(conf, {"type": "vote_started", "vote": vote})

            elif mtype == "cast_vote":
                vote = conf["state"].get("active_vote")
                if vote:
                    vote["votes"][str(user_id)] = msg.get("choice")
                    name = conf["participants"].get(user_id, {}).get("name", "?")
                    await _broadcast_all(conf, {
                        "type": "vote_update",
                        "votes": vote["votes"],
                        "voter": name,
                        "total_participants": len(conf["participants"]),
                    })

            elif mtype == "end_vote" and user_id == conf["host_id"]:
                vote = conf["state"].get("active_vote")
                if vote:
                    conf["votes_history"].append(vote)
                    conf["state"]["active_vote"] = None
                    await _broadcast_all(conf, {
                        "type": "vote_ended",
                        "results": vote["votes"],
                        "question": vote["question"],
                    })

            elif mtype == "chat":
                chat_msg = {
                    "user_id": user_id,
                    "name": conf["participants"].get(user_id, {}).get("name", "?"),
                    "message": msg.get("message", ""),
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                }
                conf["chat"].append(chat_msg)
                await _broadcast_all(conf, {"type": "chat", **chat_msg})

            elif mtype == "pointer" and user_id == conf["host_id"]:
                # Host laser pointer
                await _broadcast(conf, user_id, {
                    "type": "pointer",
                    "x": msg.get("x"), "y": msg.get("y"),
                    "color": conf["participants"].get(user_id, {}).get("color", "#ff0000"),
                })

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        conf["participants"].pop(user_id, None)
        if not conf["participants"]:
            conferences.pop(conf_id, None)
        else:
            await _broadcast_all(conf, {
                "type": "participant_left",
                "user_id": user_id,
                "participant_count": len(conf["participants"]),
            })


async def _broadcast(conf: dict, sender_id: int, message: dict):
    dead = []
    for uid, p in conf["participants"].items():
        if uid != sender_id:
            try:
                await p["ws"].send_json(message)
            except Exception:
                dead.append(uid)
    for uid in dead:
        conf["participants"].pop(uid, None)


async def _broadcast_all(conf: dict, message: dict):
    dead = []
    for uid, p in conf["participants"].items():
        try:
            await p["ws"].send_json(message)
        except Exception:
            dead.append(uid)
    for uid in dead:
        conf["participants"].pop(uid, None)
