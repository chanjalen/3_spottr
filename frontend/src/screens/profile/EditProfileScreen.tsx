import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../store/AuthContext';
import Avatar from '../../components/common/Avatar';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { updateUserAvatar } from '../../api/accounts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EditProfile'>;
};

type SideTab = 'Profile' | 'Account' | 'Preferences' | 'Privacy' | 'Notifications';
const SIDE_TABS: SideTab[] = ['Profile', 'Account', 'Preferences', 'Privacy', 'Notifications'];

export default function EditProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<SideTab>('Profile');

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setAvatarUri(uri);
    setUploadingAvatar(true);
    try {
      await updateUserAvatar(uri);
    } catch {
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
      setAvatarUri(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Preferences
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [distanceUnit, setDistanceUnit] = useState<'miles' | 'km'>('miles');

  // Privacy toggles
  const [showStreak, setShowStreak] = useState(true);
  const [showPRs, setShowPRs] = useState(true);
  const [allowFriendReqs, setAllowFriendReqs] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  // Notification toggles
  const [notifyFriendWorkouts, setNotifyFriendWorkouts] = useState(true);
  const [notifyZaps, setNotifyZaps] = useState(true);
  const [notifyComments, setNotifyComments] = useState(true);
  const [notifyReactions, setNotifyReactions] = useState(true);
  const [notifyFriendReqs, setNotifyFriendReqs] = useState(true);
  const [notifyReminders, setNotifyReminders] = useState(true);
  const [notifyInvites, setNotifyInvites] = useState(true);
  const [notifyGroupMsg, setNotifyGroupMsg] = useState(true);

  const handleSignOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          {SIDE_TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.sideTab, activeTab === tab && styles.sideTabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.sideTabText, activeTab === tab && styles.sideTabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {activeTab === 'Profile' && (
            <View style={styles.section}>
              <View style={styles.avatarRow}>
                <Pressable onPress={handlePickAvatar} style={styles.avatarWrap}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
                  ) : (
                    <Avatar uri={user?.avatar_url ?? null} name={user?.display_name ?? ''} size={72} />
                  )}
                  <View style={styles.avatarOverlay}>
                    <Feather name={uploadingAvatar ? 'loader' : 'camera'} size={18} color="#fff" />
                  </View>
                </Pressable>
                <Pressable style={styles.changeAvatarBtn} onPress={handlePickAvatar} disabled={uploadingAvatar}>
                  <Text style={styles.changeAvatarText}>
                    {uploadingAvatar ? 'Uploading…' : 'Change Photo'}
                  </Text>
                </Pressable>
              </View>
              <FieldInput label="Display Name" value={displayName} onChangeText={setDisplayName} />
              <FieldInput label="Username" value={user?.username ?? ''} editable={false} />
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Bio</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={bio}
                  onChangeText={(t) => { if (t.length <= 150) setBio(t); }}
                  multiline
                  numberOfLines={3}
                  placeholder="Tell us about yourself…"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.charCount}>{bio.length}/150</Text>
              </View>
            </View>
          )}

          {activeTab === 'Account' && (
            <View style={styles.section}>
              <FieldInput label="Email" value="" placeholder="your@email.com" keyboard="email-address" />
              <FieldInput label="Phone Number" value="" placeholder="+1 555 000 0000" keyboard="phone-pad" />
              <FieldInput label="Birthday" value="" placeholder="YYYY-MM-DD" />
              <Pressable style={styles.dangerBtn} onPress={handleSignOut}>
                <Feather name="log-out" size={16} color={colors.error} />
                <Text style={styles.dangerBtnText}>Log Out</Text>
              </Pressable>
            </View>
          )}

          {activeTab === 'Preferences' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Units</Text>
              <ToggleRow
                label="Weight Unit"
                left="lbs"
                right="kg"
                value={weightUnit}
                onChange={(v) => setWeightUnit(v as 'lbs' | 'kg')}
              />
              <ToggleRow
                label="Distance Unit"
                left="miles"
                right="km"
                value={distanceUnit}
                onChange={(v) => setDistanceUnit(v as 'miles' | 'km')}
              />
            </View>
          )}

          {activeTab === 'Privacy' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Visibility</Text>
              <SwitchRow label="Show Streak" value={showStreak} onChange={setShowStreak} />
              <SwitchRow label="Show Personal Records" value={showPRs} onChange={setShowPRs} />
              <SwitchRow label="Allow Friend Requests" value={allowFriendReqs} onChange={setAllowFriendReqs} />
              <SwitchRow label="Show Online Status" value={showOnlineStatus} onChange={setShowOnlineStatus} />
            </View>
          )}

          {activeTab === 'Notifications' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Activity</Text>
              <SwitchRow label="Friend Workouts" value={notifyFriendWorkouts} onChange={setNotifyFriendWorkouts} />
              <SwitchRow label="Zaps" value={notifyZaps} onChange={setNotifyZaps} />
              <SwitchRow label="Comments" value={notifyComments} onChange={setNotifyComments} />
              <SwitchRow label="Reactions" value={notifyReactions} onChange={setNotifyReactions} />
              <SwitchRow label="Friend Requests" value={notifyFriendReqs} onChange={setNotifyFriendReqs} />
              <SwitchRow label="Workout Reminders" value={notifyReminders} onChange={setNotifyReminders} />
              <SwitchRow label="Workout Invites" value={notifyInvites} onChange={setNotifyInvites} />
              <SwitchRow label="Group Messages" value={notifyGroupMsg} onChange={setNotifyGroupMsg} />
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboard,
}: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboard?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        editable={editable}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
      />
    </View>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.borderColor }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.primaryDark : '#f4f4f4') : undefined}
      />
    </View>
  );
}

function ToggleRow({
  label,
  left,
  right,
  value,
  onChange,
}: {
  label: string;
  left: string;
  right: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <View style={styles.toggleWrap}>
        <Pressable
          style={[styles.toggleOption, value === left && styles.toggleOptionActive]}
          onPress={() => onChange(left)}
        >
          <Text style={[styles.toggleOptionText, value === left && styles.toggleOptionTextActive]}>{left}</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleOption, value === right && styles.toggleOptionActive]}
          onPress={() => onChange(right)}
        >
          <Text style={[styles.toggleOptionText, value === right && styles.toggleOptionTextActive]}>{right}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  saveBtnText: { fontSize: typography.size.sm, fontWeight: '700', color: '#fff' },
  body: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 110,
    borderRightWidth: 1,
    borderRightColor: colors.border.default,
    paddingTop: spacing.md,
    gap: 2,
  },
  sideTab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  sideTabActive: {
    backgroundColor: colors.background.elevated,
    borderRightWidth: 2,
    borderRightColor: colors.primary,
  },
  sideTabText: { fontSize: typography.size.sm, color: colors.textSecondary },
  sideTabTextActive: { fontWeight: '600', color: colors.textPrimary },
  content: { flex: 1 },
  section: { padding: spacing.xl, gap: spacing.md },
  sectionHeading: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  avatarRow: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  avatarWrap: { position: 'relative' },
  avatarPreview: { width: 72, height: 72, borderRadius: 36 },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background.base,
  },
  changeAvatarBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  changeAvatarText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },
  field: { gap: 4 },
  fieldLabel: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
  },
  inputDisabled: { backgroundColor: colors.background.card, color: colors.textMuted },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
  charCount: { fontSize: typography.size.xs, color: colors.textMuted, alignSelf: 'flex-end' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  switchLabel: { fontSize: typography.size.sm, color: colors.textPrimary },
  toggleWrap: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderColor },
  toggleOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  toggleOptionActive: { backgroundColor: colors.primary },
  toggleOptionText: { fontSize: typography.size.sm, color: colors.textSecondary },
  toggleOptionTextActive: { color: '#fff', fontWeight: '600' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  dangerBtnText: { fontSize: typography.size.sm, color: colors.error, fontWeight: '600' },
});
