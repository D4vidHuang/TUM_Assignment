"""Seed the database with clinical cases matching real imaging data."""
from sqlalchemy.orm import Session
from .models import User, Case, CaseOutput, UserRole, ResearchGroup
from .auth import hash_password


def seed(db: Session):
    if db.query(User).first():
        return

    # ── Users ────────────────────────────────────────────────────────────────
    admin = User(
        username="admin", hashed_password=hash_password("admin123"),
        full_name="Dr. Admin", role=UserRole.ADMIN, specialty="Radiology Administration",
    )
    dr_smith = User(
        username="dr.smith", hashed_password=hash_password("password"),
        full_name="Dr. Sarah Smith", role=UserRole.CLINICIAN, specialty="Neuroradiology",
    )
    dr_chen = User(
        username="dr.chen", hashed_password=hash_password("password"),
        full_name="Dr. Wei Chen", role=UserRole.CLINICIAN, specialty="Body Imaging",
    )
    dr_garcia = User(
        username="dr.garcia", hashed_password=hash_password("password"),
        full_name="Dr. Maria Garcia", role=UserRole.CLINICIAN, specialty="Abdominal Radiology",
    )
    db.add_all([admin, dr_smith, dr_chen, dr_garcia])
    db.flush()

    # ── Case 1: Fat Embolism Syndrome ────────────────────────────────────────
    case1 = Case(
        title="Brain MRI - Fat Embolism Syndrome",
        clinical_prompt="24-year-old male, day 2 post-surgical fixation of bilateral femoral shaft fractures. Acute onset of confusion, petechial rash, and hypoxemia. Brain MRI requested to evaluate altered mental status.",
        modality="MRI",
        body_region="Brain",
        patient_age="24",
        patient_sex="Male",
        clinical_history="Bilateral femoral shaft fractures sustained in a motor vehicle collision 48 hours ago, treated with intramedullary nailing. Developed acute confusion (GCS drop from 15 to 11), tachycardia, desaturation to SpO2 88% on room air, and petechial rash on chest/axillae. CXR showed bilateral diffuse opacities. Lab: thrombocytopenia (PLT 85k), elevated D-dimer.",
        ground_truth="Multiple punctate foci of restricted diffusion scattered throughout bilateral cerebral white matter and deep gray matter on DWI, with corresponding low ADC values. Multifocal susceptibility blooming foci on SWI, predominantly in subcortical white matter. T2/FLAIR hyperintense lesions in a 'starfield' pattern. No mass effect or midline shift. Findings classic for cerebral fat embolism syndrome.",
        imaging_folder_name="Fat embolism syndrome",
    )
    db.add(case1)
    db.flush()

    db.add_all([
        CaseOutput(
            case_id=case1.id, model_name="DECIPHER-M v1.0", display_order=0,
            output_text="""FINDINGS:
Brain parenchyma: Multiple punctate foci of restricted diffusion are identified scattered throughout the bilateral cerebral hemispheres, predominantly involving the subcortical white matter, deep white matter, corpus callosum, and bilateral basal ganglia. These foci measure 2-8 mm and demonstrate corresponding low signal on ADC maps, confirming true restricted diffusion.

On SWI sequences, numerous punctate susceptibility foci are seen in a distribution mirroring the DWI abnormalities, consistent with petechial microhemorrhages.

T2-weighted sequences demonstrate subtle hyperintensity within the affected regions. The overall pattern demonstrates a characteristic 'starfield' distribution.

No large territorial infarcts. No mass effect or midline shift. Ventricles are normal in size and configuration. No extra-axial collections.

Posterior fossa: Unremarkable. No cerebellar or brainstem abnormality.

IMPRESSION:
1. Multifocal punctate foci of restricted diffusion in a 'starfield' pattern with corresponding SWI susceptibility foci, highly characteristic of cerebral fat embolism syndrome. Clinical correlation with the post-long-bone-fracture setting is confirmatory.
2. No large territorial infarction or mass effect.
3. Recommend close clinical and neurological monitoring; follow-up MRI in 1-2 weeks to assess evolution.""",
        ),
        CaseOutput(
            case_id=case1.id, model_name="DECIPHER-M v0.8", display_order=1,
            output_text="""FINDINGS:
Multiple small bright spots seen on DWI sequences in the brain. These are scattered in both hemispheres. Some dark spots on SWI images as well. No big stroke or bleeding. Brain looks otherwise normal.

IMPRESSION:
Multiple small areas of restricted diffusion in the brain. Differential includes small vessel disease, embolic phenomena, or vasculitis. Suggest clinical correlation.""",
        ),
        CaseOutput(
            case_id=case1.id, model_name="Baseline-GPT-Rad", display_order=2,
            output_text="""FINDINGS:
DWI: Scattered punctate hyperintensities in bilateral cerebral hemispheres, predominantly subcortical white matter. ADC maps show corresponding low signal confirming restricted diffusion. Estimated 15-20 foci identified.

SWI: Multiple punctate susceptibility foci corresponding to DWI lesions, suggesting hemorrhagic component. Additionally noted 3-4 foci in the corpus callosum not clearly seen on DWI.

T2: Subtle hyperintense foci in bilateral centrum semiovale. No significant edema.

No acute large-vessel territory infarct. Midline structures are normal. Ventricular system is normal. No hydrocephalus.

IMPRESSION:
1. 'Starfield' pattern of multifocal restricted diffusion with microhemorrhages — characteristic of fat embolism syndrome in appropriate clinical context.
2. Corpus callosum involvement noted on SWI — may indicate more severe microhemorrhagic burden.
3. No evidence of large-vessel occlusion or herniation.""",
        ),
    ])

    # ── Case 2: Renal Cortical Necrosis ──────────────────────────────────────
    case2 = Case(
        title="Abdominal CT - Renal Cortical Necrosis",
        clinical_prompt="45-year-old female with acute kidney injury (creatinine rise from 0.9 to 8.2 mg/dL over 48 hours), oliguria, and hemodynamic instability. Contrast-enhanced CT abdomen requested for evaluation.",
        modality="CT",
        body_region="Abdomen",
        patient_age="45",
        patient_sex="Female",
        clinical_history="Admitted with septic shock secondary to perforated appendicitis. Complicated by DIC (INR 3.2, fibrinogen 80, platelets 42k). Despite fluid resuscitation and vasopressors, developed progressive oliguric renal failure. Urine output <100 mL/24h. LDH markedly elevated at 2,400 U/L.",
        ground_truth="Bilateral non-enhancing renal cortices on contrast-enhanced CT, with preserved enhancement of the renal medullae and collecting systems. Bilateral subcapsular thin rim of cortical enhancement (cortical rim sign). Findings diagnostic of bilateral acute renal cortical necrosis in the setting of DIC and septic shock.",
        imaging_folder_name="Renal cortical necrosis",
    )
    db.add(case2)
    db.flush()

    db.add_all([
        CaseOutput(
            case_id=case2.id, model_name="DECIPHER-M v1.0", display_order=0,
            output_text="""FINDINGS:
Kidneys: Both kidneys are normal in size (right 11.2 cm, left 11.5 cm). On the arterial phase, there is absence of normal cortical enhancement bilaterally. The renal cortices appear hypodense relative to the enhanced medullae, which is the reverse of normal corticomedullary differentiation. A thin peripheral rim of subcapsular cortical enhancement is noted bilaterally (cortical rim sign), supplied by capsular perforating arteries.

On the portal venous phase, the renal cortices remain non-enhancing. The collecting systems and ureters demonstrate normal contrast excretion suggesting some residual function from juxtamedullary nephrons.

Renal arteries: Patent bilaterally, normal caliber, no stenosis or thrombosis. Renal veins patent.

Additional abdominal findings: Post-surgical changes in the right lower quadrant consistent with recent appendectomy. Small amount of free fluid in the pelvis. No pneumoperitoneum. Liver, spleen, and pancreas are unremarkable.

IMPRESSION:
1. Bilateral renal cortical necrosis: absent cortical enhancement with preserved medullary enhancement and cortical rim sign. Findings are pathognomonic in the clinical context of DIC and septic shock.
2. Patent renal arteries and veins — excludes vascular occlusion as etiology.
3. Post-appendectomy changes with small volume pelvic free fluid.""",
        ),
        CaseOutput(
            case_id=case2.id, model_name="DECIPHER-M v0.8", display_order=1,
            output_text="""FINDINGS:
Both kidneys appear abnormal. The cortex of each kidney does not enhance normally after contrast. The inner parts of the kidneys (medulla) enhance more than the cortex, which is reversed from normal. Kidneys are normal in size. No kidney stones. No hydronephrosis.

Abdomen otherwise shows some post-surgical changes.

IMPRESSION:
Abnormal renal enhancement pattern. Consider renal cortical necrosis or acute tubular necrosis. Clinical correlation recommended.""",
        ),
    ])

    # ── Case 3: Uterus Didelphys ─────────────────────────────────────────────
    case3 = Case(
        title="Pelvic MRI - Uterus Didelphys with Vaginal Septum",
        clinical_prompt="19-year-old female presenting with severe dysmenorrhea since menarche, difficulty with tampon use, and recent ultrasound suggesting Mullerian duct anomaly. Pelvic MRI for characterization.",
        modality="MRI",
        body_region="Pelvis",
        patient_age="19",
        patient_sex="Female",
        clinical_history="Menarche at age 13 with progressively worsening dysmenorrhea unresponsive to NSAIDs and oral contraceptives. Reports difficulty with tampon insertion. Pelvic ultrasound 2 weeks ago reported 'two separate uterine bodies — possible bicornuate vs. didelphys uterus.' No prior pregnancies. Normal secondary sexual characteristics.",
        ground_truth="Complete uterine duplication (uterus didelphys): two widely separated uterine horns, each with its own endometrial cavity and cervix (two cervical canals visualized). A longitudinal vaginal septum extends from the cervices inferiorly. Both endometrial cavities show normal signal intensity. Both ovaries are normal. No renal anomalies identified on available images.",
        imaging_folder_name="Uterus didelphys with longitudinal vaginal septum",
    )
    db.add(case3)
    db.flush()

    db.add_all([
        CaseOutput(
            case_id=case3.id, model_name="DECIPHER-M v1.0", display_order=0,
            output_text="""FINDINGS:
Uterus: Two widely separated uterine horns are identified, each with a distinct, well-formed endometrial cavity. The uterine horns have a wide inter-horn distance (approximately 4.5 cm fundally) with a deep fundal cleft extending to the level of the internal os, consistent with complete duplication.

Cervix: Two separate cervices are clearly delineated on axial and sagittal T2-weighted images, each connecting to its respective uterine horn. This confirms uterus didelphys (Class III Mullerian anomaly, AFS classification).

Vagina: A longitudinal vaginal septum is visualized extending from the two cervices inferiorly. The septum appears complete on available sequences, dividing the vaginal canal into two parallel channels.

Endometrium: Both endometrial cavities demonstrate normal signal intensity with uniform endometrial thickness (approximately 8 mm, consistent with proliferative phase).

Ovaries: Both ovaries are normal in size, morphology, and signal characteristics. Right ovary measures 3.0 x 1.8 cm; left ovary 2.8 x 1.6 cm. No adnexal masses.

Additional: No pelvic free fluid. No lymphadenopathy. Visualized portions of the kidneys appear normal bilaterally (important to assess given the association of Mullerian anomalies with renal anomalies).

IMPRESSION:
1. Uterus didelphys (complete uterine duplication) with two separate uterine horns, two cervices, and a longitudinal vaginal septum — Class III Mullerian duct anomaly.
2. Normal endometrial signal bilaterally; no evidence of obstruction or hematometra.
3. Bilateral kidneys visualized and appear normal — no concurrent renal anomaly identified.
4. The longitudinal vaginal septum likely accounts for the patient's reported difficulty with tampon use and may be considered for surgical resection if symptomatic.""",
        ),
        CaseOutput(
            case_id=case3.id, model_name="DECIPHER-M v0.8", display_order=1,
            output_text="""FINDINGS:
Two separate uterine horns are seen. Each horn has its own cervix. There appears to be a septum in the vagina. Both ovaries look normal.

IMPRESSION:
Duplicated uterus, likely didelphys type. Two cervices and vaginal septum present. Recommend gynecology referral.""",
        ),
        CaseOutput(
            case_id=case3.id, model_name="Baseline-GPT-Rad", display_order=2,
            output_text="""FINDINGS:
Uterus: Complete duplication of the uterus with two distinct uterine horns separated by a wide cleft. Each horn has independent endometrial cavity measuring approximately 8mm in thickness. Zonal anatomy is preserved in both horns.

Cervix: Dual cervices identified on sagittal and axial T2W sequences, confirming didelphys variant over bicornuate.

Vagina: Longitudinal septum present, appearing to extend the full length of the vaginal canal. Signal characteristics are similar to vaginal wall tissue on T2W.

Myometrium: Homogeneous signal in both uterine horns. No focal myometrial lesions.

Ovaries: Bilateral normal ovaries with follicular activity. No dominant cyst or mass.

Kidneys: Both kidneys normal in position and morphology on the included sequences.

IMPRESSION:
1. Uterus didelphys with complete vaginal septum — Mullerian duct anomaly Class III.
2. No obstructive features or hematocolpos.
3. Normal bilateral kidneys excludes associated urinary tract anomaly.
4. Septum resection may be discussed for symptom relief.""",
        ),
    ])

    db.flush()

    # ── Research Groups ──────────────────────────────────────────────────────
    neuro_group = ResearchGroup(
        name="Neuroradiology Lab",
        description="Brain imaging research group — fat embolism, stroke, tumors",
        color="#3b82f6",
        owner_id=admin.id,
    )
    neuro_group.members.extend([admin, dr_smith])
    neuro_group.cases.append(case1)
    db.add(neuro_group)

    body_group = ResearchGroup(
        name="Body Imaging Lab",
        description="Abdominal and pelvic imaging — renal, hepatic, gynecological",
        color="#22c55e",
        owner_id=admin.id,
    )
    body_group.members.extend([admin, dr_chen, dr_garcia])
    body_group.cases.extend([case2, case3])
    db.add(body_group)

    db.commit()
    print("Database seeded with 3 cases, 4 users, 2 research groups.")
