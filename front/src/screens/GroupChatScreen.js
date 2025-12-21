import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import useGroupStore from '../store/groupStore';
import useAuthStore from '../store/authStore';
import MessageBubble from '../components/MessageBubble';

const GroupChatScreen = ({ route }) => {
  const { groupId, group } = route.params;
  const { user } = useAuthStore();
  const groupState = useGroupStore(
    state => state.messagesByGroupId[groupId] || { items: [], loading: false, hasMore: false }
  );
  const loadMessages = useGroupStore(state => state.loadMessages);
  const sendMessage = useGroupStore(state => state.sendMessage);
  const setActiveGroup = useGroupStore(state => state.setActiveGroup);
  const groups = useGroupStore(state => state.groups);

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setActiveGroup(groupId);
    loadMessages(groupId);
    return () => setActiveGroup(null);
  }, [groupId, loadMessages, setActiveGroup]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value && !attachment) return;
    try {
      setUploading(true);
      await sendMessage(groupId, value, attachment);
      setText('');
      setAttachment(null);
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res?.canceled) return;
    const file = res.assets?.[0] || res;
    const success = res.type ? res.type === 'success' : !!file?.uri;
    if (!success) return;
    setAttachment({
      uri: file.uri,
      name: file.name || 'file',
      type: file.mimeType || file.type || 'application/octet-stream',
      kind: 'file',
    });
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled && res.assets?.length) {
      const asset = res.assets[0];
      setAttachment({
        uri: asset.uri,
        name: asset.fileName || 'image.jpg',
        type: asset.mimeType || 'image/jpeg',
        kind: 'image',
      });
    }
  };

  const onLoadMore = useCallback(() => {
    if (groupState.hasMore && !groupState.loading) {
      loadMessages(groupId);
    }
  }, [groupState.hasMore, groupState.loading, groupId, loadMessages]);

  const messages = useMemo(() => {
    return [...(groupState.items || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .reverse();
  }, [groupState.items]);

  const members = groups.find(g => g.id === groupId)?.members || [];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.peer}>{group?.name || 'Group'}</Text>
        <Text style={styles.memberCount}>{members.length} members</Text>
      </View>
      <View style={styles.membersBar}>
        <FlatList
          horizontal
          data={members}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.memberPill}>
              <Text style={styles.memberText}>{item.username}</Text>
            </View>
          )}
          showsHorizontalScrollIndicator={false}
        />
      </View>
      {groupState.loading && !groupState.items.length ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={messages}
          inverted
          keyExtractor={item => item.id || item.client_msg_id}
          renderItem={({ item }) => <MessageBubble message={item} isOwn={item.sender_id === user?.id} />}
          onEndReachedThreshold={0.2}
          onEndReached={onLoadMore}
          ListFooterComponent={groupState.loading && groupState.hasMore ? <ActivityIndicator /> : null}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12 }}
        />
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
          <Text style={styles.attachText}>+File</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachBtn} onPress={pickImage}>
          <Text style={styles.attachText}>+Image</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          value={text}
          onChangeText={setText}
          multiline
        />
        {attachment ? (
          <View style={styles.attachment}>
            <Text style={styles.attachmentText} numberOfLines={1}>
              {attachment.name}
            </Text>
            <TouchableOpacity onPress={() => setAttachment(null)}>
              <Text style={styles.removeAttach}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={uploading}>
          <Text style={styles.sendText}>{uploading ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  peer: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  memberCount: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  membersBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  memberPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    marginRight: 8,
  },
  memberText: { color: '#0369a1', fontWeight: '700' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  attachBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
    marginRight: 8,
  },
  attachText: { color: '#0369a1', fontWeight: '700' },
  inputBar: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
    backgroundColor: '#fff',
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    maxWidth: 140,
  },
  attachmentText: { flex: 1, fontSize: 12, color: '#0f172a' },
  removeAttach: { color: '#ef4444', marginLeft: 6, fontWeight: '700' },
  sendBtn: {
    marginLeft: 10,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  sendText: { color: '#fff', fontWeight: '700' },
});

export default GroupChatScreen;
