const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// Auto-refresh token on 401
let isRefreshing = false;
let refreshQueue = [];

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`
      }
    });
    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    if (data.refresh_token) {
      localStorage.setItem('refreshToken', data.refresh_token);
    }
    return true;
  } catch {
    return false;
  }
}

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });

  // Auto-refresh on 401
  if (res.status === 401 && url !== '/auth/login' && url !== '/auth/me' && url !== '/auth/refresh') {
    if (!isRefreshing) {
      isRefreshing = true;
      const refreshed = await refreshAccessToken();
      isRefreshing = false;

      if (refreshed) {
        // Retry original request with new token
        const retryRes = await fetch(`${API_BASE}${url}`, {
          ...options,
          headers: { ...headers(), ...options.headers },
        });
        if (retryRes.ok) return retryRes.json();
      }
    }

    // Refresh failed — force logout
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Auth
export const login = (username, password) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const logout = () =>
  request('/auth/logout', { method: 'POST' }).catch(() => {});

export const getMe = () => request('/auth/me');

// Conversations
export const getConversations = (params = {}) => {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.category) q.set('category', params.category);
  if (params.search) q.set('search', params.search);
  if (params.tab) q.set('tab', params.tab);
  if (params.label_id) q.set('label_id', params.label_id);
  if (params.priority) q.set('priority', params.priority);
  if (params.show_closed) q.set('show_closed', 'true');
  return request(`/conversations/?${q.toString()}`);
};

export const getConversationCounts = () => request('/conversations/counts');

export const getConversation = (id) => request(`/conversations/${id}`);

export const createConversation = (data) =>
  request('/conversations/', { method: 'POST', body: JSON.stringify(data) });

export const updateConversation = (id, data) =>
  request(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const transferConversation = (id, agentId) =>
  request(`/conversations/${id}/transfer`, { method: 'POST', body: JSON.stringify({ agent_id: agentId }) });

export const shareConversation = (id, agentId) =>
  request(`/conversations/${id}/share`, { method: 'POST', body: JSON.stringify({ agent_id: agentId }) });

// Messages
export const getMessages = (convId, search = '') => {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/conversations/${convId}/messages/${q}`);
};

export const sendMessage = (convId, data) =>
  request(`/conversations/${convId}/messages/`, { method: 'POST', body: JSON.stringify(data) });

export const markRead = (convId, msgId) =>
  request(`/conversations/${convId}/messages/${msgId}/read`, { method: 'POST' });

export const deleteMessage = (convId, msgId) =>
  request(`/conversations/${convId}/messages/${msgId}`, { method: 'DELETE' });

// Contacts
export const getContacts = (params = {}) => {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.category) q.set('category', params.category);
  return request(`/contacts/?${q.toString()}`);
};

export const getContact = (id) => request(`/contacts/${id}`);
export const updateContact = (id, data) =>
  request(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Agents
export const getAgents = () => request('/agents/');
export const createAgent = (data) =>
  request('/agents/', { method: 'POST', body: JSON.stringify(data) });
export const updateAgent = (id, data) =>
  request(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const resetAgentPassword = (id, password) =>
  request(`/agents/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: password }) });
export const deleteAgent = (id) =>
  request(`/agents/${id}`, { method: 'DELETE' });

// Templates
export const getTemplates = () => request('/templates/');
export const createTemplate = (data) =>
  request('/templates/', { method: 'POST', body: JSON.stringify(data) });
export const updateTemplate = (id, data) =>
  request(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTemplate = (id) =>
  request(`/templates/${id}`, { method: 'DELETE' });

// Labels
export const getLabels = () => request('/labels/');
export const createLabel = (data) =>
  request('/labels/', { method: 'POST', body: JSON.stringify(data) });
export const updateLabel = (id, data) =>
  request(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteLabel = (id) =>
  request(`/labels/${id}`, { method: 'DELETE' });

// Campaigns
export const getCampaigns = () => request('/campaigns/');
export const createCampaign = (data) =>
  request('/campaigns/', { method: 'POST', body: JSON.stringify(data) });
export const sendCampaign = (id) =>
  request(`/campaigns/${id}/send`, { method: 'POST' });
export const getCampaignRecipients = (id) =>
  request(`/campaigns/${id}/recipients`);

// Dashboard
export const getDashboard = (days = 7) => request(`/dashboard/?days=${days}`);

// WhatsApp
export const getWhatsAppNumbers = () => request('/webhook/whatsapp/numbers');

export default {
  login, logout, getMe,
  getConversations, getConversationCounts, getConversation, createConversation, updateConversation, transferConversation, shareConversation,
  getMessages, sendMessage, markRead, deleteMessage,
  getContacts, getContact, updateContact,
  getAgents, createAgent, updateAgent, resetAgentPassword, deleteAgent,
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getLabels, createLabel, updateLabel, deleteLabel,
  getCampaigns, createCampaign, sendCampaign, getCampaignRecipients,
  getDashboard,
  getWhatsAppNumbers
};
