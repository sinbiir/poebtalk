import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { login as apiLogin, register as apiRegister } from '../api/endpoints';
import { setAuthTokenGetter, setRefreshTokenFn } from '../api/http';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

const persistTokens = async (access, refresh) => {
  await AsyncStorage.setItem(ACCESS_KEY, access);
  await AsyncStorage.setItem(REFRESH_KEY, refresh);
};

const clearTokens = async () => {
  await AsyncStorage.removeItem(ACCESS_KEY);
  await AsyncStorage.removeItem(REFRESH_KEY);
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
    const refresh = get().refreshToken || (await AsyncStorage.getItem(REFRESH_KEY));
    if (!refresh) {
      await get().logout();
      return null;
    }
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refresh });
    const { access_token } = data;
    await AsyncStorage.setItem(ACCESS_KEY, access_token);
    set({ accessToken: access_token });
    return access_token;
  },

  restoreSession: async () => {
    try {
      const [access, refresh, user] = await Promise.all([
        AsyncStorage.getItem(ACCESS_KEY),
        AsyncStorage.getItem(REFRESH_KEY),
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

// wire token getters for http client to avoid import cycle
setAuthTokenGetter(() => useAuthStore.getState().accessToken);
setRefreshTokenFn(() => useAuthStore.getState().refreshAccessToken());

export default useAuthStore;
