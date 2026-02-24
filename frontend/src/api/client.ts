import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const getToken = async () => {
  if (Platform.OS === 'web') return localStorage.getItem('auth_token');
  return SecureStore.getItemAsync('auth_token');
};

const deleteToken = async () => {
  if (Platform.OS === 'web') { localStorage.removeItem('auth_token'); return; }
  return SecureStore.deleteItemAsync('auth_token');
};

export const API_BASE_URL = __DEV__
  ? Platform.OS === 'web' ? 'http://localhost:8000' : 'http://10.193.48.5:8000'
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
  const token = await getToken();
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
