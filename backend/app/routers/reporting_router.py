"""Structured reporting templates — BI-RADS, LI-RADS, Lung-RADS, PI-RADS."""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models import StructuredReport, Evaluation, User
from ..auth import get_current_user

router = APIRouter(prefix="/api/reporting", tags=["reporting"])

# ── Template Definitions ─────────────────────────────────────────────────────

TEMPLATES = {
    "BI-RADS": {
        "name": "BI-RADS",
        "full_name": "Breast Imaging Reporting and Data System",
        "modalities": ["Mammography", "Ultrasound", "MRI"],
        "categories": [
            {"value": "0", "label": "Incomplete", "description": "Need additional imaging evaluation", "color": "#6b7280"},
            {"value": "1", "label": "Negative", "description": "No finding, routine screening", "color": "#22c55e"},
            {"value": "2", "label": "Benign", "description": "Definitively benign finding", "color": "#22c55e"},
            {"value": "3", "label": "Probably Benign", "description": "<2% likelihood of malignancy, short-interval follow-up", "color": "#eab308"},
            {"value": "4A", "label": "Low Suspicion", "description": "2-10% likelihood of malignancy", "color": "#f97316"},
            {"value": "4B", "label": "Moderate Suspicion", "description": "10-50% likelihood of malignancy", "color": "#f97316"},
            {"value": "4C", "label": "High Suspicion", "description": "50-95% likelihood of malignancy", "color": "#ef4444"},
            {"value": "5", "label": "Highly Suggestive", "description": ">95% likelihood of malignancy", "color": "#dc2626"},
            {"value": "6", "label": "Known Malignancy", "description": "Biopsy-proven malignancy", "color": "#991b1b"},
        ],
        "fields": [
            {"key": "breast_composition", "label": "Breast Composition", "type": "select",
             "options": ["a: Almost entirely fatty", "b: Scattered fibroglandular", "c: Heterogeneously dense", "d: Extremely dense"]},
            {"key": "mass_shape", "label": "Mass Shape", "type": "select",
             "options": ["Oval", "Round", "Irregular", "N/A"]},
            {"key": "mass_margin", "label": "Mass Margin", "type": "select",
             "options": ["Circumscribed", "Obscured", "Microlobulated", "Indistinct", "Spiculated", "N/A"]},
            {"key": "mass_density", "label": "Mass Density", "type": "select",
             "options": ["High density", "Equal density", "Low density", "Fat-containing", "N/A"]},
            {"key": "calcifications", "label": "Calcifications", "type": "select",
             "options": ["None", "Typically benign", "Suspicious morphology", "N/A"]},
            {"key": "laterality", "label": "Laterality", "type": "select",
             "options": ["Right", "Left", "Bilateral"]},
            {"key": "size_mm", "label": "Size (mm)", "type": "number"},
        ],
    },
    "LI-RADS": {
        "name": "LI-RADS",
        "full_name": "Liver Imaging Reporting and Data System",
        "modalities": ["CT", "MRI"],
        "categories": [
            {"value": "LR-NC", "label": "Non-categorizable", "description": "Image quality insufficient", "color": "#6b7280"},
            {"value": "LR-1", "label": "Definitely Benign", "description": "100% certainty benign", "color": "#22c55e"},
            {"value": "LR-2", "label": "Probably Benign", "description": "High probability benign", "color": "#22c55e"},
            {"value": "LR-3", "label": "Intermediate", "description": "Moderate probability of HCC", "color": "#eab308"},
            {"value": "LR-4", "label": "Probably HCC", "description": "High probability of HCC", "color": "#f97316"},
            {"value": "LR-5", "label": "Definitely HCC", "description": "100% certainty HCC (meets all major criteria)", "color": "#dc2626"},
            {"value": "LR-M", "label": "Probably Malignant", "description": "Probably or definitely malignant, not HCC-specific", "color": "#991b1b"},
            {"value": "LR-TIV", "label": "Tumor in Vein", "description": "Definite tumor in vein", "color": "#7f1d1d"},
        ],
        "fields": [
            {"key": "observation_size", "label": "Observation Size (mm)", "type": "number"},
            {"key": "aphe", "label": "Arterial Phase Hyperenhancement (APHE)", "type": "select",
             "options": ["None", "Non-rim APHE", "Rim APHE"]},
            {"key": "washout", "label": "Washout Appearance", "type": "select",
             "options": ["Absent", "Present (non-peripheral)", "Present (peripheral)"]},
            {"key": "capsule", "label": "Enhancing Capsule", "type": "select",
             "options": ["Absent", "Present"]},
            {"key": "threshold_growth", "label": "Threshold Growth", "type": "select",
             "options": ["Not applicable", "Present", "Absent"]},
            {"key": "segment", "label": "Liver Segment", "type": "select",
             "options": ["I", "II", "III", "IVa", "IVb", "V", "VI", "VII", "VIII"]},
        ],
    },
    "Lung-RADS": {
        "name": "Lung-RADS",
        "full_name": "Lung CT Screening Reporting and Data System",
        "modalities": ["CT"],
        "categories": [
            {"value": "0", "label": "Incomplete", "description": "Prior CT unavailable or uninterpretable", "color": "#6b7280"},
            {"value": "1", "label": "Negative", "description": "No nodules, definitively benign", "color": "#22c55e"},
            {"value": "2", "label": "Benign", "description": "Nodules with low risk, annual screening", "color": "#22c55e"},
            {"value": "3", "label": "Probably Benign", "description": "Probably benign, 6-month follow-up", "color": "#eab308"},
            {"value": "4A", "label": "Suspicious", "description": "Suspicious, 3-month follow-up", "color": "#f97316"},
            {"value": "4B", "label": "Very Suspicious", "description": "Very suspicious, tissue sampling or PET-CT", "color": "#ef4444"},
            {"value": "4X", "label": "Additional Features", "description": "Category 3-4B with additional suspicious features", "color": "#dc2626"},
        ],
        "fields": [
            {"key": "nodule_type", "label": "Nodule Type", "type": "select",
             "options": ["Solid", "Part-solid", "Ground glass (GGN)", "None"]},
            {"key": "nodule_size", "label": "Nodule Size (mm)", "type": "number"},
            {"key": "location", "label": "Location", "type": "select",
             "options": ["RUL", "RML", "RLL", "LUL", "Lingula", "LLL"]},
            {"key": "margin", "label": "Margin", "type": "select",
             "options": ["Smooth", "Lobulated", "Irregular", "Spiculated"]},
            {"key": "growth_rate", "label": "Growth Rate", "type": "select",
             "options": ["New", "Stable", "Slow growth", "Fast growth", "N/A"]},
            {"key": "perifissural", "label": "Perifissural", "type": "select",
             "options": ["Yes", "No"]},
        ],
    },
    "PI-RADS": {
        "name": "PI-RADS",
        "full_name": "Prostate Imaging Reporting and Data System",
        "modalities": ["MRI"],
        "categories": [
            {"value": "1", "label": "Very Low", "description": "Very low probability of clinically significant cancer", "color": "#22c55e"},
            {"value": "2", "label": "Low", "description": "Low probability", "color": "#22c55e"},
            {"value": "3", "label": "Intermediate", "description": "Equivocal, clinically significant cancer uncertain", "color": "#eab308"},
            {"value": "4", "label": "High", "description": "High probability of clinically significant cancer", "color": "#f97316"},
            {"value": "5", "label": "Very High", "description": "Very high probability", "color": "#dc2626"},
        ],
        "fields": [
            {"key": "zone", "label": "Zone", "type": "select",
             "options": ["Peripheral zone (PZ)", "Transition zone (TZ)", "Central zone", "Anterior fibromuscular stroma"]},
            {"key": "t2_signal", "label": "T2 Signal", "type": "select",
             "options": ["Normal", "Mildly hypointense", "Moderately hypointense", "Markedly hypointense"]},
            {"key": "dwi_score", "label": "DWI Score", "type": "select",
             "options": ["1 - Normal", "2 - Indistinct hypointense", "3 - Mild/moderate hyperintense", "4 - Markedly hyperintense", "5 - Focal, markedly hyperintense"]},
            {"key": "dce", "label": "DCE Enhancement", "type": "select",
             "options": ["Negative", "Positive (focal, early)", "N/A"]},
            {"key": "lesion_size", "label": "Lesion Size (mm)", "type": "number"},
            {"key": "epe", "label": "Extraprostatic Extension", "type": "select",
             "options": ["None", "Suspected", "Definite"]},
        ],
    },
}


@router.get("/templates")
def get_templates(user: User = Depends(get_current_user)):
    """Return all available structured reporting templates."""
    return {k: {**v, "fields": v["fields"]} for k, v in TEMPLATES.items()}


@router.get("/templates/{template_type}")
def get_template(template_type: str, user: User = Depends(get_current_user)):
    t = TEMPLATES.get(template_type)
    if not t:
        raise HTTPException(404, f"Template '{template_type}' not found. Available: {list(TEMPLATES.keys())}")
    return t


class StructuredReportCreate(BaseModel):
    evaluation_id: int
    template_type: str
    category: str
    category_label: Optional[str] = None
    structured_data: Optional[str] = None  # JSON
    model_category: Optional[str] = None
    category_agrees: Optional[bool] = None
    category_override: Optional[str] = None
    notes: Optional[str] = None


@router.post("/reports")
def create_report(
    data: StructuredReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate evaluation exists
    ev = db.query(Evaluation).filter(Evaluation.id == data.evaluation_id).first()
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if ev.evaluator_id != user.id:
        raise HTTPException(403, "Can only create reports for your own evaluations")
    if data.template_type not in TEMPLATES:
        raise HTTPException(400, f"Invalid template: {data.template_type}")

    # Validate structured_data JSON
    if data.structured_data:
        try:
            json.loads(data.structured_data)
        except json.JSONDecodeError:
            raise HTTPException(400, "structured_data must be valid JSON")

    # Check for existing report
    existing = db.query(StructuredReport).filter(
        StructuredReport.evaluation_id == data.evaluation_id
    ).first()
    if existing:
        # Update existing
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return _report_to_dict(existing)

    report = StructuredReport(**data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return _report_to_dict(report)


@router.get("/reports/evaluation/{evaluation_id}")
def get_evaluation_report(
    evaluation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    report = db.query(StructuredReport).filter(
        StructuredReport.evaluation_id == evaluation_id
    ).first()
    if not report:
        return None
    return _report_to_dict(report)


def _report_to_dict(r: StructuredReport) -> dict:
    return {
        "id": r.id,
        "evaluation_id": r.evaluation_id,
        "template_type": r.template_type,
        "category": r.category,
        "category_label": r.category_label,
        "structured_data": r.structured_data,
        "model_category": r.model_category,
        "category_agrees": r.category_agrees,
        "category_override": r.category_override,
        "notes": r.notes,
        "created_at": r.created_at,
    }
