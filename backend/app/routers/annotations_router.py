"""CRUD for vector-based image annotations + smart propagation."""
import json
import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Annotation, Case, User
from ..schemas import AnnotationCreate, AnnotationUpdate, AnnotationOut
from ..auth import get_current_user
from ..imaging_utils import DATA_DIR, sorted_slices
import os

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


def _to_out(a: Annotation) -> dict:
    return {
        "id": a.id,
        "case_id": a.case_id,
        "evaluator_id": a.evaluator_id,
        "series_name": a.series_name,
        "slice_index": a.slice_index,
        "source_type": a.source_type,
        "model_name": a.model_name,
        "annotation_data": a.annotation_data,
        "label": a.label,
        "finding_type": a.finding_type,
        "color": a.color,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
        "evaluator_name": a.evaluator.full_name if a.evaluator else None,
        "case_title": a.case.title if a.case else None,
    }


@router.post("/")
def create_annotation(
    data: AnnotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate JSON
    try:
        json.loads(data.annotation_data)
    except json.JSONDecodeError:
        raise HTTPException(400, "annotation_data must be valid JSON")

    case = db.query(Case).filter(Case.id == data.case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")

    ann = Annotation(
        evaluator_id=user.id,
        **data.model_dump(),
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _to_out(ann)


@router.get("/")
def list_annotations(
    case_id: Optional[int] = Query(None),
    evaluator_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Annotation)
    if case_id is not None:
        q = q.filter(Annotation.case_id == case_id)
    if evaluator_id is not None:
        q = q.filter(Annotation.evaluator_id == evaluator_id)
    return [_to_out(a) for a in q.order_by(Annotation.created_at.desc()).all()]


@router.get("/case/{case_id}/slice")
def get_slice_annotations(
    case_id: int,
    series: str = Query(...),
    index: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    anns = (
        db.query(Annotation)
        .filter(
            Annotation.case_id == case_id,
            Annotation.series_name == series,
            Annotation.slice_index == index,
        )
        .all()
    )
    return [_to_out(a) for a in anns]


@router.get("/{annotation_id}")
def get_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ann = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(404, "Annotation not found")
    return _to_out(ann)


@router.put("/{annotation_id}")
def update_annotation(
    annotation_id: int,
    data: AnnotationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ann = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(404, "Annotation not found")
    if ann.evaluator_id != user.id:
        raise HTTPException(403, "Can only edit your own annotations")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(ann, field, value)
    db.commit()
    db.refresh(ann)
    return _to_out(ann)


@router.delete("/{annotation_id}")
def delete_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ann = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(404, "Annotation not found")
    if ann.evaluator_id != user.id and user.role.value != "admin":
        raise HTTPException(403, "Not authorized")
    db.delete(ann)
    db.commit()
    return {"ok": True}


# ── Smart Annotation Propagation ─────────────────────────────────────────────

class PropagateRequest(BaseModel):
    annotation_id: int
    direction: str = "both"   # "forward", "backward", "both"
    num_slices: int = 5       # how many slices to propagate
    scale_factor: float = 0.95  # shrink/grow per slice (lesions taper)


def _scale_shape(shape: dict, factor: float, iteration: int) -> dict:
    """Scale a shape's points around its centroid by factor^iteration."""
    pts = shape.get("points", [])
    if len(pts) < 2:
        return shape

    # Compute centroid
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)

    s = factor ** iteration

    new_pts = []
    for p in pts:
        nx = cx + (p[0] - cx) * s
        ny = cy + (p[1] - cy) * s
        new_pts.append([round(nx, 6), round(ny, 6)])

    return {**shape, "points": new_pts}


@router.post("/propagate")
def propagate_annotation(
    req: PropagateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Propagate an annotation to adjacent slices with automatic scaling.

    Simulates lesion tracking: shapes gradually shrink toward edges
    (since lesions taper in adjacent slices). Creates new annotation
    records for each target slice.
    """
    source = db.query(Annotation).filter(Annotation.id == req.annotation_id).first()
    if not source:
        raise HTTPException(404, "Source annotation not found")

    case = db.query(Case).filter(Case.id == source.case_id).first()
    if not case or not case.imaging_folder_name:
        raise HTTPException(400, "Case has no imaging data")

    # Determine valid slice range
    series_path = os.path.join(DATA_DIR, case.imaging_folder_name, source.series_name)
    slices = sorted_slices(series_path)
    max_slice = len(slices) - 1 if slices else 0

    shapes = json.loads(source.annotation_data)

    # Build target slices
    targets = []
    if req.direction in ("forward", "both"):
        for i in range(1, req.num_slices + 1):
            idx = source.slice_index + i
            if idx <= max_slice:
                targets.append((idx, i))
    if req.direction in ("backward", "both"):
        for i in range(1, req.num_slices + 1):
            idx = source.slice_index - i
            if idx >= 0:
                targets.append((idx, i))

    created = []
    for slice_idx, iteration in targets:
        # Check if annotation already exists at this slice from this user
        existing = db.query(Annotation).filter(
            Annotation.case_id == source.case_id,
            Annotation.evaluator_id == user.id,
            Annotation.series_name == source.series_name,
            Annotation.slice_index == slice_idx,
        ).first()
        if existing:
            continue  # Don't overwrite existing annotations

        # Scale each shape
        propagated_shapes = [_scale_shape(s, req.scale_factor, iteration) for s in shapes]

        ann = Annotation(
            case_id=source.case_id,
            evaluator_id=user.id,
            series_name=source.series_name,
            slice_index=slice_idx,
            source_type=source.source_type,
            model_name=source.model_name,
            annotation_data=json.dumps(propagated_shapes),
            label=f"{source.label or 'Propagated'} (auto, slice {slice_idx + 1})",
            finding_type=source.finding_type,
            color=source.color,
        )
        db.add(ann)
        created.append(slice_idx)

    db.commit()
    return {
        "ok": True,
        "source_slice": source.slice_index,
        "propagated_to": sorted(created),
        "count": len(created),
    }
