# SP3 PhD Candidate Assessment Tasks

## Task 1: Clinical Model Evaluation Interface

SP3 builds multimodal foundation models for clinical oncology. Before any model ships, clinicians need to evaluate its outputs, flag errors, and express preferences. DECIPHER-M will produce models that draft radiology reports, answer clinical questions, and annotate images. Radiologists across consortium sites will evaluate those outputs. However, clinician time is scarce, so we need to remove friction for them. Part of your job will be building applications that allow clinicians to interact with model outputs, rate them, correct them, and provide feedback. Your task is to build such a sample application.

**Please note:**
We expect you to use LLM-based coding tools and designed the task accordingly. It will likely not be possible to code this application without them. We want to see how you think about a real problem when you have real tools and enough time.

### Task Description

Build a containerized web application that lets clinicians evaluate outputs from a multimodal model.

The app presents model outputs (text, images, or both) and collects structured feedback. Think of it as the data collection frontend for a preference optimization pipeline.

### Minimum requirements

A running application that:

1. Shows a clinician a case (clinical prompt + one or more model outputs)
2. Lets them rate, rank, or compare outputs with structured feedback.
3. Stores results persistently (survives container restart)
4. Runs via `docker compose up` with no manual setup

Mock the model outputs. Focus on the evaluation workflow, not inference. You can get sample images from [Radiopaedia](https://radiopaedia.org/). The application will not be hosted publicly, so you can use any image from Radiopaedia.

### Stretch goals (no ceiling)

Not required, but we are curious how far you can push the application.

- User auth and roles
- Pairwise comparison mode (side-by-side, pick the better one)
- Inter-annotator agreement metrics
- Image annotation or region-of-interest marking
- Admin dashboard (progress, annotator activity, data quality)
- Anything else you think a real clinical evaluation workflow needs

### Constraints

- Must be containerized (Docker/Docker Compose)
- Any language, framework, database
- Include sample data. We want to `docker compose up` and see a working interface immediately.

### Evaluation

We evaluate the application on two things: does it run, and does the workflow make sense? We are not grading code quality since AI-generated code is expected. What matters is whether you designed a sensible evaluation workflow and delivered a working product.

### Deliverables

Git repository (GitHub, GitLab, or zip) with:

- Source code + README (how to run, architecture overview)
- Working Dockerfile / docker-compose.yml
- Sample data

## Task 2: LLM Inference Essay

We host our own LLMs at TUM. German data protection law makes sending patient data to external APIs either illegal or painfully slow (legal agreements for every service, every use case). Self-hosting means every decision about which model to run, on what hardware, at what precision is ours. As a PhD student in SP3, you will work with these models regularly. This task checks whether you have genuine familiarity with the model landscape and GPU inference. There is no single correct answer. We want depth, specifics, and opinions grounded in reality. We are also interested in how you keep yourself up to date in this field.

### Task description

Be specific throughout. Name models by name and version, give actual numbers, explain your reasoning. Vague generalities count against you.

**Q1. Model landscape for local deployment**

What are your preferred LLMs for local deployment today, and why? Cover different use cases (general assistant, code generation). Name specific models. What makes a model good for self-hosting beyond benchmark scores?

**Q2. One GPU, best model**

You have a single NVIDIA H200 (141 GB HBM3e, ~4.8 TB/s memory bandwidth). What is the best-quality model you can run on this hardware? Justify the pick.

**Q3. Speed and optimization**

For the model from Q2: expected tokens per second for a single user? Walk through the bottlenecks. Then describe concrete optimization techniques, what each does, roughly how much it helps, and what you give up.

**Q4. Full inference stack**

Describe your ideal production setup end-to-end. Inference engine (and why that one), API layer, handling concurrent users, monitoring, and the interaction layer. Be opinionated. There is no single correct answer, but we are interested in how you arrive at a solution.

**Q5. Dream Hardware**
We are in the process of buying B300 Servers. With 2.1 TB of VRAM, they offer substantially more opportunities to server foundation models. What would you host on such a machine. How would you make sure it can server the whole radiology department?

### Deliverables

Single document (PDF, docx, markdown or similar), roughly 1-2 pages.
