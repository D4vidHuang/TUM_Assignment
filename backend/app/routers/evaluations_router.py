from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Evaluation, PairwiseComparison, CaseOutput, Case, User
from ..schemas import (
    EvaluationCreate, EvaluationOut,
    PairwiseComparisonCreate, PairwiseComparisonOut,
)
from ..auth import get_current_user

router = APIRouter(prefix="/api/evaluations", tags=["evaluations"])


@router.post("/{case_id}", response_model=EvaluationOut)
def create_evaluation(
    case_id: int,
    data: EvaluationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate case and output
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    output = db.query(CaseOutput).filter(
        CaseOutput.id == data.output_id, CaseOutput.case_id == case_id
    ).first()
    if not output:
        raise HTTPException(status_code=404, detail="Output not found for this case")

    # Check if already evaluated by this user
    existing = db.query(Evaluation).filter(
        Evaluation.case_id == case_id,
        Evaluation.output_id == data.output_id,
        Evaluation.evaluator_id == user.id,
    ).first()

    if existing:
        # Update existing evaluation
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return EvaluationOut.model_validate(existing)

    # Create new
    evaluation = Evaluation(
        case_id=case_id,
        evaluator_id=user.id,
        **data.model_dump(),
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    return EvaluationOut.model_validate(evaluation)


@router.post("/{case_id}/pairwise", response_model=PairwiseComparisonOut)
def create_pairwise_comparison(
    case_id: int,
    data: PairwiseComparisonCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate both outputs belong to this case
    for oid in [data.output_a_id, data.output_b_id]:
        output = db.query(CaseOutput).filter(CaseOutput.id == oid, CaseOutput.case_id == case_id).first()
        if not output:
            raise HTTPException(status_code=404, detail=f"Output {oid} not found for this case")

    if data.preferred_id and data.preferred_id not in [data.output_a_id, data.output_b_id]:
        raise HTTPException(status_code=400, detail="preferred_id must be one of the two outputs or null")

    comparison = PairwiseComparison(
        case_id=case_id,
        evaluator_id=user.id,
        **data.model_dump(),
    )
    db.add(comparison)
    db.commit()
    db.refresh(comparison)
    return PairwiseComparisonOut.model_validate(comparison)
