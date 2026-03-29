"""Serve multi-slice imaging data, model predictions, and heatmaps/saliency maps."""
import os
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from ..auth import get_current_user, SECRET_KEY, ALGORITHM
from ..imaging_utils import DATA_DIR, MODEL_PREDICTIONS_DIR, sorted_slices, scan_all_cases, scan_model_predictions
from ..models import User

HEATMAPS_DIR = os.getenv("HEATMAPS_DIR", "/app/heatmaps")

router = APIRouter(prefix="/api/imaging", tags=["imaging"])


def _verify_token(token: str) -> bool:
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return True
    except (JWTError, Exception):
        return False


@router.get("/")
def list_cases(user: User = Depends(get_current_user)):
    return scan_all_cases(DATA_DIR)


@router.get("/models")
def list_model_predictions(user: User = Depends(get_current_user)):
    return scan_model_predictions()


@router.get("/heatmaps")
def list_heatmap_models(user: User = Depends(get_current_user)):
    """List available heatmap/saliency map overlays."""
    if not os.path.isdir(HEATMAPS_DIR):
        return []
    result = []
    for model_name in sorted(os.listdir(HEATMAPS_DIR)):
        if model_name.startswith("."):
            continue
        model_path = os.path.join(HEATMAPS_DIR, model_name)
        if os.path.isdir(model_path):
            cases = scan_all_cases(model_path)
            if cases:
                result.append({"name": model_name, "cases": cases})
    return result


@router.get("/{case_name}/{series_name}/slice/{index}")
def get_slice(case_name: str, series_name: str, index: int,
              token: str = Query(...)):
    if not _verify_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")
    series_path = os.path.join(DATA_DIR, case_name, series_name)
    if not os.path.isdir(series_path):
        raise HTTPException(status_code=404, detail="Series not found")
    slices = sorted_slices(series_path)
    if not slices:
        raise HTTPException(status_code=404, detail="No slices")
    idx = max(0, min(index, len(slices) - 1))
    return FileResponse(
        os.path.join(series_path, slices[idx]),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/predictions/{model_name}/{case_name}/{series_name}/slice/{index}")
def get_prediction_slice(model_name: str, case_name: str, series_name: str,
                         index: int, token: str = Query(...)):
    if not _verify_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")
    series_path = os.path.join(MODEL_PREDICTIONS_DIR, model_name, case_name, series_name)
    if not os.path.isdir(series_path):
        raise HTTPException(status_code=404, detail="Prediction series not found")
    slices = sorted_slices(series_path)
    if not slices:
        raise HTTPException(status_code=404, detail="No slices")
    idx = max(0, min(index, len(slices) - 1))
    return FileResponse(
        os.path.join(series_path, slices[idx]),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/heatmaps/{model_name}/{case_name}/{series_name}/slice/{index}")
def get_heatmap_slice(model_name: str, case_name: str, series_name: str,
                      index: int, token: str = Query(...)):
    """Serve a heatmap/saliency map PNG overlay for a specific slice."""
    if not _verify_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")
    series_path = os.path.join(HEATMAPS_DIR, model_name, case_name, series_name)
    if not os.path.isdir(series_path):
        raise HTTPException(status_code=404, detail="Heatmap series not found")
    slices = sorted_slices(series_path)
    if not slices:
        raise HTTPException(status_code=404, detail="No heatmap slices")
    idx = max(0, min(index, len(slices) - 1))
    return FileResponse(
        os.path.join(series_path, slices[idx]),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
