/**
 * Konvoi — voice-first room app for local Wi-Fi.
 *
 * @format
 */

import React, { useEffect } from 'react';
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CreateRoomScreen } from './src/screens/CreateRoomScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { HostRoomScreen } from './src/screens/HostRoomScreen';
import { JoinRoomScreen } from './src/screens/JoinRoomScreen';
import { LiveMapScreen } from './src/screens/LiveMapScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { VoiceRoomScreen } from './src/screens/VoiceRoomScreen';
import { useRoomApp, type RoomApp } from './src/state/useRoomApp';
import { colors } from './src/theme/theme';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const app = useRoomApp();
  const { screen, goBack } = app;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen === 'home') {
          return false;
        }
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [screen, goBack]);

  return <View style={styles.root}>{renderScreen(app)}</View>;
}

function renderScreen(app: RoomApp) {
  switch (app.screen) {
    case 'create':
      return <CreateRoomScreen app={app} />;
    case 'host':
      return <HostRoomScreen app={app} />;
    case 'join':
      return <JoinRoomScreen app={app} />;
    case 'room':
      return <VoiceRoomScreen app={app} />;
    case 'map':
      return <LiveMapScreen app={app} />;
    case 'settings':
      return <SettingsScreen app={app} />;
    case 'home':
    default:
      return <HomeScreen app={app} />;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
