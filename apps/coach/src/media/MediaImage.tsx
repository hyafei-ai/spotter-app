import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { resolveMedia, useTheme } from '@spotter/ui';

/** A private progress photo. Real builds load it from a signed URL (≤ 1 h); MOCK: the shared demo media store. */
export function MediaImage({ mediaRef, style, label }: { mediaRef: string; style?: StyleProp<ImageStyle>; label: string }) {
  const { colors } = useTheme();
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    void resolveMedia(mediaRef).then((s) => {
      if (!live) return;
      if (typeof s === 'string') setSrc(s);
      else setMissing(true);
    });
    return () => {
      live = false;
    };
  }, [mediaRef]);
  if (missing || !src) {
    return (
      <View style={[style as object, styles.empty, { backgroundColor: colors.surface, borderColor: colors.line }]} accessibilityLabel={missing ? `${label} unavailable` : label}>
        <Feather name={missing ? 'image' : 'loader'} size={18} color={colors.ink2} />
      </View>
    );
  }
  return <Image source={{ uri: src }} style={style} resizeMode="cover" accessibilityLabel={label} />;
}

const styles = StyleSheet.create({ empty: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth } });
