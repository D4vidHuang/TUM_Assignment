from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os

from .database import engine, SessionLocal, Base
from .models import *  # noqa - ensure all models are registered
from .seed_data import seed
from .routers import (
    auth_router, cases_router, evaluations_router,
    admin_router, imaging_router, annotations_router, export_router,
    groups_router, llm_router, collab_router, reporting_router,
    mpr_router, conference_router, qc_router,
)

app = FastAPI(title="ClinEval - Clinical Model Evaluation Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(cases_router.router)
app.include_router(evaluations_router.router)
app.include_router(admin_router.router)
app.include_router(imaging_router.router)
app.include_router(annotations_router.router)
app.include_router(export_router.router)
app.include_router(groups_router.router)
app.include_router(llm_router.router)
app.include_router(collab_router.router)
app.include_router(reporting_router.router)
app.include_router(mpr_router.router)
app.include_router(conference_router.rest_router)
app.include_router(conference_router.router)
app.include_router(qc_router.router)

IMAGES_DIR = os.path.join(os.path.dirname(__file__), "sample_images")
os.makedirs(IMAGES_DIR, exist_ok=True)


@app.get("/api/images/{filename}")
async def get_image(filename: str):
    path = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path)
    return FileResponse(os.path.join(IMAGES_DIR, "placeholder.svg"), media_type="image/svg+xml")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
