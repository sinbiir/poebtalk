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
import useGroupStore from '../store/groupStore';

const GroupListScreen = ({ navigation }) => {
  const groups = useGroupStore(state => state.groups);
  const loadGroups = useGroupStore(state => state.loadGroups);
  const refreshGroups = useGroupStore(state => state.refreshGroups);
  const groupsLoading = useGroupStore(state => state.groupsLoading);
  const groupsRefreshing = useGroupStore(state => state.groupsRefreshing);
  const groupsError = useGroupStore(state => state.groupsError);
  const createGroup = useGroupStore(state => state.createGroup);

  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadGroups().catch(() => {});
    }, [loadGroups])
  );

  const handleCreate = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const memberUsernames = (members || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    setCreating(true);
    setCreateError(null);
    try {
      const { group } = await createGroup({ name: cleanName, memberUsernames });
      setName('');
      setMembers('');
      navigation.navigate('GroupChat', { groupId: group.id, group });
    } catch (err) {
      setCreateError(err?.response?.data?.error?.message || err?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const renderItem = ({ item }) => {
    const memberCount = item?.members?.length || 0;
    const last = item?.last_message;
    const preview =
      last?.text ||
      (last?.type === 'image' ? '📷 Image' : last?.type === 'file' ? `📎 ${last?.file_name || 'File'}` : 'No messages yet');
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('GroupChat', { groupId: item.id, group: item })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name?.[0]?.toUpperCase() || 'G'}</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.top}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>{memberCount} members</Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.createBox}>
        <Text style={styles.label}>Create group</Text>
        <TextInput style={styles.input} placeholder="Group name" value={name} onChangeText={setName} />
        <TextInput
          style={styles.input}
          placeholder="Usernames comma separated"
          value={members}
          onChangeText={setMembers}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
          <Text style={styles.createText}>{creating ? '...' : 'Create'}</Text>
        </TouchableOpacity>
        {createError ? <Text style={styles.error}>{createError}</Text> : null}
      </View>

      {groupsError ? <Text style={styles.error}>{groupsError}</Text> : null}

      {groupsLoading && !groups.length ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={groupsRefreshing} onRefresh={refreshGroups} />}
          ListEmptyComponent={<Text style={styles.empty}>No groups yet</Text>}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  createBox: {
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  label: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  createBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  createText: { color: '#fff', fontWeight: '700' },
  row: {
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
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  count: { fontSize: 12, color: '#94a3b8' },
  preview: { fontSize: 14, color: '#475569', marginTop: 4 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 20, color: '#94a3b8' },
  error: { color: 'red', marginTop: 6 },
});

export default GroupListScreen;
