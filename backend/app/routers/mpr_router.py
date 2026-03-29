"""MPR (Multi-Planar Reconstruction) — generate sagittal/coronal views from axial stacks.

MPR only makes sense when Z-resolution is adequate (≥50 slices).
For thin-slice CT (100-500 slices), the reconstructions are clinically useful.
For thick-slice MRI (20-30 slices), Z-resolution is too low for meaningful MPR.
"""
import os
import io
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from PIL import Image
import numpy as np

from ..auth import get_current_user, SECRET_KEY, ALGORITHM
from ..imaging_utils import DATA_DIR, sorted_slices
from ..models import User
from jose import JWTError, jwt

router = APIRouter(prefix="/api/mpr", tags=["mpr"])

MIN_SLICES_FOR_MPR = 50  # minimum axial slices needed for useful reconstruction


def _verify_token(token: str) -> bool:
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return True
    except (JWTError, Exception):
        return False


@router.get("/info/{case_name}/{series_name}")
def get_mpr_info(case_name: str, series_name: str,
                 user: User = Depends(get_current_user)):
    """Return volume dimensions and MPR feasibility."""
    series_path = os.path.join(DATA_DIR, case_name, series_name)
    slices = sorted_slices(series_path)
    if not slices:
        raise HTTPException(404, "Series not found")

    first = Image.open(os.path.join(series_path, slices[0]))
    w, h = first.size
    z = len(slices)

    return {
        "axial_count": z,
        "width": w,
        "height": h,
        "mpr_feasible": z >= MIN_SLICES_FOR_MPR,
        "sagittal_count": w,
        "coronal_count": h,
        "message": None if z >= MIN_SLICES_FOR_MPR else
            f"This series has only {z} slices. MPR requires ≥{MIN_SLICES_FOR_MPR} slices for meaningful reconstruction. Try a thinner-slice series.",
    }


@router.get("/slice/{case_name}/{series_name}/{plane}/{index}")
def get_mpr_slice(case_name: str, series_name: str, plane: str, index: int,
                  token: str = Query(...)):
    """Generate a reconstructed slice in the requested plane.

    For sagittal/coronal, we read pixel columns/rows across all axial slices
    to form a 2D image. The Z-axis is interpolated to improve quality.
    """
    if not _verify_token(token):
        raise HTTPException(401, "Invalid token")
    if plane not in ("axial", "sagittal", "coronal"):
        raise HTTPException(400, "Plane must be axial, sagittal, or coronal")

    series_path = os.path.join(DATA_DIR, case_name, series_name)
    slices_list = sorted_slices(series_path)
    if not slices_list:
        raise HTTPException(404, "Series not found")

    z_count = len(slices_list)

    if plane == "axial":
        idx = max(0, min(index, z_count - 1))
        img = Image.open(os.path.join(series_path, slices_list[idx]))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85)
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/jpeg",
                                 headers={"Cache-Control": "public, max-age=3600"})

    if z_count < MIN_SLICES_FOR_MPR:
        raise HTTPException(400,
            f"MPR requires ≥{MIN_SLICES_FOR_MPR} axial slices. This series has {z_count}.")

    # Load all slices into volume
    images = []
    for s in slices_list:
        img = Image.open(os.path.join(series_path, s)).convert('L')
        images.append(np.array(img))
    volume = np.stack(images, axis=0)  # (Z, H, W)
    z, h, w = volume.shape

    if plane == "sagittal":
        idx = max(0, min(index, w - 1))
        recon = volume[:, :, idx]  # (Z, H)
    else:  # coronal
        idx = max(0, min(index, h - 1))
        recon = volume[:, idx, :]  # (Z, W)

    # Flip so superior is at top
    recon = np.flipud(recon)

    # Convert to image
    img = Image.fromarray(recon.astype(np.uint8), mode='L')

    # Interpolate Z-axis to create square-ish pixels
    # Estimate: typical CT slice thickness ~2-3mm, pixel spacing ~0.5mm
    # So Z needs to be scaled by roughly (slice_thickness / pixel_spacing) ≈ 4-6x
    # We use the ratio of (image_dimension / z_count) to auto-estimate
    if plane == "sagittal":
        target_aspect = h  # sagittal should be roughly as tall as the axial image height
    else:
        target_aspect = w  # coronal should be roughly as wide as the axial image width

    # Scale Z to make the image roughly square in clinical proportions
    z_scale = max(1, round(target_aspect / z))
    new_h = z * z_scale
    img = img.resize((img.width, new_h), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg",
                             headers={"Cache-Control": "public, max-age=3600"})
