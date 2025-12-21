import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { formatDialogTime } from '../utils/time';

const DialogRow = ({ dialog, onPress }) => {
  const lastText = dialog?.last_message?.text || 'No messages yet';
  const time = dialog?.last_message_at ? formatDialogTime(dialog.last_message_at) : '';
  const unread = dialog?.unread_count || 0;
  const avatarLetter = dialog?.peer?.username?.[0]?.toUpperCase() || '?';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarLetter}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.name}>{dialog?.peer?.username}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.preview} numberOfLines={1}>
            {lastText}
          </Text>
          {unread > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
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
  preview: { flex: 1, fontSize: 14, color: '#475569', marginRight: 8 },
  unreadBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default DialogRow;