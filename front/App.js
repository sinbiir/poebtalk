import "react-native-gesture-handler";
import React, { useEffect } from 'react';
import { ActivityIndicator, View, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DialogListScreen from './src/screens/DialogListScreen';
import ChatScreen from './src/screens/ChatScreen';
import useAuthStore from './src/store/authStore';
import useChatStore from './src/store/chatStore';
import wsClient from './src/ws/wsClient';

const Stack = createNativeStackNavigator();

export default function App() {
  const { user, accessToken, initializing, restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
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
      }
    });
    const offStatusMsg = wsClient.on('message:status', payload => useChatStore.getState().applyStatus(payload));

    return () => {
      offStatus && offStatus();
      offAck && offAck();
      offNew && offNew();
      offStatusMsg && offStatusMsg();
    };
  }, []);

  useEffect(() => {
    if (accessToken && user) {
      wsClient.connect(accessToken);
      useChatStore.getState().initFromCache();
      useChatStore.getState().loadDialogs().catch(() => {});
    } else {
      wsClient.disconnect();
      useChatStore.getState().reset();
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
    </Stack.Navigator>
  );
}