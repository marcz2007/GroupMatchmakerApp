import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface SpotifyConnectProps {
  onConnect: () => void;
  onDisconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
}

export const SpotifyConnect: React.FC<SpotifyConnectProps> = ({
  onConnect,
  onDisconnect,
  isConnected,
  isConnecting,
}) => {
  return (
    <View style={styles.container}>
      {isConnected ? (
        <TouchableOpacity
          style={[styles.button, styles.disconnectButton]}
          onPress={onDisconnect}
        >
          <Text style={styles.buttonText}>Disconnect Spotify</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={styles.description}>
            Connect your Spotify account to share your music taste and
            find people with similar preferences.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.connectButton]}
            onPress={onConnect}
            disabled={isConnecting}
          >
            <Text style={styles.buttonText}>
              {isConnecting ? "Connecting..." : "Connect Spotify"}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#1DB954',
  },
  disconnectButton: {
    backgroundColor: '#dc3545',
  },
  buttonText: {
    ...typography.subtitle,
    color: '#FFFFFF',
  },
}); 