import React, { useCallback, useState } from 'react';
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

  const [newPeer, setNewPeer] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadDialogs().catch(() => {});
    }, [loadDialogs])
  );

  const renderItem = ({ item }) => (
    <DialogRow dialog={item} onPress={() => navigation.navigate('Chat', { dialogId: item.id, peer: item.peer })} />
  );

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
          <Text style={styles.title}>Dialogs</Text>
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

      {dialogsLoading && !dialogs.length ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={dialogs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={dialogsRefreshing} onRefresh={refreshDialogs} />}
          ListEmptyComponent={<Text style={styles.empty}>No dialogs yet</Text>}
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
});

export default DialogListScreen;
