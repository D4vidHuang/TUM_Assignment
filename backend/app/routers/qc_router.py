"""Quality Control Dashboard — detect anomalous evaluation behavior."""
import statistics
from collections import Counter
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Evaluation, User, UserRole, Case, CaseOutput
from ..auth import require_admin

router = APIRouter(prefix="/api/qc", tags=["quality-control"])


@router.get("/overview")
def qc_overview(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Overall quality control metrics."""
    evals = db.query(Evaluation).all()
    if not evals:
        return {"total_evaluations": 0, "flags": []}

    # Time analysis
    times = [e.time_spent_seconds for e in evals if e.time_spent_seconds and e.time_spent_seconds > 0]
    avg_time = statistics.mean(times) if times else 0
    median_time = statistics.median(times) if times else 0

    # Rating distribution
    ratings = [e.overall_rating for e in evals if e.overall_rating is not None]
    rating_dist = dict(Counter(ratings))

    # Error rate
    critical_count = sum(1 for e in evals if e.has_critical_error)
    minor_count = sum(1 for e in evals if e.has_minor_error)

    return {
        "total_evaluations": len(evals),
        "avg_time_seconds": round(avg_time, 1),
        "median_time_seconds": round(median_time, 1),
        "rating_distribution": rating_dist,
        "critical_error_rate": round(critical_count / len(evals) * 100, 1) if evals else 0,
        "minor_error_rate": round(minor_count / len(evals) * 100, 1) if evals else 0,
    }


@router.get("/evaluator-analysis")
def evaluator_analysis(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Per-evaluator quality analysis — detect anomalous behavior."""
    clinicians = db.query(User).filter(User.role == UserRole.CLINICIAN).all()
    all_evals = db.query(Evaluation).all()

    # Global stats for comparison
    global_times = [e.time_spent_seconds for e in all_evals if e.time_spent_seconds and e.time_spent_seconds > 0]
    global_avg_time = statistics.mean(global_times) if global_times else 60
    global_ratings = [e.overall_rating for e in all_evals if e.overall_rating is not None]
    global_avg_rating = statistics.mean(global_ratings) if global_ratings else 3

    results = []
    for c in clinicians:
        user_evals = [e for e in all_evals if e.evaluator_id == c.id]
        if not user_evals:
            results.append({
                "user_id": c.id, "full_name": c.full_name,
                "evaluation_count": 0, "flags": [], "flag_count": 0,
            })
            continue

        flags = []

        # 1. Speed analysis — too fast = suspicious
        user_times = [e.time_spent_seconds for e in user_evals if e.time_spent_seconds and e.time_spent_seconds > 0]
        avg_time = statistics.mean(user_times) if user_times else 0
        fast_count = sum(1 for t in user_times if t < 10)  # < 10 seconds is suspiciously fast

        if fast_count > 0:
            flags.append({
                "type": "speed",
                "severity": "high" if fast_count > len(user_evals) * 0.3 else "medium",
                "message": f"{fast_count} evaluation(s) completed in < 10 seconds",
                "detail": f"Avg time: {round(avg_time)}s vs global avg: {round(global_avg_time)}s",
            })
        if avg_time > 0 and avg_time < global_avg_time * 0.3:
            flags.append({
                "type": "speed",
                "severity": "medium",
                "message": f"Average time ({round(avg_time)}s) is <30% of global average ({round(global_avg_time)}s)",
            })

        # 2. Rating distribution — always same score = suspicious
        user_ratings = [e.overall_rating for e in user_evals if e.overall_rating is not None]
        if len(user_ratings) >= 3:
            rating_std = statistics.stdev(user_ratings) if len(user_ratings) >= 2 else 0
            most_common = Counter(user_ratings).most_common(1)
            if most_common:
                dominant_pct = most_common[0][1] / len(user_ratings)
                if dominant_pct > 0.8 and len(user_ratings) >= 5:
                    flags.append({
                        "type": "distribution",
                        "severity": "high",
                        "message": f"{round(dominant_pct*100)}% of ratings are '{most_common[0][0]}'",
                        "detail": f"Rating std dev: {round(rating_std, 2)} (low variance suggests inattention)",
                    })
                elif rating_std < 0.3 and len(user_ratings) >= 3:
                    flags.append({
                        "type": "distribution",
                        "severity": "medium",
                        "message": f"Very low rating variance (std={round(rating_std, 2)})",
                    })

        # 3. Systematic bias — consistently higher/lower than peers
        if user_ratings and global_ratings:
            user_avg = statistics.mean(user_ratings)
            bias = user_avg - global_avg_rating
            if abs(bias) > 1.0 and len(user_ratings) >= 3:
                direction = "higher" if bias > 0 else "lower"
                flags.append({
                    "type": "bias",
                    "severity": "medium",
                    "message": f"Systematic {direction} bias: avg {round(user_avg, 1)} vs global {round(global_avg_rating, 1)}",
                    "detail": f"Deviation: {'+' if bias > 0 else ''}{round(bias, 1)} points",
                })

        # 4. Never flags errors — if everyone else does but this person doesn't
        error_rate = sum(1 for e in user_evals if e.has_critical_error or e.has_minor_error) / len(user_evals) if user_evals else 0
        global_error_rate = sum(1 for e in all_evals if e.has_critical_error or e.has_minor_error) / len(all_evals) if all_evals else 0
        if len(user_evals) >= 3 and error_rate == 0 and global_error_rate > 0.2:
            flags.append({
                "type": "error_detection",
                "severity": "low",
                "message": "Never flagged any errors while global error rate is " + str(round(global_error_rate*100)) + "%",
            })

        # 5. No comments/corrections
        empty_text = sum(1 for e in user_evals if not e.corrections and not e.comments)
        if len(user_evals) >= 5 and empty_text == len(user_evals):
            flags.append({
                "type": "engagement",
                "severity": "low",
                "message": "Never provided any corrections or comments",
            })

        # Rating breakdown
        rating_counts = dict(Counter(user_ratings))

        results.append({
            "user_id": c.id,
            "full_name": c.full_name,
            "evaluation_count": len(user_evals),
            "avg_time_seconds": round(avg_time, 1),
            "avg_rating": round(statistics.mean(user_ratings), 2) if user_ratings else None,
            "rating_std": round(statistics.stdev(user_ratings), 2) if len(user_ratings) >= 2 else None,
            "rating_distribution": rating_counts,
            "error_flag_rate": round(error_rate * 100, 1),
            "flags": flags,
            "flag_count": len(flags),
            "overall_quality": "good" if len(flags) == 0 else ("warning" if all(f["severity"] in ("low", "medium") for f in flags) else "alert"),
        })

    return sorted(results, key=lambda r: -r["flag_count"])


@router.get("/time-distribution")
def time_distribution(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Time spent per evaluation — for histogram visualization."""
    evals = db.query(Evaluation).filter(Evaluation.time_spent_seconds.isnot(None)).all()
    times = []
    for e in evals:
        evaluator = db.query(User).filter(User.id == e.evaluator_id).first()
        case = db.query(Case).filter(Case.id == e.case_id).first()
        output = db.query(CaseOutput).filter(CaseOutput.id == e.output_id).first()
        times.append({
            "evaluation_id": e.id,
            "evaluator": evaluator.full_name if evaluator else "?",
            "case_title": case.title if case else "?",
            "model_name": output.model_name if output else "?",
            "time_seconds": e.time_spent_seconds,
            "overall_rating": e.overall_rating,
            "has_error": e.has_critical_error or e.has_minor_error,
        })
    return times
