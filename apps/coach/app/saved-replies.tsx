import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { useInbox } from '../src/platform/inbox';

/** Saved replies (K-1 inbox tools): add, view and delete. Used from the thread composer. */
export default function SavedReplies() {
  const toast = useToast();
  const replies = useInbox((s) => s.savedReplies);
  const saveReply = useInbox((s) => s.saveReply);
  const deleteReply = useInbox((s) => s.deleteReply);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const remove = (id: string, t: string) => {
    const go = () => void deleteReply(id).then(() => toast({ message: `Deleted “${t}”.` }));
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Delete “${t}”?`)) go();
    } else Alert.alert('Delete saved reply?', t, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  const problem = !title.trim() ? 'Give it a short name.' : !body.trim() ? 'Write the reply.' : undefined;
  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Saved replies
        </Text>
        <Text color="ink2">Only you see these. Pick one from the + button in any thread.</Text>
      </View>
      <SectionLabel>Yours</SectionLabel>
      {replies.length === 0 ? (
        <EmptyState message="No saved replies yet. Add the messages you send most often." />
      ) : (
        replies.map((r, i) => (
          <ListRow
            key={r.id}
            title={r.title}
            subtitle={r.body}
            right={<IconButton icon="trash-2" label={`Delete ${r.title}`} onPress={() => remove(r.id, r.title)} />}
            last={i === replies.length - 1}
          />
        ))
      )}
      <SectionLabel>Add one</SectionLabel>
      <View style={styles.form}>
        <TextField label="Name" value={title} onChangeText={setTitle} placeholder="e.g. Deload week" maxLength={60} />
        <TextField label="Reply" value={body} onChangeText={setBody} multiline maxLength={2000} />
        <Button
          label="Save reply"
          disabled={!!problem}
          disabledReason={problem}
          onPress={() =>
            void saveReply(title, body).then(() => {
              setTitle('');
              setBody('');
              toast({ message: 'Saved.' });
            })
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  form: { paddingHorizontal: margin, paddingTop: space[4], gap: space[3] },
});
