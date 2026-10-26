import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function GroupsScreen() {
  return (
    <View style={styles.container} testID="groups-empty">
      <Stack.Screen options={{ title: 'Groups' }} />
      <Text style={styles.title}>No groups yet</Text>
      <Text style={styles.body}>
        Create a group to start splitting expenses. Everything stays on this phone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 15, opacity: 0.7, textAlign: 'center' },
});
