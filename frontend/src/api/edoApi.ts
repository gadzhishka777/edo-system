import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ===== JWT INTERCEPTOR =====
function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('org_name');
  localStorage.removeItem('org_id');
  localStorage.removeItem('employee_id');
  localStorage.removeItem('employee_name');
  localStorage.removeItem('employee_roles');
}

// Р”РѕР±Р°РІР»СЏРµРј access token Рє РєР°Р¶РґРѕРјСѓ Р·Р°РїСЂРѕСЃСѓ
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ С‚РѕРєРµРЅР° РїСЂРё 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void; config: any }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Р•СЃР»Рё 401 Рё СЌС‚Рѕ РЅРµ РїРѕРІС‚РѕСЂРЅС‹Р№ Р·Р°РїСЂРѕСЃ Рё РЅРµ Р·Р°РїСЂРѕСЃ РЅР° login/refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        // РЎС‚Р°РІРёРј РІ РѕС‡РµСЂРµРґСЊ РїРѕРєР° РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ С‚РѕРєРµРЅ
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token } = response.data;
        setTokens(access_token, refresh_token);

        // РџРѕРІС‚РѕСЂСЏРµРј Р·Р°РїСЂРѕСЃС‹ РёР· РѕС‡РµСЂРµРґРё
        failedQueue.forEach(({ resolve, config }) => {
          config.headers.Authorization = `Bearer ${access_token}`;
          resolve(apiClient(config));
        });
        failedQueue = [];

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        failedQueue = [];
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ===== AUTH API =====
export interface EmployeeLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  org_id: number;
  org_name: string;
  employee_id: number;
  employee_name: string;
  roles: string[];
  profile_completed: boolean;
}

export interface EmployeeInfo {
  id: number;
  uuid: string;
  org_id: number;
  last_name: string;
  first_name: string;
  middle_name?: string;
  position?: string;
  department?: string;
  roles: string[];
  phone?: string;
  email?: string;
  birthday?: string;
  notes?: string;
  login: string;
  is_active: boolean;
  profile_completed: boolean;
  created_at: string;
  updated_at?: string;
}

export interface EmployeeRoleInfo {
  value: string;
  label: string;
  category: string;
}

export interface EmployeeRoleListResponse {
  roles: EmployeeRoleInfo[];
}

export interface ProfileCompleteRequest {
  last_name: string;
  first_name: string;
  middle_name?: string;
  position?: string;
  department?: string;
  roles: string[];
  phone?: string;
  email?: string;
  birthday?: string;
  notes?: string;
}


// ===== Универсальное извлечение текста ошибки из ответа API =====
// FastAPI на 422 возвращает detail как массив объектов {loc, msg, ...} —
// если отдать его в setState и отрендерить, React падает с error #31.
export function getApiErrorMessage(err: any, fallback = 'Ошибка запроса'): string {
  const data = err?.response?.data;
  if (!data) {
    return err?.message ? `${fallback}: ${err.message}` : fallback;
  }
  if (typeof data === 'string') return data;
  const detail = data.detail ?? data;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((e: any) => {
      const loc = Array.isArray(e.loc)
        ? e.loc.filter((x: any) => x !== 'body').join('.')
        : '';
      return loc && !loc.includes('__root__') ? `${loc}: ${e.msg ?? ''}` : e.msg ?? '';
    }).filter(Boolean);
    return parts.length ? parts.join('; ') : 'Проверьте корректность заполнения полей';
  }
  if (detail?.message) return String(detail.message);
  try { return JSON.stringify(data); } catch { return fallback; }
}
export const authApi = {
  login: async (login: string, password: string): Promise<EmployeeLoginResponse> => {
    const response = await apiClient.post('/api/auth/login', { login, password });
    setTokens(response.data.access_token, response.data.refresh_token);
    localStorage.setItem('org_name', response.data.org_name);
    localStorage.setItem('org_id', String(response.data.org_id));
    localStorage.setItem('employee_id', String(response.data.employee_id));
    localStorage.setItem('employee_name', response.data.employee_name);
    localStorage.setItem('employee_roles', JSON.stringify(response.data.roles));
    return response.data;
  },

  logout: async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      // ignore
    }
    clearTokens();
  },

  getCurrentEmployee: async (): Promise<EmployeeInfo> => {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  },

  getCurrentOrg: async (): Promise<any> => {
    const response = await apiClient.get('/api/auth/me-org');
    return response.data;
  },

  completeProfile: async (data: ProfileCompleteRequest): Promise<EmployeeLoginResponse> => {
    const response = await apiClient.post('/api/auth/complete-profile', data);
    setTokens(response.data.access_token, response.data.refresh_token);
    localStorage.setItem('org_name', response.data.org_name);
    localStorage.setItem('org_id', String(response.data.org_id));
    localStorage.setItem('employee_id', String(response.data.employee_id));
    localStorage.setItem('employee_name', response.data.employee_name);
    localStorage.setItem('employee_roles', JSON.stringify(response.data.roles));
    return response.data;
  },

  getLicense: async () => {
    const response = await apiClient.get('/api/auth/my-license');
    return response.data;
  },

  activateLicense: async (licenseKey: string) => {
    const response = await apiClient.post('/api/auth/activate-license', { license_key: licenseKey });
    return response.data;
  },

  isAuthenticated: () => {
    return !!getAccessToken();
  },

  getOrgName: () => localStorage.getItem('org_name'),
  getEmployeeName: () => localStorage.getItem('employee_name'),
  getEmployeeId: () => localStorage.getItem('employee_id'),
  getEmployeeRoles: (): string[] => {
    const roles = localStorage.getItem('employee_roles');
    return roles ? JSON.parse(roles) : [];
  },
};

export type DocumentStatus = 'draft' | 'pending' | 'signed' | 'rejected';
export type SignatureType = 'none' | 'HAND' | 'PEP' | 'UNEP' | 'UKEP';
export type FolderType = 'orders' | 'regulations' | 'provisions' | 'incoming' | 'outgoing' | 'tasks';

export interface DocumentEmployee {
  id: number;
  uuid: string;
  last_name: string;
  first_name: string;
  middle_name?: string;
  full_name: string;
  position?: string;
  login: string;
}

export interface Document {
  id: number;
  uuid: string;
  name: string;
  type: string;
  folder: FolderType;
  registration_number: string;
  signer: string;
  signer_full_name?: string;
  signer_inn?: string;
  executor?: string;
  created_at: string;
  signature_date?: string;
  original_file_name: string;
  original_file_size: number;
  signature_type: SignatureType;
  goskey_valid?: boolean;
  goskey_data?: any;
  status: DocumentStatus;
  transferred_to_ped_id: boolean;
  ped_id_link?: string;
  has_sig_file: boolean;
  signed_copy_url?: string;
  custom_folder_id?: number | null;
  metadata_outdated?: boolean;
  created_by_employee_id?: number | null;
  signed_by_employee_id?: number | null;
  signer_employee_id?: number | null;
  executor_employee_id?: number | null;
  created_by_employee_name?: string | null;
  signed_by_employee_name?: string | null;
  signer_employee_name?: string | null;
  executor_employee_name?: string | null;
}

export interface PaginatedResponse {
  items: Document[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const getDocuments = async (
  page: number = 1,
  size: number = 20,
  folder?: FolderType,
  search?: string,
  customFolderId?: number,
): Promise<PaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (folder) params.append('folder', folder);
  if (search) params.append('search', search);
  if (customFolderId) params.append('custom_folder_id', String(customFolderId));

  const response = await apiClient.get(`/api/documents?${params.toString()}`);
  return response.data;
};

export const getDocument = async (uuid: string): Promise<Document> => {
  const response = await apiClient.get(`/api/documents/${uuid}`);
  return response.data;
};

export const uploadDocument = async (
  file: File,
  data: {
    name: string;
    type: string;
    folder: FolderType;
    registration_number: string;
    signer: string;
    signer_full_name?: string;
    signer_inn?: string;
    executor?: string;
    signature_type: SignatureType;
    custom_folder_id?: number | null;
    signer_employee_id?: number | null;
    executor_employee_id?: number | null;
  }
): Promise<Document> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', data.name);
  formData.append('type', data.type);
  formData.append('folder', data.folder);
  formData.append('registration_number', data.registration_number);
  formData.append('signer', data.signer);
  if (data.signer_full_name) formData.append('signer_full_name', data.signer_full_name);
  if (data.signer_inn) formData.append('signer_inn', data.signer_inn);
  if (data.executor) formData.append('executor', data.executor);
  formData.append('signature_type', data.signature_type);
  if (data.custom_folder_id) formData.append('custom_folder_id', String(data.custom_folder_id));
  if (data.signer_employee_id) formData.append('signer_employee_id', String(data.signer_employee_id));
  if (data.executor_employee_id) formData.append('executor_employee_id', String(data.executor_employee_id));

  const response = await apiClient.post('/api/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const uploadSignatureFile = async (uuid: string, file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);

  await apiClient.post(`/api/documents/upload-sig/${uuid}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const verifySignature = async (uuid: string): Promise<any> => {
  const response = await apiClient.post(`/api/documents/verify/${uuid}`);
  return response.data;
};

export const visualizeSignature = async (
  uuid: string,
  stampX?: number,
  stampY?: number,
  stampSize?: number,
  stampUrl?: string,
  stampPage?: number,
  previewWidth?: number,
): Promise<any> => {
  const data: any = {};
  if (stampX !== undefined) {
    data.stamp_x = stampX;
  }
  if (stampY !== undefined) {
    data.stamp_y = stampY;
  }
  if (stampSize !== undefined) {
    data.stamp_size = stampSize;
  }
  if (stampUrl) {
    data.stamp_url = stampUrl;
  }
  if (stampPage !== undefined) {
    data.stamp_page = stampPage;
  }
  if (previewWidth !== undefined) {
    data.preview_width = previewWidth;
  }
  const response = await apiClient.post(`/api/documents/visualize/${uuid}`, data);
  return response.data;
};

export const updateDocument = async (
  uuid: string,
  data: {
    name?: string;
    type?: string;
    folder?: FolderType;
    registration_number?: string;
    signer?: string;
    signer_full_name?: string;
    signer_inn?: string;
    executor?: string;
    created_at?: string;
    custom_folder_id?: number | null;
  }
): Promise<Document> => {
  const response = await apiClient.put(`/api/documents/${uuid}`, data);
  return response.data;
};

export const downloadOriginal = (uuid: string): string => {
  const token = getAccessToken();
  return `${API_BASE_URL}/api/documents/download/${uuid}${token ? `?token=${token}` : ''}`;
};

export const downloadArchive = (uuid: string): string => {
  const token = getAccessToken();
  return `${API_BASE_URL}/api/documents/download/archive/${uuid}${token ? `?token=${token}` : ''}`;
};

export const downloadSignedCopy = (uuid: string): string => {
  const token = getAccessToken();
  return `${API_BASE_URL}/api/documents/download/signed/${uuid}${token ? `?token=${token}` : ''}`;
};

export const downloadDocumentWithStamp = (uuid: string): string => {
  const token = getAccessToken();
  return `${API_BASE_URL}/api/documents/download/signed/${uuid}${token ? `?token=${token}` : ''}`;
};

export const getFolderCounts = async (): Promise<Record<string, number>> => {
  const response = await apiClient.get(`/api/documents/counts/summary`);
  return response.data;
};

export const deleteDocument = async (uuid: string): Promise<void> => {
  await apiClient.delete(`/api/documents/${uuid}`);
};

export const getDocumentEmployees = async (): Promise<DocumentEmployee[]> => {
  const response = await apiClient.get(`/api/documents/employees`);
  return response.data;
};

export const updateDocumentWithEmployees = async (
  uuid: string,
  data: {
    name?: string;
    type?: string;
    folder?: FolderType;
    registration_number?: string;
    signer?: string;
    signer_full_name?: string;
    signer_inn?: string;
    executor?: string;
    created_at?: string;
    custom_folder_id?: number | null;
    signer_employee_id?: number | null;
    executor_employee_id?: number | null;
  }
): Promise<Document> => {
  const response = await apiClient.put(`/api/documents/${uuid}`, data);
  return response.data;
};

// ===== РџРѕС‡С‚Р° =====
export interface Organization {
  id: number;
  uuid: string;
  name: string;
  inn?: string;
  kpp?: string;
  address?: string;
  contact_person?: string;
  contact_email?: string;
}

export type MailFolder = 'incoming' | 'outgoing' | 'drafts' | 'deleted';

export interface MailMessage {
  id: number;
  uuid: string;
  direction: string;
  sender_org_name: string;
  recipient_org_name: string;
  recipient_org_id?: number;
  sender_org_id?: number;
  document_uuid?: string;
  document_name?: string;
  comment?: string;
  request_signature: boolean;
  status: string;
  created_at: string;
  sent_at?: string;
  read_at?: string;
  is_deleted: boolean;
  parent_mail_uuid?: string;
}

export interface MailPaginatedResponse {
  items: MailMessage[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const getOrganizations = async (search?: string): Promise<Organization[]> => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  const response = await apiClient.get(`/api/mail/organizations?${params.toString()}`);
  return response.data;
};

export const getOrganization = async (id: number): Promise<Organization> => {
  const response = await apiClient.get(`/api/mail/organizations/${id}`);
  return response.data;
};

export const getMailMessages = async (
  folder: MailFolder,
  page: number = 1,
  size: number = 20,
  search?: string
): Promise<MailPaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('folder', folder);
  params.append('page', String(page));
  params.append('size', String(size));
  if (search) params.append('search', search);
  const response = await apiClient.get(`/api/mail/?${params.toString()}`);
  return response.data;
};

export const sendMail = async (data: {
  recipient_org_id: number;
  document_uuid?: string;
  document_name?: string;
  comment?: string;
  request_signature: boolean;
}): Promise<MailMessage> => {
  const response = await apiClient.post('/api/mail/', data);
  return response.data;
};

export const saveMailDraft = async (data: {
  recipient_org_id: number;
  document_uuid?: string;
  document_name?: string;
  comment?: string;
  request_signature: boolean;
}): Promise<MailMessage> => {
  const response = await apiClient.post('/api/mail/draft', data);
  return response.data;
};

export const deleteMail = async (uuid: string): Promise<void> => {
  await apiClient.delete(`/api/mail/${uuid}`);
};

export const permanentDeleteMail = async (uuid: string): Promise<void> => {
  await apiClient.delete(`/api/mail/${uuid}/permanent`);
};

export const restoreMail = async (uuid: string): Promise<void> => {
  await apiClient.put(`/api/mail/${uuid}/restore`);
};

export const getMailCounts = async (): Promise<Record<string, number>> => {
  const response = await apiClient.get('/api/mail/counts');
  return response.data;
};

export const signAndReplyMail = async (mailUuid: string, sigFile: File): Promise<MailMessage> => {
  const formData = new FormData();
  formData.append('sig_file', sigFile);
  const response = await apiClient.post(`/api/mail/${mailUuid}/sign-and-reply`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// ===== РљРѕРЅС‚Р°РєС‚С‹ =====
export interface Contact {
  id: number;
  uuid: string;
  last_name: string;
  first_name: string;
  middle_name?: string;
  organization?: string;
  department?: string;
  position?: string;
  mobile_phone?: string;
  email?: string;
  birthday?: string;
  notes?: string;
  contact_group?: string;
  created_at: string;
}

export interface ContactPaginatedResponse {
  items: Contact[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const getContacts = async (
  page: number = 1,
  size: number = 20,
  search?: string
): Promise<ContactPaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (search) params.append('search', search);
  const response = await apiClient.get(`/api/contacts/?${params.toString()}`);
  return response.data;
};

export const createContact = async (data: Partial<Contact>): Promise<Contact> => {
  const response = await apiClient.post('/api/contacts/', data);
  return response.data;
};

export const updateContact = async (uuid: string, data: Partial<Contact>): Promise<Contact> => {
  const response = await apiClient.put(`/api/contacts/${uuid}`, data);
  return response.data;
};

export const deleteContact = async (uuid: string): Promise<void> => {
  await apiClient.delete(`/api/contacts/${uuid}`);
};

// ===== РЁС‚Р°РјРїС‹ (РјР°РїРїРёРЅРі РїРѕРґРїРёСЃР°РЅС‚ в†’ С€С‚Р°РјРї) =====
export const getStampMapping = async (): Promise<Record<string, string>> => {
  const response = await apiClient.get(`/api/documents/stamps/mapping`);
  return response.data;
};

// ===== РљР°СЃС‚РѕРјРЅС‹Рµ РїР°РїРєРё =====
export interface CustomFolder {
  id: number;
  uuid: string;
  name: string;
  created_at: string;
}

export const getCustomFolders = async (): Promise<{ items: CustomFolder[]; total: number }> => {
  const response = await apiClient.get(`/api/documents/folders/custom`);
  return response.data;
};

export const createCustomFolder = async (name: string): Promise<CustomFolder & { message: string }> => {
  const response = await apiClient.post(`/api/documents/folders/custom`, { name });
  return response.data;
};

export const deleteCustomFolder = async (uuid: string): Promise<{ message: string }> => {
  const response = await apiClient.delete(`/api/documents/folders/custom/${uuid}`);
  return response.data;
};

// ===== РЎРѕС‚СЂСѓРґРЅРёРєРё =====
export interface Employee {
  id: number;
  uuid: string;
  org_id: number;
  last_name: string;
  first_name: string;
  middle_name?: string;
  position?: string;
  department?: string;
  roles: string[];
  phone?: string;
  email?: string;
  birthday?: string;
  notes?: string;
  login: string;
  is_active: boolean;
  profile_completed: boolean;
  created_at: string;
  updated_at?: string;
}

export interface EmployeePaginatedResponse {
  items: Employee[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const getEmployees = async (
  page: number = 1,
  size: number = 20,
  search?: string
): Promise<EmployeePaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (search) params.append('search', search);
  const response = await apiClient.get(`/api/employees/?${params.toString()}`);
  return response.data;
};

export const getEmployee = async (uuid: string): Promise<Employee> => {
  const response = await apiClient.get(`/api/employees/${uuid}`);
  return response.data;
};

export const createEmployee = async (data: {
  last_name: string;
  first_name: string;
  middle_name?: string;
  position?: string;
  department?: string;
  roles: string[];
  phone?: string;
  email?: string;
  birthday?: string;
  notes?: string;
}): Promise<Employee & { generated_password: string; message: string }> => {
  const response = await apiClient.post('/api/employees/', data);
  return response.data;
};

export const updateEmployee = async (uuid: string, data: Partial<Employee>): Promise<Employee> => {
  const response = await apiClient.put(`/api/employees/${uuid}`, data);
  return response.data;
};

export const deactivateEmployee = async (uuid: string): Promise<{ message: string }> => {
  const response = await apiClient.delete(`/api/employees/${uuid}`);
  return response.data;
};

export const searchEmployees = async (q: string): Promise<Employee[]> => {
  const response = await apiClient.get('/api/employees/search', { params: { q } });
  return response.data;
};

export const getEmployeeRoles = async (): Promise<EmployeeRoleListResponse> => {
  const response = await apiClient.get('/api/employees/roles');
  return response.data;
};

export default apiClient;
// ===== РћР±СЂР°С‰РµРЅРёСЏ РіСЂР°Р¶РґР°РЅ (РїСѓР±Р»РёС‡РЅС‹Рµ + РІРЅСѓС‚СЂРµРЅРЅРёР№ СЂР°Р·РґРµР») =====

// РљР»РёРµРЅС‚ Р‘Р•Р— Р°РІС‚РѕСЂРёР·Р°С†РёРё вЂ” РґР»СЏ РїСѓР±Р»РёС‡РЅРѕР№ РёРЅС‚РµСЂРЅРµС‚-РїСЂРёС‘РјРЅРѕР№
export const publicApiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

export type AppealKind = 'complaint' | 'application' | 'suggestion';
export type AppealApplicantType = 'citizen' | 'organization';
export type AppealStatus = 'new' | 'registered' | 'on_execution' | 'answered' | 'redirected';

export interface AppealTarget {
  id: number;
  name: string;
}

export interface AppealListItem {
  id: number;
  uuid: string;
  system_number: string;
  reg_number?: string | null;
  applicant_type: AppealApplicantType;
  kind: AppealKind;
  status: AppealStatus;
  content_preview: string;
  created_at?: string;
  registered_at?: string | null;
  answered_at?: string | null;
  executor_employee_id?: number | null;
  executor_name?: string | null;
  has_attachments: boolean;
  is_redirected_in: boolean;
  redirect_from_org_name?: string | null;
  deadline?: string | null;
  days_left?: number | null;
  overdue: boolean;
}

export interface AppealHistoryEntry {
  id: number;
  employee_name?: string | null;
  action: string;
  comment?: string | null;
  created_at?: string | null;
}

export interface AppealCard extends AppealListItem {
  content: string;
  internal_comment?: string | null;
  reply_text?: string | null;
  register_deadline_iso?: string | null;
  applicant: {
    full_name: string;
    email: string;
    phone?: string | null;
    org_full_name?: string | null;
    org_short_name?: string | null;
    org_director?: string | null;
  };
  attachments: { id: number; file_name: string; file_size: number; uploaded_at?: string | null }[];
  linked_documents: {
    link_id: number;
    document_uuid: string;
    name: string;
    registration_number: string;
    original_file_name: string;
    has_signed_copy: boolean;
    signature_type?: string | null;
  }[];
  history: AppealHistoryEntry[];
}

// ===== РџСѓР±Р»РёС‡РЅС‹Рµ РјРµС‚РѕРґС‹ =====

export const getAppealTargets = async (): Promise<AppealTarget[]> => {
  const r = await publicApiClient.get(`/api/public/appeals/targets`);
  return r.data;
};

export const submitPublicAppeal = async (formData: FormData): Promise<{ message: string; system_number: string; register_deadline?: string }> => {
  const r = await publicApiClient.post(`/api/public/appeals/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
};

export const checkAppealStatus = async (systemNumber: string, email: string) => {
  const params = new URLSearchParams({ email });
  const r = await publicApiClient.get(`/api/public/appeals/status/${encodeURIComponent(systemNumber)}?${params}`);
  return r.data;
};

// ===== Р’РЅСѓС‚СЂРµРЅРЅРёР№ СЂР°Р·РґРµР» =====

export interface AppealListParams {
  page?: number;
  size?: number;
  status?: AppealStatus | '';
  overdue?: boolean;
  search?: string;
}

export const getAppeals = async (params: AppealListParams): Promise<PaginatedResponse & { items: AppealListItem[] }> => {
  const q = new URLSearchParams();
  q.append('page', String(params.page ?? 1));
  q.append('size', String(params.size ?? 20));
  if (params.status) q.append('status', params.status);
  if (params.overdue) q.append('overdue', 'true');
  if (params.search) q.append('search', params.search);
  const response = await apiClient.get(`/api/appeals/?${q.toString()}`);
  return response.data;
};

export const getAppealCard = async (uuid: string): Promise<AppealCard> => {
  const response = await apiClient.get(`/api/appeals/${uuid}`);
  return response.data;
};

export const registerAppeal = async (uuid: string, regNumber: string) => {
  const response = await apiClient.post(`/api/appeals/${uuid}/register`, { reg_number: regNumber });
  return response.data;
};

export const takeAppealToWork = async (uuid: string, executorId: number, comment?: string) => {
  const response = await apiClient.post(`/api/appeals/${uuid}/take-work`, {
    executor_id: executorId,
    comment: comment || undefined,
  });
  return response.data;
};

export const redirectAppeal = async (uuid: string, targetOrgId: number, comment?: string) => {
  const response = await apiClient.post(`/api/appeals/${uuid}/redirect`, {
    target_org_id: targetOrgId,
    comment: comment || undefined,
  });
  return response.data;
};

export const replyToAppeal = async (
  uuid: string,
  text: string,
  linkIds: number[],
): Promise<{ message: string; email_sent: boolean; warning?: string }> => {
  const response = await apiClient.post(`/api/appeals/${uuid}/reply`, {
    text,
    link_ids: linkIds,
  });
  return response.data;
};

export const getLinkedDocuments = async (uuid: string) => {
  const response = await apiClient.get(`/api/appeals/${uuid}/documents`);
  return response.data as AppealCard['linked_documents'];
};

export const linkDocumentToAppeal = async (appealUuid: string, documentUuid: string) => {
  const response = await apiClient.post(`/api/appeals/${appealUuid}/documents/${documentUuid}`);
  return response.data;
};

export const unlinkDocumentFromAppeal = async (appealUuid: string, documentUuid: string) => {
  const response = await apiClient.delete(`/api/appeals/${appealUuid}/documents/${documentUuid}`);
  return response.data;
};

export const downloadAppealAttachment = (attachmentId: number): string => {
  const token = getAccessToken();
  return `${API_BASE_URL}/api/appeals/attachments/${attachmentId}/download${token ? `?token=${token}` : ''}`;
};

