import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatTime } from '../utils/time';

const statusLabel = msg => {
  if (msg.read_at) return 'Read';
  if (msg.delivered_at) return 'Delivered';
  if (msg.localStatus === 'sending') return 'Sending';
  if (msg.localStatus === 'sent') return 'Sent';
  return '';
};

const MessageBubble = ({ message, isOwn }) => {
  return (
    <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerPeer]}>
      <View style={[styles.bubble, isOwn ? styles.own : styles.peer]}>
        <Text style={styles.text}>{message.text}</Text>
      </View>
      <Text style={styles.meta}>
        {formatTime(message.created_at)} {isOwn ? statusLabel(message) : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: 4, maxWidth: '80%' },
  containerOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  containerPeer: { alignSelf: 'flex-start' },
  bubble: { padding: 10, borderRadius: 12 },
  own: { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  peer: { backgroundColor: '#e2e8f0', borderBottomLeftRadius: 4 },
  text: { color: '#0f172a' },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
});

export default MessageBubble;