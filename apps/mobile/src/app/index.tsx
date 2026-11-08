import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Group } from '@offledger/core';

import { createGroup, readGroups } from '../ledger/log';

export default function GroupsScreen() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readGroups()
      .then(setGroups)
      .catch((cause: unknown) => setError(describe(cause)));
  }, []);

  async function onCreate() {
    const trimmed = name.trim();
    if (trimmed === '' || saving) return;
    setSaving(true);
    try {
      setGroups(await createGroup(trimmed));
      setName('');
      setError(null);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Groups' }} />
      <View style={styles.form}>
        <TextInput
          testID="group-name-input"
          value={name}
          onChangeText={setName}
          onSubmitEditing={onCreate}
          placeholder="Group name"
          returnKeyType="done"
          style={styles.input}
        />
        <Pressable
          testID="create-group"
          onPress={onCreate}
          disabled={saving || name.trim() === ''}
          style={[styles.button, (saving || name.trim() === '') && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>Create group</Text>
        </Pressable>
      </View>

      {error === null ? null : (
        <Text testID="ledger-error" style={styles.error}>
          {error}
        </Text>
      )}

      {groups !== null && groups.length === 0 ? (
        <View style={styles.empty} testID="groups-empty">
          <Text style={styles.title}>No groups yet</Text>
          <Text style={styles.body}>
            Create a group to start splitting expenses. Everything stays on this phone.
          </Text>
        </View>
      ) : null}

      {groups !== null && groups.length > 0 ? (
        <View style={styles.list} testID="group-list">
          {groups.map((group) => (
            <Text key={group.id} style={styles.group}>
              {group.name}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  form: { gap: 8 },
  input: { borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#111111', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  error: { color: '#b00020', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 15, opacity: 0.7, textAlign: 'center' },
  list: { gap: 12 },
  group: { fontSize: 18 },
});
