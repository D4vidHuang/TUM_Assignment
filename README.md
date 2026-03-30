# ClinEval — Clinical Model Evaluation Platform

> A full-featured containerized web application for radiologists to evaluate multimodal clinical AI model outputs. Built for the SP3/DECIPHER-M project to collect structured feedback for preference optimization pipelines.

```
docker compose up
```

Then open **<http://localhost:3000>**. That's it.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Demo Accounts](#demo-accounts)
- [Feature Overview](#feature-overview)
- [Detailed Feature Guide](#detailed-feature-guide)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Data & Imaging](#data--imaging)
- [API Reference](#api-reference)
- [Development Guide](#development-guide)
- [Adding New Features](#adding-new-features)

---

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Port 3000 (frontend) and 8000 (backend) available

### Launch

```bash
git clone <https://github.com/D4vidHuang/TUM_Assignment.git>
cd TUM_Assignment
docker compose up
```

First startup takes ~30 seconds (building images, initializing database, seeding demo data). Subsequent starts are instant.

### What happens on first launch

```
┌─────────────────────────────────────────────────────┐
│  docker compose up                                  │
│                                                     │
│  1. PostgreSQL starts + health check passes         │
│  2. Backend builds (FastAPI + Python deps)           │
│  3. Backend creates all 10 database tables           │
│  4. Seed script populates:                           │
│     • 4 demo users (1 admin + 3 clinicians)         │
│     • 3 clinical cases linked to real imaging data  │
│     • 8 AI model outputs (varying quality reports)  │
│     • 2 research groups with member assignments     │
│  5. Frontend builds (React + Vite → nginx)          │
│  6. Ready at http://localhost:3000                   │
└─────────────────────────────────────────────────────┘
```

### Reset everything

```bash
docker compose down -v    # removes database volume
docker compose up         # fresh start with re-seeded data
```

---

## Demo Accounts

| Username    | Password   | Role      | Groups                                |
|-------------|------------|-----------|---------------------------------------|
| `admin`     | `admin123` | Admin     | Neuroradiology Lab, Body Imaging Lab  |
| `dr.smith`  | `password` | Clinician | Neuroradiology Lab                    |
| `dr.chen`   | `password` | Clinician | Body Imaging Lab                      |
| `dr.garcia` | `password` | Clinician | Body Imaging Lab                      |

> Admin users see extra navigation: **Admin**, **QC** dashboards. All users see: **Cases**, **Annotations**, **Groups**.

---

## Feature Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ClinEval Platform                        │
├──────────────────┬──────────────────┬───────────────────────────┤
│   EVALUATION     │   IMAGING        │   COLLABORATION           │
│                  │                  │                           │
│ • Split-panel    │ • Multi-slice    │ • Real-time cursors       │
│   eval workflow  │   viewer         │ • Live annotation sync    │
│ • Structured     │ • Window/Level   │ • MDT conference mode     │
│   reporting      │ • Zoom/Pan       │ • Chat + voting           │
│   (BI-RADS etc)  │ • Cine playback  │ • Host-controlled nav     │
│ • Pairwise       │ • MPR 3D recon   │                           │
│   comparison     │ • Annotations    │                           │
│ • Per-finding    │ • Lasso tool     │                           │
│   assessment     │ • Heatmap overlay│                           │
│                  │ • Smart propagate│                           │
├──────────────────┼──────────────────┼───────────────────────────┤
│   MANAGEMENT     │   AI ASSIST      │   QUALITY CONTROL         │
│                  │                  │                           │
│ • Research groups│ • LLM integration│ • Anomaly detection       │
│   (Zotero-style) │   (OpenAI/Claude)│ • Speed analysis          │
│ • Role-based     │ • Region-of-     │ • Rating distribution     │
│   access control │   interest query │ • Systematic bias check   │
│ • Case assignment│ • Query history  │ • Time histograms         │
│ • Data export    │ • Per-group API  │ • PASS/REVIEW/ALERT       │
│   (CSV/JSON)     │   configuration  │   evaluator scoring       │
│ • Dark mode      │                  │                           │
└──────────────────┴──────────────────┴───────────────────────────┘
```

---

## Detailed Feature Guide

### 1. Evaluation Workflow (Split-Panel)

The core of the application. Navigate to **Cases** → click a case.

```
┌──────────────────────────────┬─────────────────────────────┐
│         LEFT PANEL (55%)     │      RIGHT PANEL (45%)      │
│                              │                             │
│  ┌────┐                      │  ▼ Clinical Context         │
│  │Ser.│  ┌──────────────┐   │    Patient: 24/M            │
│  │    │  │              │   │    Prompt: ...               │
│  │T2  │  │  Multi-Slice │   │    History: ...              │
│  │DWI │  │   Viewer     │   │                             │
│  │ADC │  │              │   │  [Tab1] [Tab2] [Tab3]       │
│  │SWI │  │  + Annotation│   │  ┌─────────────────────┐   │
│  │    │  │    tools     │   │  │ Model Report Text   │   │
│  └────┘  └──────────────┘   │  └─────────────────────┘   │
│  [▶ ═══════════●══ ]        │                             │
│   W/L presets  Heatmap       │  Evaluation Form            │
│   Propagate    MPR toggle    │  [1][2][3][4][5] Accuracy  │
│                              │  [1][2][3][4][5] Overall   │
│                              │  ☐ Critical  ☐ Minor error │
│                              │  [Submit] (S)               │
│                              │                             │
│                              │  📋 Structured Report       │
│                              │  (BI-RADS / LI-RADS / etc) │
└──────────────────────────────┴─────────────────────────────┘
Top bar: [← Cases] Title [MRI] [🟢] [🧊 MPR] [🤖 AI] [0:42] [Pairwise]
```

**Keyboard shortcuts**: `1-5` rate, `N/P` next/prev model, `S` submit, `A` annotate, `Space` cine, `R` reset zoom, `Esc` exit mode.

### 2. Medical Image Viewer

Professional radiology-grade viewer with:

| Feature | Control | Description |
|---------|---------|-------------|
| Slice navigation | Mouse wheel | Scroll through axial slices |
| Window/Level | Right-click drag | Adjust brightness/contrast (horizontal=window, vertical=level) |
| W/L presets | Right toolbar buttons | Soft Tissue, Lung, Bone, Brain, Reset |
| Zoom | Ctrl + scroll | 0.5x to 10x magnification |
| Pan | Middle-click drag | Move the image within the viewport |
| Cine mode | Space bar or ▶ button | Auto-play slices at 1-30 fps |
| Series switch | Click series thumbnail | Switch between T1, T2, DWI, ADC, SWI etc. |

### 3. Image Annotation

Six annotation tools accessible from the left toolbar:

```
┌─────────────────────────────────────┐
│  ▭  Rectangle — bounding box       │
│  ○  Ellipse — oval region          │
│  →  Arrow — point to finding       │
│  ✎  Freehand — free drawing        │
│  ⭕  Lasso — dynamic closed region  │
│  📏  Ruler — distance measurement   │
│  ── ── ── ── ── ── ── ── ── ──    │
│  🟥🟨🟩🟦⬜  Color picker           │
└─────────────────────────────────────┘
```

- Annotations are **vector-based** (normalized 0-1 coordinates stored as JSON)
- Persisted in PostgreSQL — survive container restarts
- **Smart Propagation**: Draw on one slice → click `↕ Propagate` → auto-fill adjacent slices with scaled versions (lesions taper naturally)
- Browse all annotations at **/annotations**

### 4. MPR (Multi-Planar Reconstruction)

Toggle with 🧊 **MPR** button. Reconstructs sagittal and coronal views from the axial stack:

```
┌──────────────┬──────────────┬──────────────┐
│    AXIAL     │   SAGITTAL   │   CORONAL    │
│   (blue)     │   (green)    │   (orange)   │
│              │              │              │
│     A        │      S       │      S       │
│  R ─┼─ L     │   A ─┼─ P   │   R ─┼─ L   │
│     P        │      I       │      I       │
│              │              │              │
│  [═══●════]  │  [═══●════]  │  [═══●════]  │
│   55/108     │   257/512    │   257/512    │
└──────────────┴──────────────┴──────────────┘
```

> **Note**: MPR requires ≥50 axial slices for meaningful reconstruction. Series with fewer slices show a warning and axial-only view. Best results with the 108-slice and 247-slice CT series.

### 5. Structured Reporting (BI-RADS / LI-RADS / Lung-RADS / PI-RADS)

After submitting a basic evaluation, a structured reporting panel appears:

```
┌─────────────────────────────────────────┐
│  📋 Structured Report                   │
│                                         │
│  [BI-RADS] [LI-RADS] [Lung-RADS] [PI-RADS]  │
│                                         │
│  Category:                              │
│  🟢 1 — Negative                        │
│  🟢 2 — Benign                          │
│  🟡 3 — Probably Benign                 │
│  🟠 4A — Low Suspicion                  │
│  🟠 4B — Moderate Suspicion             │
│  🔴 4C — High Suspicion                 │
│  🔴 5 — Highly Suggestive               │
│  ⚫ 6 — Known Malignancy                │
│                                         │
│  [Mass Shape ▼] [Mass Margin ▼]         │
│  [Size (mm): ___]                       │
│                                         │
│  Model Assessment:                      │
│  Model's category: [▼]  ☐Agree ☐Disagree│
│                                         │
│  [Save Structured Report]               │
└─────────────────────────────────────────┘
```

Auto-selects the appropriate template based on the case modality.

### 6. Pairwise Comparison

Navigate via **Pairwise** button from the evaluation page:

```
┌───────────────────────┬───────────────────────┐
│   OUTPUT A: v1.0      │   OUTPUT B: v0.8      │
│  ┌─────────────────┐  │  ┌─────────────────┐  │
│  │  Synced Viewer   │  │  │  Synced Viewer   │  │
│  │  (same slice)    │  │  │  (same slice)    │  │
│  └─────────────────┘  │  └─────────────────┘  │
│  Report text A...     │  Report text B...      │
└───────────────────────┴───────────────────────┘
         [Tie]  Strength: [Slight][Moderate][Strong]
         Reasoning: [_________________]
         [Submit Comparison]
```

Scrolling one viewer advances both (synchronized slice index).

### 7. Research Groups (Zotero-style Library)

Navigate to **Groups** in the navbar:

```
┌──────────────────┬────────────────────────────────────┐
│  Research Groups │  ● Neuroradiology Lab              │
│                  │  Brain imaging research group       │
│  ▌Neuroradiology │                                    │
│  │ 2 members     │  Members (2)                       │
│  │ 1 cases       │  [Dr. Admin admin] [Dr. Smith clin]│
│                  │  [+ Add member... ▼]                │
│  ▌Body Imaging   │                                    │
│  │ 3 members     │  Image Library (1 cases)            │
│  │ 2 cases       │  Brain MRI - Fat Embolism  MRI     │
│                  │  [+ Assign case... ▼]               │
│  [+ New]         │                                    │
│                  │  AI Assistant Configuration         │
│                  │  Provider: [OpenAI ▼]               │
│                  │  API Key: [sk-...]                  │
│                  │  Model: [gpt-4o]                    │
│                  │  [Save Configuration]               │
└──────────────────┴────────────────────────────────────┘
```

- **Admin** creates groups, assigns members and cases
- Different groups see different imaging data
- Each group can configure its own LLM API endpoint

### 8. AI-Assisted Analysis

Click 🤖 **AI** button on the evaluation page to open the side panel:

```
┌──────────────────────────────┐
│  🤖 AI Assistant    [History]│
│                              │
│  Series: 1 AxialT2           │
│  Slice: 13                   │
│                              │
│  Your Question:              │
│  [Identify abnormalities   ] │
│                              │
│  Quick prompts:              │
│  (Identify)(Differential)    │
│  (Tumor?)(Measure)(Compare)  │
│                              │
│  [Ask AI]                    │
│                              │
│  ┌─ AI Analysis ──────────┐ │
│  │ Multiple punctate foci  │ │
│  │ of restricted diffusion │ │
│  │ are identified in the   │ │
│  │ bilateral cerebral...   │ │
│  └────────────── 1,240ms ─┘ │
└──────────────────────────────┘
```

- Sends current slice image (base64) + clinical context to the group's configured LLM
- Supports OpenAI (GPT-4o), Anthropic (Claude), or any OpenAI-compatible endpoint
- All queries logged with response, latency, and user info

### 9. Consensus Conference (MDT Meeting)

Click 📡 **Conference** on any case in the case list:

```
┌───────────────────────────┬─────────────────────────┐
│                           │  MDT: Brain MRI - FES   │
│      Multi-Slice          │  Host: Dr. Admin (you)  │
│       Viewer              │  3 online               │
│                           │                         │
│  (Host controls           │  [Dr.Admin★][Dr.Smith]  │
│   navigation for          │  [Dr.Chen]              │
│   all participants)       │                         │
│                           │  Vote: Agree? [Start]   │
│                           │  [Agree(2)] [Disagree(1)]│
│                           │                         │
│                           │  Chat:                  │
│                           │  Dr.Smith: I see the    │
│                           │  lesion at slice 14     │
│                           │  Dr.Chen: Confirmed     │
│                           │                         │
│                           │  [Type a message] [Send]│
└───────────────────────────┴─────────────────────────┘
```

- Host scrolls → everyone follows
- Real-time chat
- Voting system with custom questions

### 10. Real-Time Collaboration

Enabled by default (green dot 🟢 in top bar). When two users view the same case:

- See each other's colored cursor with name label
- Watch live annotation drawing in real-time
- Toggle on/off per session

### 11. Quality Control Dashboard (Admin only)

Navigate to **QC** in the navbar:

```
┌─────────────────────────────────────────────────┐
│  Quality Control                                │
│  [Overview] [Evaluator Analysis] [Time Dist.]   │
│                                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │  42  │ │ 85s  │ │ 72s  │ │ 12%  │ │  8%  │  │
│  │Total │ │ Avg  │ │Median│ │Crit. │ │Minor │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│                                                 │
│  Evaluator Analysis:                            │
│  ┌──────────────────────────────────────────┐   │
│  │ Dr. Smith  12 evals           [PASS]     │   │
│  │ Avg: 85s  Rating: 3.2  Std: 0.8         │   │
│  │ [█ ██████ ███ █ ]  distribution          │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │ Dr. Chen   8 evals            [ALERT]    │   │
│  │ HIGH: 5 evals completed in < 10 seconds  │   │
│  │ MEDIUM: 87% of ratings are '4'           │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  Time Distribution:                             │
│  🟥 <10s  🟨 10-30s  🟦 30s+                    │
│  [█ ████ ███████████████████████████ ]          │
└─────────────────────────────────────────────────┘
```

**5 anomaly detectors**:

1. **Speed**: Evaluations completed in <10 seconds
2. **Distribution**: >80% of ratings are the same score
3. **Bias**: Systematic deviation from group average
4. **Error detection**: Never flags errors when others do
5. **Engagement**: Never writes comments or corrections

### 12. Data Export (Admin only)

From the **Admin** dashboard, download:

- **Evaluations** → CSV or JSON
- **Pairwise Comparisons** → CSV or JSON
- **Annotations** → JSON (with vector coordinate data)

### 13. Dark Mode

Toggle with ☀️/🌙 in the navbar. Designed for radiology reading rooms:

- Pure black background (`#09090b`)
- White text, blue accents (`#3b82f6`)
- Preference saved in localStorage

---

## Architecture

```
                    ┌─────────────┐
                    │   Browser   │
                    │ :3000       │
                    └──────┬──────┘
                           │ HTTP + WebSocket
                    ┌──────┴──────┐
                    │    nginx    │ ← SPA routing + reverse proxy
                    │  (frontend) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ /api/*     │ /ws/*      │
              ▼            ▼            │
        ┌───────────┐  WebSocket        │
        │  FastAPI   │  upgrade         │
        │  Backend   │◄─────────────────┘
        │  :8000     │
        └─────┬──────┘
              │
    ┌─────────┼──────────┐
    │         │          │
    ▼         ▼          ▼
┌────────┐ ┌──────┐ ┌──────────────┐
│Postgres│ │data/ │ │model_predict/│
│(pgdata)│ │(ro)  │ │heatmaps/ (ro)│
│ volume │ │mount │ │    mounts    │
└────────┘ └──────┘ └──────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Viewer | HTML5 Canvas (W/L) + SVG overlays (annotations) |
| Styling | Vanilla CSS with CSS variables + dark mode |
| Backend | Python 3.12 + FastAPI + SQLAlchemy |
| Database | PostgreSQL 16 |
| Auth | JWT (HS256, 24h expiry) + bcrypt |
| Real-time | WebSocket (native FastAPI) |
| LLM Proxy | httpx async → OpenAI / Anthropic APIs |
| MPR | NumPy + Pillow (server-side reconstruction) |
| Serving | nginx (SPA + API proxy + WS upgrade) |
| Container | Docker Compose (3 services) |

---

## Project Structure

```
TUM_Assignment/
├── docker-compose.yml              # 3 services: db, backend, frontend
├── data/                            # Medical imaging (mounted read-only)
│   ├── Fat embolism syndrome/       #   8 series, 240 slices (Brain MRI)
│   ├── Renal cortical necrosis/     #   2 series, 355 slices (Abdomen CT)
│   └── Uterus didelphys.../        #   4 series, 104 slices (Pelvis MRI)
├── model_predictions/               # AI model prediction outputs (read-only)
├── heatmaps/                        # Saliency/attention maps (read-only)
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt             # FastAPI, SQLAlchemy, Pillow, NumPy, etc.
│   └── app/
│       ├── main.py                  # App init, CORS, router registration, startup
│       ├── models.py                # 10 SQLAlchemy models + 2 association tables
│       ├── schemas.py               # Pydantic request/response models
│       ├── auth.py                  # JWT creation/verification + bcrypt
│       ├── database.py              # Engine, session factory, Base
│       ├── imaging_utils.py         # Filesystem scanning utilities
│       ├── seed_data.py             # 3 cases, 4 users, 2 groups, 8 model outputs
│       └── routers/                 # 14 API router modules
│           ├── auth_router.py       #   Login, current user
│           ├── cases_router.py      #   Case CRUD + imaging info
│           ├── evaluations_router.py#   Rating submission + pairwise
│           ├── annotations_router.py#   CRUD + smart propagation
│           ├── imaging_router.py    #   Slice serving + predictions + heatmaps
│           ├── mpr_router.py        #   Multi-planar reconstruction
│           ├── groups_router.py     #   Research group management
│           ├── llm_router.py        #   AI assist proxy
│           ├── reporting_router.py  #   Structured reports (BI-RADS etc.)
│           ├── conference_router.py #   MDT consensus meetings
│           ├── collab_router.py     #   Real-time cursor sync
│           ├── qc_router.py         #   Quality control analytics
│           ├── export_router.py     #   CSV/JSON data export
│           └── admin_router.py      #   Dashboard statistics
│
└── frontend/
    ├── Dockerfile                   # Multi-stage: node build → nginx
    ├── nginx.conf                   # SPA routing + API + WebSocket proxy
    └── src/
        ├── App.tsx                  # Router, auth state, dark mode
        ├── main.tsx                 # React entry point
        ├── index.css                # All styles + dark mode variables
        ├── api/
        │   └── client.ts            # Typed API client + URL builders
        ├── hooks/
        │   └── useCollaboration.ts  # WebSocket collaboration hook
        ├── components/
        │   ├── MultiSliceViewer.tsx  # Canvas viewer (W/L, zoom, cine, annotations)
        │   ├── MPRViewer.tsx        # 3-panel axial/sagittal/coronal
        │   ├── StructuredReportPanel.tsx # BI-RADS / LI-RADS forms
        │   ├── LLMAssistPanel.tsx   # AI query sidebar
        │   ├── Navbar.tsx           # Navigation + dark mode toggle
        │   └── RatingInput.tsx      # 1-5 star rating component
        └── pages/
            ├── LoginPage.tsx        # Auth + demo account quick-fill
            ├── CaseListPage.tsx     # Case list + conference launcher
            ├── EvaluatePage.tsx      # Main split-panel evaluation
            ├── PairwisePage.tsx      # Dual-viewer comparison
            ├── ConferencePage.tsx    # MDT meeting room
            ├── AnnotationBrowserPage.tsx # Annotation gallery
            ├── GroupsPage.tsx        # Zotero-style group management
            ├── AdminPage.tsx         # Stats + export buttons
            └── QCDashboardPage.tsx   # Quality control analytics
```

### Database Models (10 tables)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | Authentication + roles | username, role (admin/clinician), specialty |
| `ResearchGroup` | Team management + LLM config | name, llm_provider, llm_api_key, owner_id |
| `Case` | Clinical case linked to imaging | title, clinical_prompt, imaging_folder_name |
| `CaseOutput` | AI model-generated report | model_name, output_text, prediction_folder_name |
| `Evaluation` | Structured ratings | accuracy/completeness/clarity/overall (1-5), errors |
| `Finding` | Per-finding assessment | location, type, severity, confidence, is_correct |
| `PairwiseComparison` | A-vs-B preference | preferred_id, preference_strength, reasoning |
| `Annotation` | Vector image markup | series_name, slice_index, annotation_data (JSON) |
| `StructuredReport` | Standardized classification | template_type, category, structured_data (JSON) |
| `LLMQuery` | AI assist query log | query_text, response_text, model_used, latency_ms |

---

## Data & Imaging

### Pre-loaded Cases (699 slices total)

| Case | Modality | Body Region | Series | Slices | Model Outputs |
|------|----------|-------------|--------|--------|---------------|
| Fat Embolism Syndrome | MRI | Brain | 8 (T2, DWI, ADC, SWI) | 240 | 3 |
| Renal Cortical Necrosis | CT | Abdomen | 2 (arterial, portal venous) | 355 | 2 |
| Uterus Didelphys | MRI | Pelvis | 4 (Sag T2, Ax T2, Cor T2, Ax T1) | 104 | 3 |

### Adding New Imaging Data

Place JPEG slices in the `data/` folder following this structure:

```
data/
  {CaseName}/
    {SeriesNumber} {SeriesDescription}/
      000.jpg
      001.jpg
      002.jpg
      ...
```

Then add a corresponding `Case` record in `seed_data.py` with `imaging_folder_name="{CaseName}"`.

### Adding Model Predictions

```
model_predictions/
  {ModelName}/
    {CaseName}/
      {SeriesName}/
        000.jpg, 001.jpg, ...
```

### Adding Heatmaps / Saliency Maps

```
heatmaps/
  {ModelName}/
    {CaseName}/
      {SeriesName}/
        000.png, 001.png, ...   # PNG with transparency
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login → JWT token |
| GET | `/api/auth/me` | Current user info |

### Cases & Evaluation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cases/` | List cases (with per-user eval status) |
| GET | `/api/cases/{id}` | Case detail + model outputs |
| GET | `/api/cases/{id}/imaging` | Imaging series info for viewer |
| POST | `/api/evaluations/{case_id}` | Submit/update evaluation |
| POST | `/api/evaluations/{case_id}/pairwise` | Submit comparison |

### Imaging & MPR

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imaging/{case}/{series}/slice/{idx}?token=` | Serve slice image |
| GET | `/api/imaging/predictions/{model}/{case}/{series}/slice/{idx}?token=` | Prediction image |
| GET | `/api/imaging/heatmaps/{model}/{case}/{series}/slice/{idx}?token=` | Heatmap overlay |
| GET | `/api/mpr/info/{case}/{series}` | MPR feasibility + dimensions |
| GET | `/api/mpr/slice/{case}/{series}/{plane}/{idx}?token=` | Reconstructed slice |

### Annotations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/annotations/` | Create annotation |
| GET | `/api/annotations/case/{id}/slice?series=X&index=N` | Get slice overlays |
| POST | `/api/annotations/propagate` | Smart propagation to adjacent slices |

### Structured Reporting

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reporting/templates` | All BI-RADS/LI-RADS/Lung-RADS/PI-RADS definitions |
| POST | `/api/reporting/reports` | Save structured report |

### Groups & LLM

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/groups/` | List/create research groups |
| PUT | `/api/groups/{id}` | Update group (including LLM config) |
| POST | `/api/groups/{id}/members/{uid}` | Add member |
| POST | `/api/groups/{id}/cases/{cid}` | Assign case to group |
| POST | `/api/llm/assist` | Send multimodal query to group LLM |

### Collaboration & Conferences

| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/ws/collab/{case_id}?token=` | Real-time cursor + annotation sync |
| POST | `/api/conferences/` | Create MDT conference |
| WS | `/ws/conference/{conf_id}?token=` | Join conference (chat, vote, navigate) |

### Admin & QC

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/qc/evaluator-analysis` | Per-evaluator anomaly detection |
| GET | `/api/export/evaluations?format=csv` | Export evaluations |

---

## Development Guide

### Local Development (without Docker)

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Start PostgreSQL locally or use: docker compose up db
export DATABASE_URL=postgresql://clineval:clineval_secret@localhost:5432/clineval
uvicorn app.main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev    # Vite dev server at :5173, proxies /api to :8000
```

### Rebuild After Code Changes

```bash
# Backend only
docker compose build backend && docker compose up -d backend

# Frontend only
docker compose build frontend && docker compose up -d frontend

# Both
docker compose build && docker compose up -d

# Full reset (wipe database)
docker compose down -v && docker compose up --build
```

### Adding a New Backend Router

1. Create `backend/app/routers/my_router.py`
2. Define `router = APIRouter(prefix="/api/myfeature", tags=["myfeature"])`
3. Register in `backend/app/main.py`: `app.include_router(my_router.router)`

### Adding a New Database Model

1. Add model class in `backend/app/models.py`
2. Add Pydantic schemas in `backend/app/schemas.py`
3. Tables auto-create on startup via `Base.metadata.create_all()`
4. For existing databases, either reset (`docker compose down -v`) or add migration logic

### Adding a New Frontend Page

1. Create `frontend/src/pages/MyPage.tsx`
2. Add route in `frontend/src/App.tsx`
3. Add nav link in `frontend/src/components/Navbar.tsx`
4. Add API methods in `frontend/src/api/client.ts`

### Adding a New Annotation Tool

1. Add tool entry in `MultiSliceViewer.tsx` tool array (icon, key, tip)
2. Handle drawing logic in `handleMouseDown/Move/Up` (check `currentTool`)
3. Add SVG rendering case in `renderShapeSvg()`

---

## Adding New Features

### Checklist for new feature development

```
☐ Backend model (if persistent data needed) → models.py
☐ Backend schema (request/response) → schemas.py
☐ Backend router (API endpoints) → routers/new_router.py
☐ Register router → main.py
☐ Frontend API client methods → api/client.ts
☐ Frontend component or page → components/ or pages/
☐ Route registration → App.tsx
☐ Navigation link → Navbar.tsx
☐ Docker rebuild → docker compose build
☐ Test → docker compose up
```

### Key design patterns used throughout

- **JWT in query params** for `<img>` tag authentication (images can't send headers)
- **Normalized coordinates (0-1)** for annotations — resolution-independent
- **WebSocket rooms** keyed by `case_{id}` for collaboration scoping
- **Canvas-based rendering** for Window/Level pixel manipulation
- **SVG overlays** for vector annotations (on top of canvas)
- **Server-side reconstruction** for MPR (NumPy array slicing + Pillow resize)
- **JSON columns** for flexible structured data (annotations, findings, reports)
