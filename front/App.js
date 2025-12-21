import "react-native-gesture-handler";
import React, { useEffect } from 'react';
import { ActivityIndicator, View, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DialogListScreen from './src/screens/DialogListScreen';
import ChatScreen from './src/screens/ChatScreen';
import GroupChatScreen from './src/screens/GroupChatScreen';
import useAuthStore from './src/store/authStore';
import useChatStore from './src/store/chatStore';
import useGroupStore from './src/store/groupStore';
import wsClient from './src/ws/wsClient';

const Stack = createNativeStackNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerNotifications() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permission not granted');
    }
  } catch (e) {
    console.log('Notification permission error', e);
  }
}

async function maybeNotify({ title, body }) {
  try {
    // play short sound
    const sound = new Audio.Sound();
    await sound.loadAsync({ uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' });
    await sound.playAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: null,
    });
  } catch (e) {
    console.log('notify error', e);
  }
}

export default function App() {
  const { user, accessToken, initializing, restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    registerNotifications();
    const unsubscribe = AppState.addEventListener('change', state => {
      useChatStore.getState().setAppState(state);
    });
    return () => unsubscribe.remove();
  }, []);

  useEffect(() => {
    const offStatus = wsClient.on('ws_status', status => useChatStore.getState().setWsStatus(status));
    const offAck = wsClient.on('message:ack', payload => useChatStore.getState().applyAck(payload));
    const offNew = wsClient.on('message:new', payload => {
      const message = payload?.message || payload;
      const store = useChatStore.getState();
      store.applyIncomingMessage(message);
      if (store.activeDialogId === message.dialog_id && store.appState === 'active') {
        const now = new Date().toISOString();
        wsClient.send('message:delivered', { message_id: message.id, delivered_at: now });
        wsClient.send('message:read', {
          dialog_id: message.dialog_id,
          last_read_message_id: message.id,
          read_at: now,
        });
        store.markRead(message.dialog_id, message.id, now);
      } else {
        maybeNotify({
          title: message.sender_username || 'New message',
          body: message.text || (message.type === 'image' ? 'Image' : 'Attachment'),
        });
      }
    });
    const offStatusMsg = wsClient.on('message:status', payload => useChatStore.getState().applyStatus(payload));
    const offGroupAck = wsClient.on('group:message:ack', payload => useGroupStore.getState().applyAck(payload));
    const offGroupNew = wsClient.on('group:message:new', payload => {
      const msg = payload?.message || payload;
      const store = useGroupStore.getState();
      store.applyIncomingMessage(msg);
      if (store.activeGroupId !== msg.group_id) {
        maybeNotify({
          title: msg.sender_username || 'Group message',
          body: msg.text || (msg.type === 'image' ? 'Image' : 'Attachment'),
        });
      }
    });

    return () => {
      offStatus && offStatus();
      offAck && offAck();
      offNew && offNew();
      offStatusMsg && offStatusMsg();
      offGroupAck && offGroupAck();
      offGroupNew && offGroupNew();
    };
  }, []);

  useEffect(() => {
    if (accessToken && user) {
      wsClient.connect(accessToken);
      useChatStore.getState().initFromCache();
      useChatStore.getState().loadDialogs().catch(() => {});
      useGroupStore.getState().initFromCache();
      useGroupStore.getState().loadGroups().catch(() => {});
    } else {
      wsClient.disconnect();
      useChatStore.getState().reset();
      // no reset for groups yet
    }
  }, [accessToken, user]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      {user ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
    </Stack.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Dialogs" component={DialogListScreen} options={{ title: 'Dialogs' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params?.peer?.username || 'Chat' })} />
      <Stack.Screen name="GroupChat" component={GroupChatScreen} options={({ route }) => ({ title: route.params?.group?.name || 'Group' })} />
    </Stack.Navigator>
  );
}
