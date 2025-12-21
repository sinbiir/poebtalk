import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DialogRow from '../components/DialogRow';
import useChatStore from '../store/chatStore';
import useAuthStore from '../store/authStore';
import useGroupStore from '../store/groupStore';

const DialogListScreen = ({ navigation }) => {
  const dialogs = useChatStore(state => state.dialogs);
  const loadDialogs = useChatStore(state => state.loadDialogs);
  const refreshDialogs = useChatStore(state => state.refreshDialogs);
  const dialogsLoading = useChatStore(state => state.dialogsLoading);
  const dialogsRefreshing = useChatStore(state => state.dialogsRefreshing);
  const dialogsError = useChatStore(state => state.dialogsError);
  const wsStatus = useChatStore(state => state.wsStatus);
  const createDialogByUsername = useChatStore(state => state.createDialogByUsername);
  const logout = useAuthStore(state => state.logout);

  const groups = useGroupStore(state => state.groups);
  const loadGroups = useGroupStore(state => state.loadGroups);
  const groupsLoading = useGroupStore(state => state.groupsLoading);
  const groupsRefreshing = useGroupStore(state => state.groupsRefreshing);
  const groupsError = useGroupStore(state => state.groupsError);

  const [newPeer, setNewPeer] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadDialogs().catch(() => {});
      loadGroups().catch(() => {});
    }, [loadDialogs, loadGroups])
  );

  const combined = useMemo(() => {
    const dialogItems = dialogs.map(d => ({ ...d, _type: 'dialog' }));
    const groupItems = groups.map(g => ({
      _type: 'group',
      id: g.id,
      peer: { username: g.name },
      last_message: g.last_message,
      last_message_at: g.last_message_at,
      unread_count: 0,
      members: g.members,
      name: g.name,
    }));
    return [...dialogItems, ...groupItems].sort(
      (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
    );
  }, [dialogs, groups]);

  const renderItem = ({ item }) => {
    if (item._type === 'group') {
      const preview =
        item.last_message?.text ||
        (item.last_message?.type === 'image'
          ? '📷 Image'
          : item.last_message?.type === 'file'
            ? `📎 ${item.last_message?.file_name || 'File'}`
            : 'No messages yet');
      return (
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigation.navigate('GroupChat', { groupId: item.id, group: item })}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name?.[0]?.toUpperCase() || 'G'}</Text>
          </View>
          <View style={styles.content}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.time}>{item.members?.length || 0} members</Text>
            </View>
            <Text style={styles.preview} numberOfLines={1}>
              {preview}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    return <DialogRow dialog={item} onPress={() => navigation.navigate('Chat', { dialogId: item.id, peer: item.peer })} />;
  };

  const handleCreate = async () => {
    const value = newPeer.trim();
    if (!value) return;
    setCreating(true);
    setCreateError(null);
    try {
      const dialog = await createDialogByUsername(value);
      setNewPeer('');
      navigation.navigate('Chat', { dialogId: dialog.id, peer: dialog.peer });
    } catch (err) {
      setCreateError(err?.response?.data?.error?.message || err?.message || 'Failed to create dialog');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dialogs & Groups</Text>
          <Text style={styles.sub}>WS: {wsStatus}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.newBox}>
        <Text style={styles.label}>Start dialog by username</Text>
        <View style={styles.rowInline}>
          <TextInput
            style={styles.input}
            placeholder="@username"
            value={newPeer}
            autoCapitalize="none"
            onChangeText={setNewPeer}
          />
          <TouchableOpacity
            style={[styles.createBtn, creating && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={creating}
          >
            <Text style={styles.createText}>{creating ? '...' : 'Create'}</Text>
          </TouchableOpacity>
        </View>
        {createError ? <Text style={styles.error}>{createError}</Text> : null}
      </View>

      {dialogsError ? <Text style={styles.error}>{dialogsError}</Text> : null}
      {groupsError ? <Text style={styles.error}>{groupsError}</Text> : null}

      {(dialogsLoading || groupsLoading) && !combined.length ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={combined}
          keyExtractor={item => `${item._type}-${item.id}`}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={dialogsRefreshing || groupsRefreshing}
              onRefresh={() => {
                refreshDialogs();
                loadGroups().catch(() => {});
              }}
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>No dialogs or groups yet</Text>}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
  },
  logoutText: { color: '#fff', fontWeight: '700' },
  newBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  label: { fontSize: 13, color: '#475569', marginBottom: 6 },
  rowInline: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  createBtn: {
    marginLeft: 10,
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  createText: { color: '#fff', fontWeight: '700' },
  btnDisabled: { opacity: 0.7 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 20, color: '#94a3b8' },
  error: { color: 'red', marginHorizontal: 16, marginTop: 8 },
  groupRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
    backgroundColor: '#fff',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#1d4ed8', fontWeight: '700', fontSize: 18 },
  content: { flex: 1, marginLeft: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  time: { fontSize: 12, color: '#94a3b8' },
  preview: { flex: 1, fontSize: 14, color: '#475569', marginTop: 4 },
});

export default DialogListScreen;
