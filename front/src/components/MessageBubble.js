import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, Linking } from 'react-native';
import { API_BASE_URL } from '../config';
import { formatTime } from '../utils/time';

const statusLabel = msg => {
  if (msg.read_at) return 'Read';
  if (msg.delivered_at) return 'Delivered';
  if (msg.localStatus === 'sending') return 'Sending';
  if (msg.localStatus === 'sent') return 'Sent';
  return '';
};

const withBase = url => {
  if (!url) return url;
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
};

const openUrl = url => {
  const full = withBase(url);
  if (!full) return;
  if (Platform.OS === 'web') {
    window.open(full, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(full);
  }
};

const MessageBubble = ({ message, isOwn }) => {
  const isFile = message.type === 'file';
  const isImage = message.type === 'image';
  const isAttachment = isFile || isImage;
  return (
    <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerPeer]}>
      <View style={[styles.bubble, isOwn ? styles.own : styles.peer]}>
        {isAttachment ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => openUrl(message.file_url)}>
            {isImage ? (
              <Image source={{ uri: withBase(message.file_url) }} style={styles.image} resizeMode="cover" />
            ) : null}
            <Text style={styles.fileName} numberOfLines={1}>
              {message.file_name || (isImage ? 'Image' : 'File')}
            </Text>
            <Text style={styles.fileUrl} numberOfLines={1}>
              {withBase(message.file_url)}
            </Text>
            <Text style={styles.download}>{isFile ? 'Tap to download' : 'Tap to view'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.text}>{message.text}</Text>
        )}
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
  fileName: { color: '#0f172a', fontWeight: '700', marginBottom: 4 },
  fileUrl: { color: '#1d4ed8', fontSize: 12 },
  download: { color: '#475569', fontSize: 12, marginTop: 4 },
  image: { width: 200, height: 200, borderRadius: 10, marginBottom: 8, backgroundColor: '#cbd5e1' },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
});

export default MessageBubble;
