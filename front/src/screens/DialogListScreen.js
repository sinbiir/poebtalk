import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, SafeAreaView } from 'react-native';
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
  const logout = useAuthStore(state => state.logout);

  useFocusEffect(
    useCallback(() => {
      loadDialogs().catch(() => {});
    }, [loadDialogs])
  );

  const renderItem = ({ item }) => (
    <DialogRow dialog={item} onPress={() => navigation.navigate('Chat', { dialogId: item.id, peer: item.peer })} />
  );

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
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 20, color: '#94a3b8' },
  error: { color: 'red', marginHorizontal: 16, marginTop: 8 },
});

export default DialogListScreen;