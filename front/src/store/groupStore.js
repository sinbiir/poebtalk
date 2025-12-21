import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGroups,
  createGroupApi,
  addGroupMembersApi,
  getGroupMessages,
  postGroupMessage,
  uploadFile,
} from '../api/endpoints';
import { Platform } from 'react-native';
import wsClient from '../ws/wsClient';
import useAuthStore from './authStore';
import { uuid } from '../utils/uuid';
import { API_BASE_URL } from '../config';

const GROUPS_KEY = 'groups_cache';
const MSG_KEY = groupId => `group_messages_${groupId}`;

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

const useGroupStore = create((set, get) => ({
  groups: [],
  groupsLoading: false,
  groupsError: null,
  groupsRefreshing: false,
  messagesByGroupId: {},
  activeGroupId: null,

  initFromCache: async () => {
    try {
      const groupsStr = await AsyncStorage.getItem(GROUPS_KEY);
      if (groupsStr) {
        const groups = JSON.parse(groupsStr);
        set({ groups });
        await Promise.all(
          groups.map(async g => {
            const msgStr = await AsyncStorage.getItem(MSG_KEY(g.id));
            if (msgStr) {
              const msgs = JSON.parse(msgStr);
              set(state => ({
                messagesByGroupId: {
                  ...state.messagesByGroupId,
                  [g.id]: { items: msgs, loading: false, nextCursor: null, hasMore: true },
                },
              }));
            }
          })
        );
      }
    } catch (_) {}
  },

  loadGroups: async () => {
    set({ groupsLoading: true, groupsError: null });
    try {
      const data = await getGroups();
      const groups = (data.items || []).map(g => ({ unread_count: g.unread_count || 0, ...g }));
      set({ groups, groupsLoading: false, groupsRefreshing: false });
      await AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch (err) {
      set({ groupsLoading: false, groupsRefreshing: false, groupsError: err?.message || 'Failed to load groups' });
      throw err;
    }
  },

  refreshGroups: async () => {
    set({ groupsRefreshing: true });
    await get().loadGroups();
  },

  setActiveGroup: groupId => set({ activeGroupId: groupId }),

  createGroup: async ({ name, memberUsernames }) => {
    const { group } = await createGroupApi({ name, memberUsernames });
    set(state => ({ groups: [group, ...state.groups] }));
    return group;
  },

  addMembers: async (groupId, memberUsernames) => {
    const { group } = await addGroupMembersApi(groupId, memberUsernames);
    set(state => ({
      groups: state.groups.map(g => (g.id === group.id ? group : g)),
    }));
    return group;
  },

  loadMessages: async groupId => {
    const current = get().messagesByGroupId[groupId] || initialMessagesState();
    if (current.loading) return;
    set(state => ({
      messagesByGroupId: { ...state.messagesByGroupId, [groupId]: { ...current, loading: true } },
    }));
    try {
      const data = await getGroupMessages(groupId, current.nextCursor ? { before: current.nextCursor } : {});
      const merged = uniqueMerge(data.items || [], current.items || []);
      const nextCursor = data.next_cursor || null;
      set(state => ({
        messagesByGroupId: {
          ...state.messagesByGroupId,
          [groupId]: { items: merged, loading: false, nextCursor, hasMore: !!nextCursor },
        },
      }));
      await AsyncStorage.setItem(MSG_KEY(groupId), JSON.stringify(merged));
    } catch (_) {
      set(state => ({
        messagesByGroupId: { ...state.messagesByGroupId, [groupId]: { ...current, loading: false } },
      }));
    }
  },

  sendMessage: async (groupId, text, attachment) => {
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
      if (!uploaded?.url && !uploaded?.absolute_url) throw new Error('Upload failed');
    }

    const localMsg = {
      id: client_msg_id,
      client_msg_id,
      group_id: groupId,
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
      messagesByGroupId: {
        ...state.messagesByGroupId,
        [groupId]: {
          ...(state.messagesByGroupId[groupId] || initialMessagesState()),
          items: [...(state.messagesByGroupId[groupId]?.items || []), localMsg],
          loading: false,
        },
      },
    }));
    AsyncStorage.setItem(MSG_KEY(groupId), JSON.stringify(get().messagesByGroupId[groupId]?.items || []));
    const payload = {
      group_id: groupId,
      client_msg_id,
      msg_type: attachment ? attachment.kind : 'text',
      text: attachment ? null : text,
      file_url: normalizeUrl(uploaded?.absolute_url || uploaded?.url),
      file_name: uploaded?.file_name,
      file_mime: uploaded?.file_mime,
      file_size: uploaded?.file_size,
    };
    wsClient.send('group:message:send', payload);
    if (wsClient.status !== 'connected') {
      postGroupMessage(groupId, payload).catch(() => {});
    }
  },

  applyAck: ack => {
    const { client_msg_id, message } = ack || {};
    if (!message) return;
    const groupId = message.group_id;
    set(state => {
      const current = state.messagesByGroupId[groupId] || initialMessagesState();
      const updatedItems = current.items.map(m =>
        m.client_msg_id === client_msg_id || m.id === client_msg_id ? { ...m, ...message, localStatus: 'sent' } : m
      );
      const items = uniqueMerge(updatedItems, [message]);
      return {
        messagesByGroupId: { ...state.messagesByGroupId, [groupId]: { ...current, items } },
      };
    });
    AsyncStorage.setItem(MSG_KEY(groupId), JSON.stringify(get().messagesByGroupId[groupId]?.items || []));
  },

  applyIncomingMessage: message => {
    if (!message?.group_id) return;
    const groupId = message.group_id;
    set(state => {
      const current = state.messagesByGroupId[groupId] || initialMessagesState();
      const items = uniqueMerge(current.items, [message]);
      const groups = state.groups.map(g => {
        if (g.id !== groupId) return g;
        const shouldCountUnread =
          state.activeGroupId !== groupId && message.sender_id !== useAuthStore.getState().user?.id;
        const unread = shouldCountUnread ? (g.unread_count || 0) + 1 : g.unread_count || 0;
        return { ...g, last_message: message, last_message_at: message.created_at, unread_count: unread };
      });
      return { messagesByGroupId: { ...state.messagesByGroupId, [groupId]: { ...current, items } }, groups };
    });
    AsyncStorage.setItem(MSG_KEY(groupId), JSON.stringify(get().messagesByGroupId[groupId]?.items || []));
  },
}));

export default useGroupStore;
