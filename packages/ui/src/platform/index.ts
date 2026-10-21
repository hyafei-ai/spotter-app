/**
 * Platform plumbing shared by the client and coach apps: Supabase client and auth, push,
 * realtime, observability, and the screens/components built on them.
 * Imported as '@spotter/ui/platform' so the design-system entry point stays free of these SDKs.
 */
export * from './supabase';
export * from './session';
export * from './signIn';
export * from './push';
export * from './realtime';
export * from './observability';
export * from './secureStorage';
export * from './files';
export * from './SignInScreen';
export * from './QrCode';
export * from './VoiceNote';
export * from './MessageBubble';
export * from './Checkbox';
export * from './NotificationSettingsScreen';
