import create from 'zustand';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';
import { login as apiLogin, register as apiRegister } from '../api/endpoints';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

// SecureStore isn't available on web; fall back to AsyncStorage there.
const tokenStore = {
  setItem: (key, value) =>
    Platform.OS === 'web' ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value),
  getItem: key =>
    Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key),
  deleteItem: key =>
    Platform.OS === 'web' ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key),
};

const persistTokens = async (access, refresh) => {
  await tokenStore.setItem(ACCESS_KEY, access);
  await tokenStore.setItem(REFRESH_KEY, refresh);
};

const clearTokens = async () => {
  await tokenStore.deleteItem(ACCESS_KEY);
  await tokenStore.deleteItem(REFRESH_KEY);
};

const persistUser = async user => {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
};

const restoreUser = async () => {
  const val = await AsyncStorage.getItem(USER_KEY);
  return val ? JSON.parse(val) : null;
};

const extractError = err => {
  const msg = err?.response?.data?.message || err?.message || 'Something went wrong';
  return msg;
};

const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  initializing: true,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const data = await apiLogin({ username, password });
      const { user, access_token, refresh_token } = data;
      await persistTokens(access_token, refresh_token);
      await persistUser(user);
      set({ user, accessToken: access_token, refreshToken: refresh_token, loading: false });
      return user;
    } catch (err) {
      set({ loading: false, error: extractError(err) });
      throw err;
    }
  },

  register: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const data = await apiRegister({ username, password });
      const { user, access_token, refresh_token } = data;
      await persistTokens(access_token, refresh_token);
      await persistUser(user);
      set({ user, accessToken: access_token, refreshToken: refresh_token, loading: false });
      return user;
    } catch (err) {
      set({ loading: false, error: extractError(err) });
      throw err;
    }
  },

  refreshAccessToken: async () => {
    const refresh = get().refreshToken || (await tokenStore.getItem(REFRESH_KEY));
    if (!refresh) {
      await get().logout();
      return null;
    }
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refresh });
    const { access_token } = data;
    await tokenStore.setItem(ACCESS_KEY, access_token);
    set({ accessToken: access_token });
    return access_token;
  },

  restoreSession: async () => {
    try {
      const [access, refresh, user] = await Promise.all([
        tokenStore.getItem(ACCESS_KEY),
        tokenStore.getItem(REFRESH_KEY),
        restoreUser(),
      ]);
      if (access && refresh && user) {
        set({ user, accessToken: access, refreshToken: refresh, initializing: false });
      } else {
        set({ user: null, accessToken: null, refreshToken: null, initializing: false });
      }
    } catch (err) {
      set({ initializing: false });
    }
  },

  logout: async () => {
    await clearTokens();
    await AsyncStorage.removeItem(USER_KEY);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));

export default useAuthStore;
