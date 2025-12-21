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
import useChatStore from '../store/chatStore';
import useAuthStore from '../store/authStore';
import MessageBubble from '../components/MessageBubble';
import wsClient from '../ws/wsClient';

const ChatScreen = ({ route }) => {
  const { dialogId, peer } = route.params;
  const { user } = useAuthStore();
  const chatState = useChatStore(state => state.messagesByDialogId[dialogId] || { items: [], loading: false, hasMore: false });
  const sendMessage = useChatStore(state => state.sendMessage);
  const loadMessages = useChatStore(state => state.loadMessages);
  const setActiveDialog = useChatStore(state => state.setActiveDialog);
  const markRead = useChatStore(state => state.markRead);
  const wsStatus = useChatStore(state => state.wsStatus);

  const [text, setText] = useState('');

  useEffect(() => {
    setActiveDialog(dialogId);
    loadMessages(dialogId);
    return () => setActiveDialog(null);
  }, [dialogId, loadMessages, setActiveDialog]);

  useEffect(() => {
    if (!chatState.items?.length) return;
    const lastFromPeer = [...chatState.items]
      .reverse()
      .find(m => m.sender_id && m.sender_id !== user?.id);
    if (lastFromPeer) {
      const readAt = new Date().toISOString();
      wsClient.send('message:read', {
        dialog_id: dialogId,
        last_read_message_id: lastFromPeer.id,
        read_at: readAt,
      });
      markRead(dialogId, lastFromPeer.id, readAt);
    }
  }, [chatState.items, dialogId, markRead, user?.id]);

  const handleSend = () => {
    const value = text.trim();
    if (!value) return;
    sendMessage(dialogId, value);
    setText('');
  };

  const onLoadMore = useCallback(() => {
    if (chatState.hasMore && !chatState.loading) {
      loadMessages(dialogId);
    }
  }, [chatState.hasMore, chatState.loading, dialogId, loadMessages]);

  const messages = useMemo(() => {
    return [...(chatState.items || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).reverse();
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
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.sender_id === user?.id} />
          )}
          onEndReachedThreshold={0.2}
          onEndReached={onLoadMore}
          ListFooterComponent={chatState.loading && chatState.hasMore ? <ActivityIndicator /> : null}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12 }}
        />
      )}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendText}>Send</Text>
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