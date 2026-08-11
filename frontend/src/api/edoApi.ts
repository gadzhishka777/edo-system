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
export const authApi = {
  login: async (login: string, password: string) => {
    const response = await apiClient.post('/api/auth/login', { login, password });
    setTokens(response.data.access_token, response.data.refresh_token);
    localStorage.setItem('org_name', response.data.org_name);
    localStorage.setItem('org_id', String(response.data.org_id));
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

  getCurrentOrg: async () => {
    const response = await apiClient.get('/api/auth/me');
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
};

export type DocumentStatus = 'draft' | 'pending' | 'signed' | 'rejected';
export type SignatureType = 'none' | 'HAND' | 'PEP' | 'UNEP' | 'UKEP';
export type FolderType = 'orders' | 'regulations' | 'provisions' | 'incoming' | 'outgoing' | 'tasks';

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

export default apiClient;