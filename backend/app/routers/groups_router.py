"""Research group management — Zotero-like library + team system."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models import ResearchGroup, User, Case, group_members, group_cases
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/groups", tags=["groups"])


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3b82f6"


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_api_url: Optional[str] = None
    llm_model_name: Optional[str] = None


def _group_to_dict(g: ResearchGroup, include_api_key: bool = False):
    return {
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "color": g.color,
        "llm_provider": g.llm_provider,
        "llm_api_url": g.llm_api_url,
        "llm_model_name": g.llm_model_name,
        "llm_configured": bool(g.llm_api_key),
        "llm_api_key": g.llm_api_key if include_api_key else None,
        "owner_id": g.owner_id,
        "owner_name": g.owner.full_name if g.owner else None,
        "member_count": len(g.members),
        "case_count": len(g.cases),
        "members": [{"id": m.id, "username": m.username, "full_name": m.full_name, "role": m.role.value} for m in g.members],
        "case_ids": [c.id for c in g.cases],
        "created_at": g.created_at,
    }


@router.get("/")
def list_groups(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List groups the current user belongs to (or all for admin)."""
    if user.role.value == "admin":
        groups = db.query(ResearchGroup).all()
    else:
        groups = user.groups
    return [_group_to_dict(g) for g in groups]


@router.post("/")
def create_group(data: GroupCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    existing = db.query(ResearchGroup).filter(ResearchGroup.name == data.name).first()
    if existing:
        raise HTTPException(400, "Group name already exists")
    g = ResearchGroup(name=data.name, description=data.description, color=data.color, owner_id=user.id)
    g.members.append(user)  # owner is automatically a member
    db.add(g)
    db.commit()
    db.refresh(g)
    return _group_to_dict(g)


@router.get("/{group_id}")
def get_group(group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.query(ResearchGroup).filter(ResearchGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    # Check access
    if user.role.value != "admin" and user not in g.members:
        raise HTTPException(403, "Not a member of this group")
    return _group_to_dict(g, include_api_key=(user.id == g.owner_id or user.role.value == "admin"))


@router.put("/{group_id}")
def update_group(group_id: int, data: GroupUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.query(ResearchGroup).filter(ResearchGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    if g.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Only group owner or admin can update")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(g, field, value)
    db.commit()
    db.refresh(g)
    return _group_to_dict(g, include_api_key=True)


@router.post("/{group_id}/members/{user_id}")
def add_member(group_id: int, user_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.query(ResearchGroup).filter(ResearchGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    if g.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Only group owner or admin can manage members")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target not in g.members:
        g.members.append(target)
        db.commit()
    return {"ok": True, "member_count": len(g.members)}


@router.delete("/{group_id}/members/{user_id}")
def remove_member(group_id: int, user_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.query(ResearchGroup).filter(ResearchGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    if g.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Only group owner or admin can manage members")
    target = db.query(User).filter(User.id == user_id).first()
    if target and target in g.members:
        g.members.remove(target)
        db.commit()
    return {"ok": True}


@router.post("/{group_id}/cases/{case_id}")
def assign_case(group_id: int, case_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.query(ResearchGroup).filter(ResearchGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    if g.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Only group owner or admin can assign cases")
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    if case not in g.cases:
        g.cases.append(case)
        db.commit()
    return {"ok": True, "case_count": len(g.cases)}


@router.delete("/{group_id}/cases/{case_id}")
def unassign_case(group_id: int, case_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.query(ResearchGroup).filter(ResearchGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    if g.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(403)
    case = db.query(Case).filter(Case.id == case_id).first()
    if case and case in g.cases:
        g.cases.remove(case)
        db.commit()
    return {"ok": True}


@router.get("/users/all")
def list_all_users(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """List all users for group management."""
    users = db.query(User).filter(User.is_active == True).all()
    return [{"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role.value, "specialty": u.specialty} for u in users]
