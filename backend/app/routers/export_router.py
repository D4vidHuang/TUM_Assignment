"""Export evaluations, comparisons, and annotations as CSV/JSON."""
import csv
import io
import json
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Evaluation, PairwiseComparison, Annotation, User, Case, CaseOutput
from ..auth import require_admin

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/evaluations")
def export_evaluations(
    fmt: str = Query("csv", alias="format"),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    evals = db.query(Evaluation).all()
    rows = []
    for e in evals:
        output = db.query(CaseOutput).filter(CaseOutput.id == e.output_id).first()
        evaluator = db.query(User).filter(User.id == e.evaluator_id).first()
        case = db.query(Case).filter(Case.id == e.case_id).first()
        rows.append({
            "evaluation_id": e.id,
            "case_id": e.case_id,
            "case_title": case.title if case else "",
            "output_id": e.output_id,
            "model_name": output.model_name if output else "",
            "evaluator": evaluator.full_name if evaluator else "",
            "accuracy_rating": e.accuracy_rating,
            "completeness_rating": e.completeness_rating,
            "clarity_rating": e.clarity_rating,
            "overall_rating": e.overall_rating,
            "has_critical_error": e.has_critical_error,
            "has_minor_error": e.has_minor_error,
            "would_use_clinically": e.would_use_clinically,
            "error_description": e.error_description or "",
            "corrections": e.corrections or "",
            "comments": e.comments or "",
            "time_spent_seconds": e.time_spent_seconds,
            "created_at": str(e.created_at) if e.created_at else "",
        })

    if fmt == "json":
        return StreamingResponse(
            io.BytesIO(json.dumps(rows, indent=2, default=str).encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=evaluations.json"},
        )

    # CSV
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=evaluations.csv"},
    )


@router.get("/comparisons")
def export_comparisons(
    fmt: str = Query("csv", alias="format"),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    comps = db.query(PairwiseComparison).all()
    rows = []
    for c in comps:
        evaluator = db.query(User).filter(User.id == c.evaluator_id).first()
        case = db.query(Case).filter(Case.id == c.case_id).first()
        out_a = db.query(CaseOutput).filter(CaseOutput.id == c.output_a_id).first()
        out_b = db.query(CaseOutput).filter(CaseOutput.id == c.output_b_id).first()
        pref = db.query(CaseOutput).filter(CaseOutput.id == c.preferred_id).first() if c.preferred_id else None
        rows.append({
            "comparison_id": c.id,
            "case_id": c.case_id,
            "case_title": case.title if case else "",
            "evaluator": evaluator.full_name if evaluator else "",
            "output_a_model": out_a.model_name if out_a else "",
            "output_b_model": out_b.model_name if out_b else "",
            "preferred_model": pref.model_name if pref else "tie",
            "preference_strength": c.preference_strength,
            "reasoning": c.reasoning or "",
            "time_spent_seconds": c.time_spent_seconds,
            "created_at": str(c.created_at) if c.created_at else "",
        })

    if fmt == "json":
        return StreamingResponse(
            io.BytesIO(json.dumps(rows, indent=2, default=str).encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=comparisons.json"},
        )

    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=comparisons.csv"},
    )


@router.get("/annotations")
def export_annotations(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    anns = db.query(Annotation).all()
    rows = []
    for a in anns:
        evaluator = db.query(User).filter(User.id == a.evaluator_id).first()
        case = db.query(Case).filter(Case.id == a.case_id).first()
        rows.append({
            "annotation_id": a.id,
            "case_id": a.case_id,
            "case_title": case.title if case else "",
            "evaluator": evaluator.full_name if evaluator else "",
            "series_name": a.series_name,
            "slice_index": a.slice_index,
            "source_type": a.source_type,
            "model_name": a.model_name,
            "annotation_data": a.annotation_data,
            "label": a.label,
            "finding_type": a.finding_type,
            "color": a.color,
            "created_at": str(a.created_at) if a.created_at else "",
        })
    return StreamingResponse(
        io.BytesIO(json.dumps(rows, indent=2, default=str).encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=annotations.json"},
    )
