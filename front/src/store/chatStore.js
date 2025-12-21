import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDialogs, getMessages, createDialog, uploadFile, postMessage } from '../api/endpoints';
import { Platform } from 'react-native';
import wsClient from '../ws/wsClient';
import useAuthStore from './authStore';
import { uuid } from '../utils/uuid';
import { API_BASE_URL } from '../config';

const DIALOGS_KEY = 'dialogs_cache';
const MSG_KEY = dialogId => `messages_${dialogId}`;

const uniqueMerge = (existing = [], incoming = []) => {
  const map = new Map();
  existing.forEach(m => map.set(m.id || m.client_msg_id, m));
  incoming.forEach(m => {
    const key = m.id || m.client_msg_id;
    map.set(key, { ...map.get(key), ...m });
  });
  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return merged;
};

const initialMessagesState = () => ({ items: [], loading: false, nextCursor: null, hasMore: true });

const normalizeUrl = url => {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL}${url}`;
};

const useChatStore = create((set, get) => ({
  dialogs: [],
  dialogsLoading: false,
  dialogsError: null,
  dialogsRefreshing: false,
  messagesByDialogId: {},
  wsStatus: 'disconnected',
  activeDialogId: null,
  appState: 'active',

  initFromCache: async () => {
    try {
      const dialogsStr = await AsyncStorage.getItem(DIALOGS_KEY);
      if (dialogsStr) {
        const dialogs = JSON.parse(dialogsStr);
        set({ dialogs });
        // hydrate messages for cached dialogs (lightweight)
        await Promise.all(
          dialogs.map(async d => {
            const msgStr = await AsyncStorage.getItem(MSG_KEY(d.id));
            if (msgStr) {
              const msgs = JSON.parse(msgStr);
              set(state => ({
                messagesByDialogId: {
                  ...state.messagesByDialogId,
                  [d.id]: {
                    items: msgs,
                    loading: false,
                    nextCursor: null,
                    hasMore: true,
                  },
                },
              }));
            }
          })
        );
      }
    } catch (e) {
      // ignore cache failures
    }
  },

  setWsStatus: status => set({ wsStatus: status }),
  setAppState: stateVal => set({ appState: stateVal }),
  setActiveDialog: dialogId => set({ activeDialogId: dialogId }),

  reset: async () => {
    set({
      dialogs: [],
      dialogsLoading: false,
      dialogsError: null,
      dialogsRefreshing: false,
      messagesByDialogId: {},
      activeDialogId: null,
    });
    try {
      const keys = await AsyncStorage.getAllKeys();
      const toRemove = keys.filter(k => k === DIALOGS_KEY || k.startsWith('messages_'));
      if (toRemove.length) {
        await AsyncStorage.multiRemove(toRemove);
      }
    } catch (e) {
      // ignore cleanup errors
    }
  },

  loadDialogs: async () => {
    set({ dialogsLoading: true, dialogsError: null });
    try {
      const data = await getDialogs();
      const dialogs = data.items || [];
      set({ dialogs, dialogsLoading: false, dialogsRefreshing: false });
      await AsyncStorage.setItem(DIALOGS_KEY, JSON.stringify(dialogs));
    } catch (err) {
      set({ dialogsLoading: false, dialogsRefreshing: false, dialogsError: err?.message || 'Failed to load dialogs' });
      throw err;
    }
  },

  refreshDialogs: async () => {
    set({ dialogsRefreshing: true });
    await get().loadDialogs();
  },

  createDialogByUsername: async username => {
    const clean = (username || '').trim();
    if (!clean) throw new Error('Username is required');
    const { dialog } = await createDialog({ peerUsername: clean });
    set(state => {
      const exists = state.dialogs.find(d => d.id === dialog.id);
      const dialogs = exists
        ? state.dialogs.map(d => (d.id === dialog.id ? { ...d, ...dialog } : d))
        : [dialog, ...state.dialogs];
      return { dialogs };
    });
    return dialog;
  },

  loadMessages: async dialogId => {
    const current = get().messagesByDialogId[dialogId] || initialMessagesState();
    if (current.loading) return;
    set(state => ({
      messagesByDialogId: {
        ...state.messagesByDialogId,
        [dialogId]: { ...current, loading: true },
      },
    }));
    try {
      const data = await getMessages(dialogId, current.nextCursor ? { before: current.nextCursor } : {});
      const merged = uniqueMerge(data.items || [], current.items || []);
      const nextCursor = data.next_cursor || null;
      set(state => ({
        messagesByDialogId: {
          ...state.messagesByDialogId,
          [dialogId]: {
            items: merged,
            loading: false,
            nextCursor,
            hasMore: !!nextCursor,
          },
        },
      }));
      await AsyncStorage.setItem(MSG_KEY(dialogId), JSON.stringify(merged));
    } catch (err) {
      set(state => ({
        messagesByDialogId: {
          ...state.messagesByDialogId,
          [dialogId]: { ...current, loading: false },
        },
      }));
    }
  },

  sendMessage: async (dialogId, text, attachment) => {
    const userId = useAuthStore.getState().user?.id;
    const client_msg_id = uuid();
    const now = new Date().toISOString();
    let uploaded = null;

    if (attachment) {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const res = await fetch(attachment.uri);
        const blob = await res.blob();
        formData.append('file', blob, attachment.name);
      } else {
        formData.append('file', {
          uri: attachment.uri,
          name: attachment.name,
          type: attachment.type || 'application/octet-stream',
        });
      }
      uploaded = await uploadFile(formData);
      if (!uploaded?.url && !uploaded?.absolute_url) {
        throw new Error('Upload failed');
      }
    }

    const localMsg = {
      id: client_msg_id,
      client_msg_id,
      dialog_id: dialogId,
      sender_id: userId,
      type: attachment ? attachment.kind : 'text',
      text: attachment ? null : text,
      file_url: normalizeUrl(uploaded?.absolute_url || uploaded?.url),
      file_name: uploaded?.file_name,
      file_mime: uploaded?.file_mime,
      file_size: uploaded?.file_size,
      created_at: now,
      delivered_at: null,
      read_at: null,
      localStatus: 'sending',
    };
    set(state => ({
      messagesByDialogId: {
        ...state.messagesByDialogId,
        [dialogId]: {
          ...(state.messagesByDialogId[dialogId] || initialMessagesState()),
          items: [...(state.messagesByDialogId[dialogId]?.items || []), localMsg],
          loading: false,
        },
      },
      dialogs: state.dialogs.map(d =>
        d.id === dialogId
          ? {
              ...d,
              last_message: localMsg,
              last_message_at: now,
            }
          : d
      ),
    }));
    AsyncStorage.setItem(MSG_KEY(dialogId), JSON.stringify(get().messagesByDialogId[dialogId]?.items || []));
    const payload = {
      dialog_id: dialogId,
      client_msg_id,
      msg_type: attachment ? attachment.kind : 'text',
      text: attachment ? null : text,
      file_url: normalizeUrl(uploaded?.absolute_url || uploaded?.url),
      file_name: uploaded?.file_name,
      file_mime: uploaded?.file_mime,
      file_size: uploaded?.file_size,
    };
    wsClient.send('message:send', payload);
    // best-effort REST fallback when WS is disconnected
    if (wsClient.status !== 'connected') {
      postMessage(dialogId, payload).catch(() => {});
    }
  },

  applyAck: ack => {
    const { client_msg_id, message } = ack || {};
    if (!message) return;
    const dialogId = message.dialog_id;
    set(state => {
      const current = state.messagesByDialogId[dialogId] || initialMessagesState();
      const updatedItems = current.items.map(m =>
        m.client_msg_id === client_msg_id || m.id === client_msg_id ? { ...m, ...message, localStatus: 'sent' } : m
      );
      const items = uniqueMerge(updatedItems, [message]);
      return {
        messagesByDialogId: {
          ...state.messagesByDialogId,
          [dialogId]: { ...current, items },
        },
        dialogs: state.dialogs.map(d =>
          d.id === dialogId
            ? { ...d, last_message: message, last_message_at: message.created_at }
            : d
        ),
      };
    });
    AsyncStorage.setItem(MSG_KEY(dialogId), JSON.stringify(get().messagesByDialogId[dialogId]?.items || []));
  },

  applyIncomingMessage: message => {
    if (!message?.dialog_id) return;
    const dialogId = message.dialog_id;
    const currentUserId = useAuthStore.getState().user?.id;
    set(state => {
      const current = state.messagesByDialogId[dialogId] || initialMessagesState();
      const items = uniqueMerge(current.items, [message]);
      const dialogs = state.dialogs.map(d => {
        if (d.id !== dialogId) return d;
        const shouldCountUnread = currentUserId && message.sender_id !== currentUserId;
        const unread =
          state.activeDialogId === dialogId || !shouldCountUnread ? 0 : (d.unread_count || 0) + 1;
        return {
          ...d,
          last_message: message,
          last_message_at: message.created_at,
          unread_count: unread,
        };
      });
      return {
        messagesByDialogId: {
          ...state.messagesByDialogId,
          [dialogId]: { ...current, items },
        },
        dialogs,
      };
    });
    AsyncStorage.setItem(MSG_KEY(dialogId), JSON.stringify(get().messagesByDialogId[dialogId]?.items || []));
  },

  markRead: (dialogId, lastMessageId, readAt) => {
    set(state => {
      const current = state.messagesByDialogId[dialogId] || initialMessagesState();
      const items = current.items.map(m =>
        new Date(m.created_at) <= new Date(readAt || new Date())
          ? { ...m, read_at: readAt || new Date().toISOString(), localStatus: 'read' }
          : m
      );
      return {
        messagesByDialogId: { ...state.messagesByDialogId, [dialogId]: { ...current, items } },
        dialogs: state.dialogs.map(d => (d.id === dialogId ? { ...d, unread_count: 0 } : d)),
      };
    });
    AsyncStorage.setItem(MSG_KEY(dialogId), JSON.stringify(get().messagesByDialogId[dialogId]?.items || []));
  },

  applyStatus: statusPayload => {
    const { dialog_id, message_id, delivered_at, read_at } = statusPayload;
    if (!dialog_id || !message_id) return;
    set(state => {
      const current = state.messagesByDialogId[dialog_id] || initialMessagesState();
      const items = current.items.map(m => {
        if (m.id === message_id) {
          return {
            ...m,
            delivered_at: delivered_at ?? m.delivered_at,
            read_at: read_at ?? m.read_at,
            localStatus: read_at ? 'read' : delivered_at ? 'delivered' : m.localStatus,
          };
        }
        return m;
      });
      return {
        messagesByDialogId: { ...state.messagesByDialogId, [dialog_id]: { ...current, items } },
        dialogs: state.dialogs.map(d =>
          d.id === dialog_id && read_at ? { ...d, unread_count: 0 } : d
        ),
      };
    });
    AsyncStorage.setItem(MSG_KEY(dialog_id), JSON.stringify(get().messagesByDialogId[dialog_id]?.items || []));
  },
}));

export default useChatStore;
