import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// In-memory cache so the SecureStore bridge is only crossed once per session.
// undefined = not yet read; null would mean "no token" but we only cache truthy values.
let _tokenCache: string | undefined = undefined;

export const getToken = async (): Promise<string | null> => {
  if (_tokenCache !== undefined) return _tokenCache;
  const token = Platform.OS === 'web'
    ? localStorage.getItem('auth_token')
    : await SecureStore.getItemAsync('auth_token');
  if (token) _tokenCache = token;
  return token ?? null;
};

const deleteToken = async () => {
  _tokenCache = undefined; // invalidate cache so next login re-reads from store
  if (Platform.OS === 'web') { localStorage.removeItem('auth_token'); return; }
  return SecureStore.deleteItemAsync('auth_token');
};

export const API_BASE_URL = __DEV__
  ? Platform.OS === 'web' ? 'http://localhost:8000' : 'http://100.70.65.32'
  : 'https://api.spottr.app';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getToken(); // uses in-memory cache after first call
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      deleteToken();
    }
    return Promise.reject(error);
  },
);
