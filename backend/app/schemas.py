from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    specialty: Optional[str] = None

    class Config:
        from_attributes = True


# ── Cases ────────────────────────────────────────────────────────────────────

class CaseOutputOut(BaseModel):
    id: int
    model_name: str
    output_text: Optional[str] = None
    image_url: Optional[str] = None
    prediction_folder_name: Optional[str] = None
    display_order: int

    class Config:
        from_attributes = True


class CaseOut(BaseModel):
    id: int
    title: str
    clinical_prompt: str
    modality: Optional[str] = None
    body_region: Optional[str] = None
    patient_age: Optional[str] = None
    patient_sex: Optional[str] = None
    clinical_history: Optional[str] = None
    imaging_folder_name: Optional[str] = None
    outputs: list[CaseOutputOut] = []
    created_at: datetime

    class Config:
        from_attributes = True


class CaseListItem(BaseModel):
    id: int
    title: str
    modality: Optional[str] = None
    body_region: Optional[str] = None
    num_outputs: int = 0
    eval_status: str = "pending"

    class Config:
        from_attributes = True


# ── Imaging ──────────────────────────────────────────────────────────────────

class ImagingSeriesInfo(BaseModel):
    name: str
    slice_count: int


class CaseImagingOut(BaseModel):
    case_id: int
    imaging_folder_name: str
    series: list[ImagingSeriesInfo]


# ── Evaluations ──────────────────────────────────────────────────────────────

class EvaluationCreate(BaseModel):
    output_id: int
    accuracy_rating: Optional[int] = None
    completeness_rating: Optional[int] = None
    clarity_rating: Optional[int] = None
    overall_rating: Optional[int] = None
    has_critical_error: bool = False
    has_minor_error: bool = False
    would_use_clinically: Optional[bool] = None
    error_description: Optional[str] = None
    corrections: Optional[str] = None
    comments: Optional[str] = None
    time_spent_seconds: Optional[int] = None


class EvaluationOut(BaseModel):
    id: int
    case_id: int
    output_id: int
    evaluator_id: int
    accuracy_rating: Optional[int] = None
    completeness_rating: Optional[int] = None
    clarity_rating: Optional[int] = None
    overall_rating: Optional[int] = None
    has_critical_error: bool
    has_minor_error: bool
    would_use_clinically: Optional[bool] = None
    error_description: Optional[str] = None
    corrections: Optional[str] = None
    comments: Optional[str] = None
    time_spent_seconds: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Findings ─────────────────────────────────────────────────────────────────

class FindingCreate(BaseModel):
    location: Optional[str] = None
    finding_type: Optional[str] = None
    severity: Optional[str] = None
    confidence: Optional[float] = None
    description: Optional[str] = None
    is_correct: Optional[bool] = None
    annotation_id: Optional[int] = None


class FindingOut(BaseModel):
    id: int
    evaluation_id: int
    location: Optional[str] = None
    finding_type: Optional[str] = None
    severity: Optional[str] = None
    confidence: Optional[float] = None
    description: Optional[str] = None
    is_correct: Optional[bool] = None
    annotation_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Pairwise ─────────────────────────────────────────────────────────────────

class PairwiseComparisonCreate(BaseModel):
    output_a_id: int
    output_b_id: int
    preferred_id: Optional[int] = None
    preference_strength: Optional[int] = None
    reasoning: Optional[str] = None
    time_spent_seconds: Optional[int] = None


class PairwiseComparisonOut(BaseModel):
    id: int
    case_id: int
    evaluator_id: int
    output_a_id: int
    output_b_id: int
    preferred_id: Optional[int] = None
    preference_strength: Optional[int] = None
    reasoning: Optional[str] = None
    time_spent_seconds: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Annotations ──────────────────────────────────────────────────────────────

class AnnotationCreate(BaseModel):
    case_id: int
    series_name: str
    slice_index: int
    source_type: str = "original"
    model_name: Optional[str] = None
    annotation_data: str   # JSON string
    label: Optional[str] = None
    finding_type: Optional[str] = None
    color: str = "#ff0000"


class AnnotationUpdate(BaseModel):
    annotation_data: Optional[str] = None
    label: Optional[str] = None
    finding_type: Optional[str] = None
    color: Optional[str] = None


class AnnotationOut(BaseModel):
    id: int
    case_id: int
    evaluator_id: int
    series_name: str
    slice_index: int
    source_type: str
    model_name: Optional[str] = None
    annotation_data: str
    label: Optional[str] = None
    finding_type: Optional[str] = None
    color: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    evaluator_name: Optional[str] = None
    case_title: Optional[str] = None

    class Config:
        from_attributes = True


# ── Admin ────────────────────────────────────────────────────────────────────

class AdminStats(BaseModel):
    total_cases: int
    total_evaluations: int
    total_comparisons: int
    total_evaluators: int
    evaluations_per_case: float
    cases_fully_evaluated: int
    avg_time_per_evaluation: Optional[float] = None


class AnnotatorActivity(BaseModel):
    evaluator_id: int
    full_name: str
    evaluations_count: int
    comparisons_count: int
    avg_overall_rating: Optional[float] = None
    last_active: Optional[datetime] = None


class AgreementMetrics(BaseModel):
    case_id: int
    case_title: str
    num_evaluators: int
    mean_overall_rating: Optional[float] = None
    std_overall_rating: Optional[float] = None
    agreement_score: Optional[float] = None


TokenResponse.model_rebuild()
