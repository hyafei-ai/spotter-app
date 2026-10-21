import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';
import { Text } from '../components/Text';
import { VoicePlayer } from './VoiceNote';

export interface BubbleMessage {
  mine: boolean;
  kind: 'text' | 'voice' | 'image' | 'link';
  body: string;
  mediaUrl: string | null;
  durationMs: number | null;
  link: { type: string; id: string; title: string } | null;
  sentAt: string;
  waiting: boolean;
  /** Shown under the newest own message once the other side has read it. */
  seen: boolean;
}

/** One message in a coach–client thread (C-6, K-1): text, voice note, photo or a link to a workout. */
export function MessageBubble({ m, onOpenLink }: { m: BubbleMessage; onOpenLink?: (link: NonNullable<BubbleMessage['link']>) => void }) {
  const { colors } = useTheme();
  const time = new Date(m.sentAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const linkLabel = m.link ? `${m.link.type === 'session' ? 'Workout' : m.link.type === 'form_check' ? 'Form check' : 'Program'}: ${m.link.title}` : '';
  return (
    <View style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.bubble, { backgroundColor: m.mine ? colors.surface : 'transparent', borderColor: colors.line }]}>
        {m.kind === 'voice' ? (
          m.mediaUrl ? (
            <VoicePlayer uri={m.mediaUrl} durationMs={m.durationMs} />
          ) : (
            <Text color="ink2">Voice note (still uploading)</Text>
          )
        ) : m.kind === 'image' ? (
          m.mediaUrl ? (
            <Image source={{ uri: m.mediaUrl }} style={styles.photo} accessibilityLabel={m.mine ? 'Photo you sent' : 'Photo from your coach'} resizeMode="cover" />
          ) : (
            <Text color="ink2">Photo (still uploading)</Text>
          )
        ) : m.kind === 'link' && m.link ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${linkLabel}`}
            onPress={() => onOpenLink?.(m.link!)}
            style={styles.link}
          >
            <Feather name={m.link.type === 'session' ? 'book-open' : 'video'} size={18} color={colors.brand} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {linkLabel}
            </Text>
            <Feather name="chevron-right" size={18} color={colors.ink2} />
          </Pressable>
        ) : null}
        {m.body ? <Text style={m.kind !== 'text' ? { marginTop: space[2] } : undefined}>{m.body}</Text> : null}
      </View>
      <View style={styles.meta}>
        {m.waiting ? <Feather name="clock" size={12} color={colors.ink2} /> : null}
        <Text variant="caption" color="ink2">
          {m.waiting ? 'Waiting to send' : m.seen ? `${time} · Seen` : time}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', padding: space[3], borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  photo: { width: 220, height: 220, borderRadius: radius.control },
  link: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, minWidth: 200 },
});
