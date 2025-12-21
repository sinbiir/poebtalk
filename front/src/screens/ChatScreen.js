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
import useChatStore from '../store/chatStore';
import useAuthStore from '../store/authStore';
import MessageBubble from '../components/MessageBubble';
import wsClient from '../ws/wsClient';

const ChatScreen = ({ route }) => {
  const { dialogId, peer } = route.params;
  const { user } = useAuthStore();
  const chatState = useChatStore(
    state => state.messagesByDialogId[dialogId] || { items: [], loading: false, hasMore: false }
  );
  const sendMessage = useChatStore(state => state.sendMessage);
  const loadMessages = useChatStore(state => state.loadMessages);
  const setActiveDialog = useChatStore(state => state.setActiveDialog);
  const markRead = useChatStore(state => state.markRead);
  const wsStatus = useChatStore(state => state.wsStatus);

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setActiveDialog(dialogId);
    loadMessages(dialogId);
    return () => setActiveDialog(null);
  }, [dialogId, loadMessages, setActiveDialog]);

  useEffect(() => {
    if (!chatState.items?.length) return;
    const lastUnreadFromPeer = [...chatState.items]
      .reverse()
      .find(m => m.sender_id && m.sender_id !== user?.id && !m.read_at);
    if (!lastUnreadFromPeer) return;

    const readAt = new Date().toISOString();
    wsClient.send('message:read', {
      dialog_id: dialogId,
      last_read_message_id: lastUnreadFromPeer.id,
      read_at: readAt,
    });
    markRead(dialogId, lastUnreadFromPeer.id, readAt);
  }, [chatState.items, dialogId, markRead, user?.id]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value && !attachment) return;
    try {
      setUploading(true);
      await sendMessage(dialogId, value, attachment);
      setText('');
      setAttachment(null);
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res?.canceled) return;
    // SDK 52: {assets:[{uri,name,size,mimeType}]}; legacy: {type:'success', uri,...}
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
    if (chatState.hasMore && !chatState.loading) {
      loadMessages(dialogId);
    }
  }, [chatState.hasMore, chatState.loading, dialogId, loadMessages]);

  const messages = useMemo(() => {
    return [...(chatState.items || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .reverse();
  }, [chatState.items]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.peer}>{peer?.username || 'Chat'}</Text>
        <Text style={styles.status}>WS: {wsStatus}</Text>
      </View>
      {chatState.loading && !chatState.items.length ? (
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
          ListFooterComponent={chatState.loading && chatState.hasMore ? <ActivityIndicator /> : null}
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
  status: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
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

export default ChatScreen;
