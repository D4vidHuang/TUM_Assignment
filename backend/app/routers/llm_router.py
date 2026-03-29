"""LLM AI assist — proxy queries to group-configured multimodal models."""
import json
import time
import base64
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models import ResearchGroup, User, Case, LLMQuery
from ..auth import get_current_user
from ..imaging_utils import DATA_DIR, sorted_slices

router = APIRouter(prefix="/api/llm", tags=["llm"])


class LLMAssistRequest(BaseModel):
    group_id: int
    case_id: int
    series_name: str
    slice_index: int
    region: Optional[dict] = None   # {x, y, w, h} normalized 0-1
    query: str = "Analyze this region and identify any abnormalities."


def _get_slice_image_base64(case: Case, series_name: str, slice_index: int) -> Optional[str]:
    """Read a slice image from disk and return as base64."""
    if not case.imaging_folder_name:
        return None
    series_path = os.path.join(DATA_DIR, case.imaging_folder_name, series_name)
    slices = sorted_slices(series_path)
    if not slices:
        return None
    idx = max(0, min(slice_index, len(slices) - 1))
    file_path = os.path.join(series_path, slices[idx])
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _build_prompt(case: Case, series_name: str, slice_index: int, region: Optional[dict], query: str) -> str:
    """Build the clinical context prompt."""
    parts = [
        f"Clinical Case: {case.title}",
        f"Modality: {case.modality or 'Unknown'}",
        f"Body Region: {case.body_region or 'Unknown'}",
        f"Patient: {case.patient_age or '?'} y/o {case.patient_sex or '?'}",
        f"\nClinical Prompt: {case.clinical_prompt}",
    ]
    if case.clinical_history:
        parts.append(f"\nClinical History: {case.clinical_history}")
    parts.append(f"\nCurrent View: {series_name}, Slice {slice_index + 1}")
    if region:
        parts.append(f"Selected Region: x={region.get('x', 0):.2f}, y={region.get('y', 0):.2f}, "
                      f"w={region.get('w', 1):.2f}, h={region.get('h', 1):.2f} (normalized coordinates)")
    parts.append(f"\nUser Question: {query}")
    parts.append("\nPlease provide a detailed radiological analysis. If a specific region is highlighted, "
                 "focus your analysis on that area. Identify any abnormalities, provide differential diagnoses, "
                 "and suggest follow-up if appropriate.")
    return "\n".join(parts)


async def _call_openai_compatible(api_url: str, api_key: str, model: str,
                                   prompt: str, image_b64: Optional[str]) -> str:
    """Call OpenAI-compatible API (OpenAI, Azure, or any compatible endpoint)."""
    messages = []
    content = []
    content.append({"type": "text", "text": prompt})
    if image_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"},
        })
    messages.append({"role": "user", "content": content})

    url = api_url.rstrip("/")
    if not url.endswith("/chat/completions"):
        url += "/chat/completions"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": 2000},
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"LLM API error: {resp.status_code} — {resp.text[:200]}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _call_anthropic(api_key: str, model: str, prompt: str, image_b64: Optional[str]) -> str:
    """Call Anthropic Claude API."""
    content = []
    if image_b64:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64},
        })
    content.append({"type": "text", "text": prompt})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={"model": model, "max_tokens": 2000, "messages": [{"role": "user", "content": content}]},
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"Anthropic API error: {resp.status_code} — {resp.text[:200]}")
        data = resp.json()
        return data["content"][0]["text"]


@router.post("/assist")
async def llm_assist(
    req: LLMAssistRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a region-of-interest query to the group's configured LLM."""
    # Verify group membership
    group = db.query(ResearchGroup).filter(ResearchGroup.id == req.group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    if user not in group.members and user.role.value != "admin":
        raise HTTPException(403, "Not a member of this group")

    # Check LLM configuration
    if not group.llm_api_key:
        raise HTTPException(400, "No LLM API configured for this group. Ask your group admin to set it up.")

    # Get case
    case = db.query(Case).filter(Case.id == req.case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")

    # Build prompt and get image
    prompt = _build_prompt(case, req.series_name, req.slice_index, req.region, req.query)
    image_b64 = _get_slice_image_base64(case, req.series_name, req.slice_index)

    # Call LLM
    start = time.time()
    provider = (group.llm_provider or "openai").lower()
    try:
        if provider == "anthropic":
            response_text = await _call_anthropic(
                group.llm_api_key, group.llm_model_name or "claude-sonnet-4-20250514",
                prompt, image_b64,
            )
        else:
            # OpenAI-compatible (openai, custom, azure, etc.)
            api_url = group.llm_api_url or "https://api.openai.com/v1"
            response_text = await _call_openai_compatible(
                api_url, group.llm_api_key, group.llm_model_name or "gpt-4o",
                prompt, image_b64,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"LLM call failed: {str(e)}")

    latency_ms = int((time.time() - start) * 1000)

    # Log query
    query_record = LLMQuery(
        user_id=user.id, group_id=group.id, case_id=case.id,
        series_name=req.series_name, slice_index=req.slice_index,
        region_data=json.dumps(req.region) if req.region else None,
        query_text=req.query, context_text=prompt,
        response_text=response_text, model_used=group.llm_model_name or provider,
        latency_ms=latency_ms,
    )
    db.add(query_record)
    db.commit()
    db.refresh(query_record)

    return {
        "id": query_record.id,
        "response": response_text,
        "model": group.llm_model_name or provider,
        "latency_ms": latency_ms,
    }


@router.get("/history/{case_id}")
def get_query_history(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get LLM query history for a case."""
    queries = (
        db.query(LLMQuery)
        .filter(LLMQuery.case_id == case_id)
        .order_by(LLMQuery.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": q.id,
            "user_name": q.user.full_name if q.user else "Unknown",
            "query_text": q.query_text,
            "response_text": q.response_text,
            "model_used": q.model_used,
            "series_name": q.series_name,
            "slice_index": q.slice_index,
            "region_data": json.loads(q.region_data) if q.region_data else None,
            "latency_ms": q.latency_ms,
            "created_at": q.created_at,
        }
        for q in queries
    ]
