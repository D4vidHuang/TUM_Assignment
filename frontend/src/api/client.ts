const API_BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

/** Build an imaging slice URL with JWT as query param */
export function sliceUrl(caseName: string, seriesName: string, index: number): string {
  const token = getToken() ?? '';
  return `${API_BASE}/imaging/${encodeURIComponent(caseName)}/${encodeURIComponent(seriesName)}/slice/${index}?token=${token}`;
}

/** Build a prediction slice URL */
export function predictionSliceUrl(modelName: string, caseName: string, seriesName: string, index: number): string {
  const token = getToken() ?? '';
  return `${API_BASE}/imaging/predictions/${encodeURIComponent(modelName)}/${encodeURIComponent(caseName)}/${encodeURIComponent(seriesName)}/slice/${index}?token=${token}`;
}

/** Build an MPR reconstruction URL */
export function mprUrl(caseName: string, seriesName: string, plane: string, index: number): string {
  const token = getToken() ?? '';
  return `${API_BASE}/mpr/slice/${encodeURIComponent(caseName)}/${encodeURIComponent(seriesName)}/${plane}/${index}?token=${token}`;
}

/** Build a heatmap overlay URL */
export function heatmapUrl(modelName: string, caseName: string, seriesName: string, index: number): string {
  const token = getToken() ?? '';
  return `${API_BASE}/imaging/heatmaps/${encodeURIComponent(modelName)}/${encodeURIComponent(caseName)}/${encodeURIComponent(seriesName)}/slice/${index}?token=${token}`;
}

/** Add token to any path */
export function withToken(path: string): string {
  const token = getToken() ?? '';
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}token=${token}`;
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  login: (u: string, p: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }),
  getMe: () => request('/auth/me'),

  // Cases
  getCases: () => request('/cases/'),
  getCase: (id: number) => request(`/cases/${id}`),
  getCaseImaging: (id: number) => request(`/cases/${id}/imaging`),
  getMyEvaluations: (caseId: number) => request(`/cases/${caseId}/my-evaluations`),

  // Evaluations
  submitEvaluation: (caseId: number, data: any) => request(`/evaluations/${caseId}`, { method: 'POST', body: JSON.stringify(data) }),
  submitPairwise: (caseId: number, data: any) => request(`/evaluations/${caseId}/pairwise`, { method: 'POST', body: JSON.stringify(data) }),

  // Imaging
  getImagingCases: () => request('/imaging/'),
  getModelPredictions: () => request('/imaging/models'),

  // Annotations
  createAnnotation: (data: any) => request('/annotations/', { method: 'POST', body: JSON.stringify(data) }),
  getAnnotations: (params?: { case_id?: number; evaluator_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.case_id) qs.set('case_id', String(params.case_id));
    if (params?.evaluator_id) qs.set('evaluator_id', String(params.evaluator_id));
    return request(`/annotations/?${qs}`);
  },
  getSliceAnnotations: (caseId: number, series: string, index: number) =>
    request(`/annotations/case/${caseId}/slice?series=${encodeURIComponent(series)}&index=${index}`),
  updateAnnotation: (id: number, data: any) => request(`/annotations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAnnotation: (id: number) => request(`/annotations/${id}`, { method: 'DELETE' }),
  propagateAnnotation: (data: { annotation_id: number; direction?: string; num_slices?: number; scale_factor?: number }) =>
    request('/annotations/propagate', { method: 'POST', body: JSON.stringify(data) }),

  // Structured Reporting
  getReportTemplates: () => request('/reporting/templates'),
  getReportTemplate: (type: string) => request(`/reporting/templates/${type}`),
  createReport: (data: any) => request('/reporting/reports', { method: 'POST', body: JSON.stringify(data) }),
  getEvaluationReport: (evalId: number) => request(`/reporting/reports/evaluation/${evalId}`),

  // Heatmaps
  getHeatmapModels: () => request('/imaging/heatmaps'),

  // Groups
  getGroups: () => request('/groups/'),
  createGroup: (data: any) => request('/groups/', { method: 'POST', body: JSON.stringify(data) }),
  getGroup: (id: number) => request(`/groups/${id}`),
  updateGroup: (id: number, data: any) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addGroupMember: (gid: number, uid: number) => request(`/groups/${gid}/members/${uid}`, { method: 'POST' }),
  removeGroupMember: (gid: number, uid: number) => request(`/groups/${gid}/members/${uid}`, { method: 'DELETE' }),
  assignGroupCase: (gid: number, cid: number) => request(`/groups/${gid}/cases/${cid}`, { method: 'POST' }),
  unassignGroupCase: (gid: number, cid: number) => request(`/groups/${gid}/cases/${cid}`, { method: 'DELETE' }),
  getAllUsers: () => request('/groups/users/all'),

  // LLM Assist
  llmAssist: (data: any) => request('/llm/assist', { method: 'POST', body: JSON.stringify(data) }),
  getLLMHistory: (caseId: number) => request(`/llm/history/${caseId}`),

  // MPR
  getMPRInfo: (caseName: string, seriesName: string) =>
    request(`/mpr/info/${encodeURIComponent(caseName)}/${encodeURIComponent(seriesName)}`),

  // Conferences
  createConference: (data: any) => request('/conferences/', { method: 'POST', body: JSON.stringify(data) }),
  listConferences: () => request('/conferences/'),
  endConference: (id: string) => request(`/conferences/${id}`, { method: 'DELETE' }),

  // QC
  getQCOverview: () => request('/qc/overview'),
  getQCEvaluatorAnalysis: () => request('/qc/evaluator-analysis'),
  getQCTimeDistribution: () => request('/qc/time-distribution'),

  // Admin
  getAdminStats: () => request('/admin/stats'),
  getAnnotators: () => request('/admin/annotators'),
  getAgreement: () => request('/admin/agreement'),
};
