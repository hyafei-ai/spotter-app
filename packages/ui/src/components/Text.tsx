import { Text as RNText, useWindowDimensions, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { type, type ColorName, type TypeVariant } from '../tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: ColorName | 'brandInk';
  align?: TextStyle['textAlign'];
  tabular?: boolean;
}

/**
 * All text goes through here. RN scales fontSize with the system setting but not lineHeight,
 * so line height is scaled too; otherwise large text clips.
 */
export function Text({ variant = 'body', color = 'ink', align, tabular, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const t = type[variant];
  return (
    <RNText
      {...rest}
      style={[
        t,
        { lineHeight: Math.ceil(t.lineHeight * Math.max(1, fontScale)), color: colors[color] },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
