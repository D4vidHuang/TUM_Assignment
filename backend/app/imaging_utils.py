"""Shared imaging utilities for scanning data directories."""
import os
import urllib.parse

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
MODEL_PREDICTIONS_DIR = os.getenv("MODEL_PREDICTIONS_DIR", "/app/model_predictions")


def sorted_slices(series_path: str) -> list[str]:
    """Return slice filenames sorted numerically (000.jpg < 001.jpg)."""
    if not os.path.isdir(series_path):
        return []
    files = [
        f for f in os.listdir(series_path)
        if f.lower().endswith((".jpg", ".jpeg", ".png")) and not f.startswith(".")
    ]

    def sort_key(name: str):
        stem = os.path.splitext(name)[0]
        try:
            return (0, int(stem))
        except ValueError:
            return (1, stem)

    return sorted(files, key=sort_key)


def scan_imaging_case(base_dir: str, case_folder: str) -> dict | None:
    """Scan a case directory and return series info.

    Returns: {"name": str, "series": [{"name", "slice_count", "thumbnail"}]} or None
    """
    case_path = os.path.join(base_dir, case_folder)
    if not os.path.isdir(case_path):
        return None
    series_list = []
    for series_name in sorted(os.listdir(case_path)):
        if series_name.startswith("."):
            continue
        series_path = os.path.join(case_path, series_name)
        if not os.path.isdir(series_path):
            continue
        slices = sorted_slices(series_path)
        if slices:
            series_list.append({
                "name": series_name,
                "slice_count": len(slices),
            })
    if not series_list:
        return None
    return {"name": case_folder, "series": series_list}


def scan_all_cases(base_dir: str) -> list[dict]:
    """Scan base_dir for all imaging cases."""
    if not os.path.isdir(base_dir):
        return []
    result = []
    for case_name in sorted(os.listdir(base_dir)):
        if case_name.startswith("."):
            continue
        info = scan_imaging_case(base_dir, case_name)
        if info:
            result.append(info)
    return result


def scan_model_predictions() -> list[dict]:
    """Scan model_predictions/ directory. Returns list of {name, cases: [...]}."""
    if not os.path.isdir(MODEL_PREDICTIONS_DIR):
        return []
    result = []
    for model_name in sorted(os.listdir(MODEL_PREDICTIONS_DIR)):
        if model_name.startswith("."):
            continue
        model_path = os.path.join(MODEL_PREDICTIONS_DIR, model_name)
        if not os.path.isdir(model_path):
            continue
        cases = scan_all_cases(model_path)
        if cases:
            result.append({"name": model_name, "cases": cases})
    return result
