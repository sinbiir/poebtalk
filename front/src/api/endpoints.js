import api from './http';
import { PAGE_SIZE } from '../config';

export const register = async ({ username, password }) => {
  const { data } = await api.post('/auth/register', { username, password });
  return data;
};

export const login = async ({ username, password }) => {
  const { data } = await api.post('/auth/login', { username, password });
  return data;
};

export const getDialogs = async () => {
  const { data } = await api.get('/dialogs');
  return data;
};

export const createDialog = async ({ peerUserId, peerUsername }) => {
  const body = {};
  if (peerUserId) body.peer_user_id = peerUserId;
  if (peerUsername) body.peer_username = peerUsername;
  const { data } = await api.post('/dialogs', body);
  return data;
};

export const getMessages = async (dialogId, params = {}) => {
  const query = { limit: PAGE_SIZE, ...params };
  const { data } = await api.get(`/dialogs/${dialogId}/messages`, { params: query });
  return data;
};

export const postMessage = async (dialogId, body) => {
  const { data } = await api.post(`/dialogs/${dialogId}/messages`, body);
  return data;
};

export const postReadUpTo = async (dialogId, body) => {
  const { data } = await api.post(`/dialogs/${dialogId}/read_up_to`, body);
  return data;
};

export const uploadFile = async formData => {
  // Let axios set the multipart boundary automatically
  const { data } = await api.post('/uploads', formData);
  return data;
};
