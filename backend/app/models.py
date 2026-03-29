import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean, Enum as SAEnum,
    Table,
)
from sqlalchemy.orm import relationship
import enum

from .database import Base


# ── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    CLINICIAN = "clinician"
    ADMIN = "admin"


class EvalStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


# ── Association tables ───────────────────────────────────────────────────────

group_members = Table(
    "group_members", Base.metadata,
    Column("group_id", Integer, ForeignKey("research_groups.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)

group_cases = Table(
    "group_cases", Base.metadata,
    Column("group_id", Integer, ForeignKey("research_groups.id"), primary_key=True),
    Column("case_id", Integer, ForeignKey("cases.id"), primary_key=True),
)


# ── ResearchGroup (身份组 — like a Zotero library/team) ──────────────────────

class ResearchGroup(Base):
    __tablename__ = "research_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False)
    description = Column(Text)
    color = Column(String(20), default="#3b82f6")  # group accent color

    # LLM configuration for this group
    llm_provider = Column(String(100))    # "openai" | "anthropic" | "custom"
    llm_api_key = Column(String(500))     # encrypted in production
    llm_api_url = Column(String(500))     # custom endpoint URL
    llm_model_name = Column(String(200))  # e.g. "gpt-4o", "claude-sonnet-4-20250514"

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("User", secondary=group_members, back_populates="groups")
    cases = relationship("Case", secondary=group_cases, back_populates="groups")


# ── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.CLINICIAN, nullable=False)
    specialty = Column(String(200))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    evaluations = relationship("Evaluation", back_populates="evaluator")
    pairwise_comparisons = relationship("PairwiseComparison", back_populates="evaluator")
    annotations = relationship("Annotation", back_populates="evaluator")
    groups = relationship("ResearchGroup", secondary=group_members, back_populates="members")
    llm_queries = relationship("LLMQuery", back_populates="user")


# ── Case ─────────────────────────────────────────────────────────────────────

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    clinical_prompt = Column(Text, nullable=False)
    modality = Column(String(100))
    body_region = Column(String(100))
    patient_age = Column(String(20))
    patient_sex = Column(String(10))
    clinical_history = Column(Text)
    ground_truth = Column(Text)
    imaging_folder_name = Column(String(500))
    tags = Column(String(500))  # comma-separated tags for library organization
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    outputs = relationship("CaseOutput", back_populates="case", order_by="CaseOutput.display_order")
    evaluations = relationship("Evaluation", back_populates="case")
    pairwise_comparisons = relationship("PairwiseComparison", back_populates="case")
    annotations = relationship("Annotation", back_populates="case")
    groups = relationship("ResearchGroup", secondary=group_cases, back_populates="cases")


# ── CaseOutput ───────────────────────────────────────────────────────────────

class CaseOutput(Base):
    __tablename__ = "case_outputs"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    model_name = Column(String(200), nullable=False)
    output_text = Column(Text)
    image_url = Column(String(500))
    prediction_folder_name = Column(String(500))
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="outputs")
    evaluations = relationship("Evaluation", back_populates="output")


# ── Evaluation ───────────────────────────────────────────────────────────────

class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    output_id = Column(Integer, ForeignKey("case_outputs.id"), nullable=False)
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    accuracy_rating = Column(Integer)
    completeness_rating = Column(Integer)
    clarity_rating = Column(Integer)
    overall_rating = Column(Integer)

    has_critical_error = Column(Boolean, default=False)
    has_minor_error = Column(Boolean, default=False)
    would_use_clinically = Column(Boolean)

    error_description = Column(Text)
    corrections = Column(Text)
    comments = Column(Text)

    status = Column(SAEnum(EvalStatus), default=EvalStatus.COMPLETED)
    time_spent_seconds = Column(Integer)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="evaluations")
    output = relationship("CaseOutput", back_populates="evaluations")
    evaluator = relationship("User", back_populates="evaluations")
    findings = relationship("Finding", back_populates="evaluation", cascade="all, delete-orphan")


# ── Finding ──────────────────────────────────────────────────────────────────

class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("evaluations.id"), nullable=False)
    location = Column(String(200))
    finding_type = Column(String(200))
    severity = Column(String(50))
    confidence = Column(Float)
    description = Column(Text)
    is_correct = Column(Boolean)
    annotation_id = Column(Integer, ForeignKey("annotations.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    evaluation = relationship("Evaluation", back_populates="findings")
    annotation = relationship("Annotation", back_populates="findings")


# ── PairwiseComparison ───────────────────────────────────────────────────────

class PairwiseComparison(Base):
    __tablename__ = "pairwise_comparisons"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    output_a_id = Column(Integer, ForeignKey("case_outputs.id"), nullable=False)
    output_b_id = Column(Integer, ForeignKey("case_outputs.id"), nullable=False)
    preferred_id = Column(Integer, ForeignKey("case_outputs.id"))
    preference_strength = Column(Integer)

    reasoning = Column(Text)
    time_spent_seconds = Column(Integer)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="pairwise_comparisons")
    evaluator = relationship("User", back_populates="pairwise_comparisons")
    output_a = relationship("CaseOutput", foreign_keys=[output_a_id])
    output_b = relationship("CaseOutput", foreign_keys=[output_b_id])


# ── Annotation ───────────────────────────────────────────────────────────────

class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    series_name = Column(String(300), nullable=False)
    slice_index = Column(Integer, nullable=False)
    source_type = Column(String(50), default="original")
    model_name = Column(String(200))

    annotation_data = Column(Text, nullable=False)

    label = Column(String(500))
    finding_type = Column(String(100))
    color = Column(String(20), default="#ff0000")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="annotations")
    evaluator = relationship("User", back_populates="annotations")
    findings = relationship("Finding", back_populates="annotation")


# ── LLMQuery (AI assist query log) ──────────────────────────────────────────

class LLMQuery(Base):
    __tablename__ = "llm_queries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("research_groups.id"), nullable=False)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)

    series_name = Column(String(300))
    slice_index = Column(Integer)
    region_data = Column(Text)     # JSON: {x, y, w, h} normalized coords of selected region
    query_text = Column(Text)      # user's question
    context_text = Column(Text)    # auto-assembled clinical context sent to model

    response_text = Column(Text)   # model's response
    model_used = Column(String(200))
    latency_ms = Column(Integer)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="llm_queries")
    group = relationship("ResearchGroup")
    case = relationship("Case")


# ── StructuredReport (BI-RADS / LI-RADS / Lung-RADS standardized evaluation) ─

class StructuredReport(Base):
    __tablename__ = "structured_reports"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("evaluations.id"), nullable=False)
    template_type = Column(String(50), nullable=False)  # "BI-RADS", "LI-RADS", "Lung-RADS", "PI-RADS"

    # Standard classification
    category = Column(String(20))         # e.g. "4C", "LR-5", "4B"
    category_label = Column(String(200))  # e.g. "High suspicion for malignancy"

    # Template-specific structured fields stored as JSON
    structured_data = Column(Text)  # JSON with template-specific fields

    # Model assessment
    model_category = Column(String(20))       # what the model predicted
    category_agrees = Column(Boolean)         # does evaluator agree with model?
    category_override = Column(String(20))    # evaluator's corrected category if disagrees

    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    evaluation = relationship("Evaluation")
