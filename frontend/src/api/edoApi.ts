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

/** Сохраняет в localStorage всё, что фронт кладёт после успешного логина
 *  (используется и обычным login, и ESA-exchange, чтобы не дублировать). */
export function persistLogin(resp: EmployeeLoginResponse): void {
  setTokens(resp.access_token, resp.refresh_token);
  localStorage.setItem('org_name', resp.org_name);
  localStorage.setItem('org_id', String(resp.org_id));
  localStorage.setItem('employee_id', String(resp.employee_id));
  localStorage.setItem('employee_name', resp.employee_name);
  localStorage.setItem('employee_roles', JSON.stringify(resp.roles));
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

// Добавляем access token к каждому запросу
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Автоматическое обновление токена при 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void; config: any }> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Если 401 и это не повторный запрос и не запрос на login/refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        // Ставим в очередь пока обновляется токен
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

        // Повторяем запросы из очереди
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

/** Карточка сотрудника для UI-выбора, когда ESA-юзеру соответствует >1 профиля. */
export interface EisEmployeeCandidate {
  employee_id: number;
  employee_name: string;
  position?: string | null;
  department?: string | null;
  roles: string[];
  org_id: number;
  org_name: string;
  is_active: boolean;
  profile_completed: boolean;
}

/** Ответ /api/auth/eis/exchange: либо токены, либо список кандидатов на выбор. */
export type EisExchangeResult =
  | (EmployeeLoginResponse & { kind: 'tokens'; auth_provider?: string })
  | { kind: 'choose'; candidates: EisEmployeeCandidate[] };

/** Ответ /api/auth/eis/profiles: профили учётки ЕИС для переключателя в шапке. */
export interface EisProfilesResponse {
  profiles: EisEmployeeCandidate[];
  current_employee_id: number;
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
/** Данные текущей организации (GET /api/auth/me-org). */
export interface OrgInfo {
  id: number;
  uuid: string;
  name: string;
  inn?: string | null;
  is_active: boolean;
  /** Признак «Является школой» — открывает раздел «Реестры → Классы». */
  is_school: boolean;
  license_status: string;
  license_expire: string;
  license_max_docs: number;
  license_max_orgs: number;
}

export const authApi = {
  login: async (login: string, password: string): Promise<EmployeeLoginResponse> => {
    const response = await apiClient.post('/api/auth/login', { login, password });
    persistLogin(response.data);
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

  getCurrentOrg: async (): Promise<OrgInfo> => {
    const response = await apiClient.get('/api/auth/me-org');
    return response.data;
  },

  completeProfile: async (data: ProfileCompleteRequest): Promise<EmployeeLoginResponse> => {
    const response = await apiClient.post('/api/auth/complete-profile', data);
    persistLogin(response.data);
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

  /** Завершение ESA-входа: обмен одноразового кода из /auth/eis/success на JWT или список кандидатов. */
  exchangeEis: async (code: string, employeeId?: number): Promise<EisExchangeResult> => {
    const body: { code: string; employee_id?: number } = { code };
    if (employeeId !== undefined) body.employee_id = employeeId;
    const response = await apiClient.post('/api/auth/eis/exchange', body);
    return response.data;
  },

  /** Профили текущей учётки ЕИС. Пусто — вход по паролю или профиль единственный. */
  getEisProfiles: async (): Promise<EisProfilesResponse> => {
    const response = await apiClient.get('/api/auth/eis/profiles');
    return response.data;
  },

  /** Смена профиля без повторного входа: сервер выдаёт новую пару токенов,
   *  сразу сохраняем её — дальше нужна полная перезагрузка страницы. */
  switchEisProfile: async (employeeId: number): Promise<EmployeeLoginResponse> => {
    const response = await apiClient.post('/api/auth/eis/switch-profile', { employee_id: employeeId });
    persistLogin(response.data);
    return response.data;
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

/** Дополнительные фильтры списка документов. */
export interface DocumentFilters {
  signature_type?: SignatureType;
  /** Начало периода по дате документа, включительно (YYYY-MM-DD) */
  date_from?: string;
  /** Конец периода по дате документа, включительно (YYYY-MM-DD) */
  date_to?: string;
}

export const getDocuments = async (
  page: number = 1,
  size: number = 20,
  folder?: FolderType,
  search?: string,
  customFolderId?: number,
  filters: DocumentFilters = {},
): Promise<PaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (folder) params.append('folder', folder);
  if (search) params.append('search', search);
  if (customFolderId) params.append('custom_folder_id', String(customFolderId));
  if (filters.signature_type) params.append('signature_type', filters.signature_type);
  if (filters.date_from) params.append('date_from', filters.date_from);
  if (filters.date_to) params.append('date_to', filters.date_to);

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
    /** Дата документа (ISO). Не задана — сервер поставит текущий момент. */
    created_at?: string;
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
  if (data.created_at) formData.append('created_at', data.created_at);

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

// ===== Почта =====
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

// ===== Контакты =====
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

// ===== Штампы (маппинг подписант → штамп) =====
export const getStampMapping = async (): Promise<Record<string, string>> => {
  const response = await apiClient.get(`/api/documents/stamps/mapping`);
  return response.data;
};

// ===== Кастомные папки =====
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

// ===== Сотрудники =====
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

// ===== Вакансии (раздел «Реестры → Вакансии») =====

export interface Vacancy {
  id: number;
  uuid: string;
  org_id: number;
  name: string;                       // Наименование вакансии
  position: string;                   // Должность по классификатору
  teaching_load?: number | null;      // Учебная нагрузка, часов в неделю (только для учителей, <= 35)
  description?: string | null;        // Описание вакансии
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface VacancyPaginatedResponse {
  items: Vacancy[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface VacancyPosition {
  value: string;
  label: string;
  is_teacher: boolean; // для учительских должностей обязательна учебная нагрузка
}

export interface VacancyPositionListResponse {
  positions: VacancyPosition[];
}

export const getVacancies = async (
  page: number = 1,
  size: number = 20,
  search?: string
): Promise<VacancyPaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (search) params.append('search', search);
  const response = await apiClient.get(`/api/vacancies/?${params.toString()}`);
  return response.data;
};

export const getVacancy = async (uuid: string): Promise<Vacancy> => {
  const response = await apiClient.get(`/api/vacancies/${uuid}`);
  return response.data;
};

/** Классификатор должностей — единый источник списка для выпадающего списка. */
export const getVacancyPositions = async (): Promise<VacancyPositionListResponse> => {
  const response = await apiClient.get('/api/vacancies/positions');
  return response.data;
};

export const createVacancy = async (data: {
  name: string;
  position: string;
  teaching_load?: number | null;
  description?: string | null;
}): Promise<Vacancy> => {
  const response = await apiClient.post('/api/vacancies/', data);
  return response.data;
};

export const updateVacancy = async (
  uuid: string,
  data: {
    name?: string;
    position?: string;
    teaching_load?: number | null;
    description?: string | null;
    is_active?: boolean;
  }
): Promise<Vacancy> => {
  const response = await apiClient.put(`/api/vacancies/${uuid}`, data);
  return response.data;
};

export const deactivateVacancy = async (uuid: string): Promise<{ message: string }> => {
  const response = await apiClient.delete(`/api/vacancies/${uuid}`);
  return response.data;
};

// ===== Классы школы (раздел «Реестры → Классы») =====
// Раздел доступен только организациям с признаком «Является школой».

export interface SchoolClass {
  id: number;
  uuid: string;
  org_id: number;
  parallel: number;                    // Параллель, 1–11
  letter: string;                      // Литера класса («А», «Б»…)
  name?: string | null;                // Название класса (необязательно)
  preprofile?: string | null;          // Предпрофиль — только для 5–9
  profile?: string | null;             // Профиль — только для 10–11
  teacher_employee_id?: number | null; // Классный руководитель
  teacher_fio?: string | null;         // ФИО руководителя (отдаёт бэкенд)
  teacher_position?: string | null;
  shift: string;                       // 'first' | 'second'
  academic_year: string;               // «2026/2027»
  is_graduating: boolean;              // выпускной класс (9 или 11) — считает бэкенд
  // Образовательная программа класса (одна) — назначается из реестра «Программы»
  program_id?: number | null;
  program_short_name?: string | null;
  program_kind?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SchoolClassPaginatedResponse {
  items: SchoolClass[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface SchoolClassOption {
  value: string;
  label: string;
}

/** Все справочники формы класса — одним запросом с бэкенда. */
export interface SchoolClassOptions {
  parallels: number[];
  preprofiles: string[];
  profiles: string[];
  shifts: SchoolClassOption[];
  academic_years: string[];
  current_academic_year: string;
  preprofile_parallels: number[];
  profile_parallels: number[];
  graduating_parallels: number[];      // выпускные параллели (9, 11)
}

/** Фильтры списка классов (уходят query-параметрами). */
export interface SchoolClassFilters {
  search?: string;
  academic_year?: string;
  parallel?: number;
  /** true — только выпускные (9, 11); не задано — все */
  graduating?: boolean;
  /** Сменность обучения: 'first' | 'second'; не задано — все */
  shift?: string;
}

export interface SchoolClassTeacher {
  id: number;
  uuid: string;
  fio: string;
  position?: string | null;
}

export interface SchoolClassPayload {
  parallel: number;
  letter: string;
  name?: string | null;
  preprofile?: string | null;
  profile?: string | null;
  teacher_employee_id?: number | null;
  shift: string;
  academic_year?: string;
}

export const getClasses = async (
  page: number = 1,
  size: number = 50,
  filters: SchoolClassFilters = {}
): Promise<SchoolClassPaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (filters.search) params.append('search', filters.search);
  if (filters.academic_year) params.append('academic_year', filters.academic_year);
  if (filters.parallel != null) params.append('parallel', String(filters.parallel));
  // graduating шлём только когда фильтр включён — иначе показываем все классы
  if (filters.graduating != null) params.append('graduating', String(filters.graduating));
  if (filters.shift) params.append('shift', filters.shift);
  const response = await apiClient.get(`/api/classes/?${params.toString()}`);
  return response.data;
};

export const getClass = async (uuid: string): Promise<SchoolClass> => {
  const response = await apiClient.get(`/api/classes/${uuid}`);
  return response.data;
};

export const getClassOptions = async (): Promise<SchoolClassOptions> => {
  const response = await apiClient.get('/api/classes/options');
  return response.data;
};

export const getClassTeachers = async (): Promise<SchoolClassTeacher[]> => {
  const response = await apiClient.get('/api/classes/teachers');
  return response.data.teachers;
};

export const createClass = async (data: SchoolClassPayload): Promise<SchoolClass> => {
  const response = await apiClient.post('/api/classes/', data);
  return response.data;
};

export const updateClass = async (
  uuid: string,
  data: Partial<SchoolClassPayload>
): Promise<SchoolClass> => {
  const response = await apiClient.put(`/api/classes/${uuid}`, data);
  return response.data;
};

export const deleteClass = async (uuid: string): Promise<{ message: string }> => {
  const response = await apiClient.delete(`/api/classes/${uuid}`);
  return response.data;
};

// ===== Образовательные программы школы (раздел «Реестры → Программы») =====

export interface Program {
  id: number;
  uuid: string;
  org_id: number;
  kind: string;                        // Вид программы (полное наименование)
  official_name: string;               // «Официальное наименование» — заполняет сервер, не редактируется
  clarification?: string | null;       // «Уточняющая информация» — пункт справочника
  clarification_other?: string | null; // произвольный текст для пункта «иное…»
  short_name?: string | null;          // «Краткое название» / аббревиатура
  order_document_id?: number | null;   // «Приказ, утверждающий»
  order_label?: string | null;         // готовая подпись приказа
  order_document_uuid?: string | null; // UUID приказа — для скачивания файла
  /** Что скачает фронт: 'signed' — копия со штампом ЭП, 'original' — сам файл, null — файла нет */
  order_download_kind?: 'signed' | 'original' | null;
  classes_count: number;               // сколько классов используют программу
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProgramPaginatedResponse {
  items: Program[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface ProgramOptions {
  kinds: string[];
  clarifications: string[];
  /** Значение пункта, при котором показывается поле произвольного текста */
  clarification_other: string;
}

/** Класс в окне назначения программы. */
export interface ProgramClassItem {
  uuid: string;
  parallel: number;
  letter: string;
  label: string;                              // «5А»
  name?: string | null;
  assigned: boolean;                          // эта программа назначена классу
  current_program_id?: number | null;
  current_program_short_name?: string | null;
}

export interface ProgramClassListResponse {
  items: ProgramClassItem[];
  assigned_count: number;
}

export interface ProgramPayload {
  kind: string;
  clarification?: string | null;
  clarification_other?: string | null;
  short_name?: string | null;
  order_document_id?: number | null;
}

export const getPrograms = async (
  page: number = 1,
  size: number = 50,
  search?: string
): Promise<ProgramPaginatedResponse> => {
  const params = new URLSearchParams();
  params.append('page', String(page));
  params.append('size', String(size));
  if (search) params.append('search', search);
  const response = await apiClient.get(`/api/programs/?${params.toString()}`);
  return response.data;
};

export const getProgram = async (uuid: string): Promise<Program> => {
  const response = await apiClient.get(`/api/programs/${uuid}`);
  return response.data;
};

export const getProgramOptions = async (): Promise<ProgramOptions> => {
  const response = await apiClient.get('/api/programs/options');
  return response.data;
};

export const createProgram = async (data: ProgramPayload): Promise<Program> => {
  const response = await apiClient.post('/api/programs/', data);
  return response.data;
};

export const updateProgram = async (
  uuid: string,
  data: Partial<ProgramPayload>
): Promise<Program> => {
  const response = await apiClient.put(`/api/programs/${uuid}`, data);
  return response.data;
};

export const deleteProgram = async (
  uuid: string
): Promise<{ message: string; detached_classes: number }> => {
  const response = await apiClient.delete(`/api/programs/${uuid}`);
  return response.data;
};

/** Классы организации + признак, назначена ли им эта программа. */
export const getProgramClasses = async (uuid: string): Promise<ProgramClassListResponse> => {
  const response = await apiClient.get(`/api/programs/${uuid}/classes`);
  return response.data;
};

/** Назначить программу перечисленным классам (у остальных она снимается). */
export const assignProgramClasses = async (
  uuid: string,
  classUuids: string[]
): Promise<ProgramClassListResponse> => {
  const response = await apiClient.put(`/api/programs/${uuid}/classes`, {
    class_uuids: classUuids,
  });
  return response.data;
};

/**
 * Приказы организации — для поля «Приказ, утверждающий».
 * Поиск выполняется на сервере (по номеру, названию, подписанту), поэтому
 * список не ограничен первой сотней документов.
 */
export const getOrderDocuments = async (
  search?: string,
  limit: number = 20
): Promise<Document[]> => {
  const res = await getDocuments(1, limit, 'orders', search);
  return res.items;
};

/**
 * Подпись приказа в том же виде, что сервер отдаёт в поле order_label.
 * Нужна, чтобы выбранное в автокомплите значение выглядело одинаково
 * и в списке программ, и в выпадающем списке.
 */
export const orderDocumentLabel = (
  doc: Pick<Document, 'registration_number' | 'name'>
): string => {
  const number = (doc.registration_number || '').trim();
  const name = (doc.name || '').trim();
  if (number && name) return `№ ${number} — ${name}`;
  return number || name || 'Без названия';
};

export default apiClient;
// ===== Обращения граждан (публичные + внутренний раздел) =====

// Клиент БЕЗ авторизации — для публичной интернет-приёмной
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
  reply_type?: string | null;
  reply_format?: string;
  reply_state?: string | null;
  reply_prepared_by_name?: string | null;
  reply_prepared_by_id?: number | null;
  reply_approved_by_name?: string | null;
  register_deadline_iso?: string | null;
  org_name?: string | null;
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
    used_in_reply: boolean;
  }[];
  history: AppealHistoryEntry[];
}

export interface ResponseTemplate {
  uuid: string;
  name: string;
  body: string;
  is_system: boolean;
  org_id?: number | null;
  created_by_employee_id?: number | null;
}

// ===== Публичные методы =====

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

// ===== Внутренний раздел =====

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

/** Исполнители, которых можно назначить на обращение (только с правом согласования). */
export interface AppealExecutor {
  id: number;
  full_name: string;
  position: string;
  department: string;
  /** true, если сотрудник вправе согласовать/утвердить ответ (Админ/Руководитель/Утверждающий) */
  is_approver?: boolean;
}

export const getAppealExecutors = async (): Promise<AppealExecutor[]> => {
  const response = await apiClient.get(`/api/appeals/executors`);
  return response.data;
};

/** Сколько обращений ждут согласования ответа (красный счётчик в меню). */
export const getPendingApprovalCount = async (): Promise<number> => {
  const response = await apiClient.get(`/api/appeals/pending-approval/count`);
  return Number(response.data?.count || 0);
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
  replyType?: string,
  replyFormat?: string,
  decision?: string,
): Promise<{ message: string; email_sent: boolean; warning?: string; reply_state?: string }> => {
  const response = await apiClient.post(`/api/appeals/${uuid}/reply`, {
    text,
    link_ids: linkIds,
    reply_type: replyType || null,
    reply_format: replyFormat || 'message',
    decision: decision || 'send',
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

// ===== Шаблоны ответов =====

export const getResponseTemplates = async (): Promise<ResponseTemplate[]> => {
  const response = await apiClient.get(`/api/appeals/response-templates`);
  return response.data;
};

export const createResponseTemplate = async (name: string, body: string): Promise<ResponseTemplate> => {
  const response = await apiClient.post(`/api/appeals/response-templates`, { name, body });
  return response.data;
};

export const updateResponseTemplate = async (
  templateUuid: string,
  name: string,
  body: string,
): Promise<ResponseTemplate> => {
  const response = await apiClient.put(`/api/appeals/response-templates/${templateUuid}`, { name, body });
  return response.data;
};

export const deleteResponseTemplate = async (templateUuid: string) => {
  const response = await apiClient.delete(`/api/appeals/response-templates/${templateUuid}`);
  return response.data;
};

export const downloadAppealAttachment = (attachmentId: number): string => {
  const token = getAccessToken();
  return `${API_BASE_URL}/api/appeals/attachments/${attachmentId}/download${token ? `?token=${token}` : ''}`;
};

