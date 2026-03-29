import statistics
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Case, CaseOutput, Evaluation, PairwiseComparison, User, UserRole
from ..schemas import AdminStats, AnnotatorActivity, AgreementMetrics
from ..auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
def get_stats(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    total_cases = db.query(Case).count()
    total_evaluations = db.query(Evaluation).count()
    total_comparisons = db.query(PairwiseComparison).count()
    total_evaluators = (
        db.query(Evaluation.evaluator_id).distinct().count()
    )
    evals_per_case = total_evaluations / total_cases if total_cases > 0 else 0

    # Cases where all outputs have been evaluated by at least one user
    cases_fully_evaluated = 0
    for case in db.query(Case).all():
        num_outputs = len(case.outputs)
        if num_outputs == 0:
            continue
        evaluated_outputs = (
            db.query(Evaluation.output_id)
            .filter(Evaluation.case_id == case.id)
            .distinct()
            .count()
        )
        if evaluated_outputs >= num_outputs:
            cases_fully_evaluated += 1

    avg_time = db.query(func.avg(Evaluation.time_spent_seconds)).filter(
        Evaluation.time_spent_seconds.isnot(None)
    ).scalar()

    return AdminStats(
        total_cases=total_cases,
        total_evaluations=total_evaluations,
        total_comparisons=total_comparisons,
        total_evaluators=total_evaluators,
        evaluations_per_case=round(evals_per_case, 1),
        cases_fully_evaluated=cases_fully_evaluated,
        avg_time_per_evaluation=round(avg_time, 1) if avg_time else None,
    )


@router.get("/annotators", response_model=list[AnnotatorActivity])
def get_annotator_activity(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    clinicians = db.query(User).filter(User.role == UserRole.CLINICIAN).all()
    result = []
    for c in clinicians:
        evals = db.query(Evaluation).filter(Evaluation.evaluator_id == c.id).all()
        comps = db.query(PairwiseComparison).filter(PairwiseComparison.evaluator_id == c.id).count()

        avg_rating = None
        if evals:
            ratings = [e.overall_rating for e in evals if e.overall_rating is not None]
            avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None

        last_eval = max((e.created_at for e in evals), default=None)

        result.append(AnnotatorActivity(
            evaluator_id=c.id,
            full_name=c.full_name,
            evaluations_count=len(evals),
            comparisons_count=comps,
            avg_overall_rating=avg_rating,
            last_active=last_eval,
        ))
    return result


@router.get("/agreement", response_model=list[AgreementMetrics])
def get_agreement_metrics(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Simple inter-annotator agreement: std deviation of overall ratings per case."""
    cases = db.query(Case).all()
    result = []
    for case in cases:
        evals = db.query(Evaluation).filter(Evaluation.case_id == case.id).all()
        evaluator_ids = set(e.evaluator_id for e in evals)
        ratings = [e.overall_rating for e in evals if e.overall_rating is not None]

        mean_r = round(statistics.mean(ratings), 2) if ratings else None
        std_r = round(statistics.stdev(ratings), 2) if len(ratings) >= 2 else None

        # Simple agreement score: 1 - (std / 2) clamped to [0,1]
        agreement = None
        if std_r is not None:
            agreement = round(max(0, 1 - std_r / 2), 2)

        result.append(AgreementMetrics(
            case_id=case.id,
            case_title=case.title,
            num_evaluators=len(evaluator_ids),
            mean_overall_rating=mean_r,
            std_overall_rating=std_r,
            agreement_score=agreement,
        ))
    return result
