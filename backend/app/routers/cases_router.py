from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Case, CaseOutput, Evaluation, User
from ..schemas import CaseOut, CaseListItem, CaseImagingOut, ImagingSeriesInfo
from ..auth import get_current_user
from ..imaging_utils import DATA_DIR, scan_imaging_case

router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.get("/", response_model=list[CaseListItem])
def list_cases(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cases = db.query(Case).order_by(Case.id).all()
    result = []
    for c in cases:
        num_outputs = len(c.outputs)
        user_evals = (
            db.query(Evaluation)
            .filter(Evaluation.case_id == c.id, Evaluation.evaluator_id == user.id)
            .count()
        )
        if user_evals == 0:
            eval_status = "pending"
        elif user_evals < num_outputs:
            eval_status = "in_progress"
        else:
            eval_status = "completed"

        result.append(CaseListItem(
            id=c.id, title=c.title, modality=c.modality,
            body_region=c.body_region, num_outputs=num_outputs,
            eval_status=eval_status,
        ))
    return result


@router.get("/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return CaseOut.model_validate(case)


@router.get("/{case_id}/imaging")
def get_case_imaging(case_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return imaging series info for a case by scanning its imaging_folder_name directory."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    if not case.imaging_folder_name:
        return {"case_id": case.id, "imaging_folder_name": None, "series": []}

    info = scan_imaging_case(DATA_DIR, case.imaging_folder_name)
    if not info:
        return {"case_id": case.id, "imaging_folder_name": case.imaging_folder_name, "series": []}

    return {
        "case_id": case.id,
        "imaging_folder_name": case.imaging_folder_name,
        "series": info["series"],
    }


@router.get("/{case_id}/my-evaluations")
def get_my_evaluations(case_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    evals = (
        db.query(Evaluation)
        .filter(Evaluation.case_id == case_id, Evaluation.evaluator_id == user.id)
        .all()
    )
    return [
        {
            "id": e.id, "output_id": e.output_id,
            "accuracy_rating": e.accuracy_rating,
            "completeness_rating": e.completeness_rating,
            "clarity_rating": e.clarity_rating,
            "overall_rating": e.overall_rating,
            "has_critical_error": e.has_critical_error,
            "has_minor_error": e.has_minor_error,
            "would_use_clinically": e.would_use_clinically,
            "error_description": e.error_description,
            "corrections": e.corrections,
            "comments": e.comments,
        }
        for e in evals
    ]
