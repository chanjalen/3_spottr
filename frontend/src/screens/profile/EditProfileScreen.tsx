import React, { useState, useEffect } from 'react';
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
  Linking,
  Modal,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/AuthContext';
import Avatar from '../../components/common/Avatar';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { updateUserAvatar, apiDeleteAccount, apiUpdateProfile, apiUpdatePrivacy, apiUpdateNotifications } from '../../api/accounts';
import { fetchStreakInfo, updateWorkoutGoal } from '../../api/workouts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EditProfile'>;
  route: RouteProp<RootStackParamList, 'EditProfile'>;
};

type SideTab = 'Profile' | 'Account' | 'Privacy' | 'Notifications';
const SIDE_TABS: SideTab[] = ['Profile', 'Account', 'Privacy', 'Notifications'];

export default function EditProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SideTab>('Profile');

  // Profile fields — pre-populated from route params (passed by ProfileScreen)
  const [displayName, setDisplayName] = useState(route.params?.display_name ?? user?.display_name ?? '');
  const [bio, setBio] = useState(route.params?.bio ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentGoal, setCurrentGoal] = useState<number | null>(null);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

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
      const updatedUser = await updateUserAvatar(uri);
      await updateUser(updatedUser);
    } catch {
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
      setAvatarUri(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await apiUpdateProfile({ display_name: displayName, bio });
      await updateUser(updated);
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchStreakInfo().then((data) => setCurrentGoal(data.weekly_workout_goal)).catch(() => {});
  }, []);

  const handleGoalSelect = async (n: number) => {
    setShowGoalPicker(false);
    setCurrentGoal(n);
    await updateWorkoutGoal(n).catch(() => {});
  };

  // Notifications — synced with iOS permission status + backend flag
  const [pushNotifications, setPushNotifications] = useState(user?.push_notifications ?? true);
  const [iosPermissionDenied, setIosPermissionDenied] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      const denied = status === 'denied';
      setIosPermissionDenied(denied);
      // If iOS has denied permission, reflect that in the toggle
      if (denied && pushNotifications) {
        setPushNotifications(false);
      }
    });
  }, []);

  const handleNotificationToggle = async (value: boolean) => {
    if (value && iosPermissionDenied) {
      Alert.alert(
        'Notifications Disabled',
        'Push notifications are disabled in your device settings. Tap "Open Settings" to enable them.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    setPushNotifications(value);
    try {
      const updated = await apiUpdateNotifications({ push_notifications: value });
      await updateUser(updated);
    } catch {
      setPushNotifications(!value);
    }
  };

  // Privacy — checkin audience visibility, auto-saved on toggle
  const [checkinFriendsGroups, setCheckinFriendsGroups] = useState(user?.checkin_visible_friends ?? true);
  const [checkinOrgs, setCheckinOrgs] = useState(user?.checkin_visible_orgs ?? true);
  const [checkinGyms, setCheckinGyms] = useState(user?.checkin_visible_gyms ?? true);

  const handlePrivacyToggle = async (
    field: 'checkin_visible_friends' | 'checkin_visible_orgs' | 'checkin_visible_gyms',
    value: boolean,
  ) => {
    // Optimistic update
    if (field === 'checkin_visible_friends') setCheckinFriendsGroups(value);
    else if (field === 'checkin_visible_orgs') setCheckinOrgs(value);
    else setCheckinGyms(value);
    try {
      await apiUpdatePrivacy({ [field]: value });
      if (user) await updateUser({ ...user, [field]: value });
    } catch {
      // rollback
      if (field === 'checkin_visible_friends') setCheckinFriendsGroups(!value);
      else if (field === 'checkin_visible_orgs') setCheckinOrgs(!value);
      else setCheckinGyms(!value);
    }
  };


  const handleSignOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your posts, check-ins, and workouts. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Type "DELETE" to confirm — all your data will be erased forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await apiDeleteAccount();
                    } catch {
                      // Account may already be gone; sign out regardless
                    }
                    signOut();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
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
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Weekly Workout Goal</Text>
                <Pressable
                  style={({ pressed }) => [styles.goalRow, pressed && { opacity: 0.7 }]}
                  onPress={() => setShowGoalPicker(true)}
                >
                  <Text style={styles.goalRowValue}>
                    {currentGoal !== null
                      ? `${currentGoal} day${currentGoal !== 1 ? 's' : ''} per week`
                      : 'Loading…'}
                  </Text>
                  <Feather name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          )}

          {activeTab === 'Account' && (
            <View style={styles.section}>
              <FieldInput label="Email" value={user?.email ?? ''} placeholder="your@email.com" keyboard="email-address" editable={false} />
              <FieldInput label="Phone Number" value={user?.phone_number ?? ''} placeholder="Not set" keyboard="phone-pad" editable={false} />
              <FieldInput label="Birthday" value={user?.birthday ?? ''} placeholder="Not set" editable={false} />
              <Pressable style={styles.dangerBtn} onPress={handleSignOut}>
                <Feather name="log-out" size={16} color={colors.error} />
                <Text style={styles.dangerBtnText}>Log Out</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={handleDeleteAccount}>
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={styles.dangerBtnText}>Delete Account</Text>
              </Pressable>
            </View>
          )}


          {activeTab === 'Privacy' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Check-ins</Text>
              <Text style={styles.sectionSubheading}>Choose who can see your check-ins in their feed. Changes save instantly.</Text>
              <SwitchRow
                label="Friends/Groups"
                sublabel="Your friends and groups"
                value={checkinFriendsGroups}
                onChange={(v) => handlePrivacyToggle('checkin_visible_friends', v)}
              />
              <SwitchRow
                label="Organizations"
                sublabel="Members of your organizations"
                value={checkinOrgs}
                onChange={(v) => handlePrivacyToggle('checkin_visible_orgs', v)}
              />
              <SwitchRow
                label="Gyms"
                sublabel="Members of your gyms"
                value={checkinGyms}
                onChange={(v) => handlePrivacyToggle('checkin_visible_gyms', v)}
              />
            </View>
          )}

          {activeTab === 'Notifications' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Notifications</Text>
              <Text style={styles.sectionSubheading}>Choose how you want to be notified. Changes save instantly.</Text>
              <SwitchRow
                label="Push Notifications"
                sublabel={
                  iosPermissionDenied
                    ? 'Disabled in device settings — tap to open Settings'
                    : 'Likes, comments, follows, messages, and more'
                }
                value={pushNotifications}
                onChange={handleNotificationToggle}
                disabled={iosPermissionDenied}
              />
            </View>
          )}
        </ScrollView>
      </View>

      {/* Goal picker modal — same pattern as StreakDetailsScreen */}
      <Modal visible={showGoalPicker} transparent animationType="fade" onRequestClose={() => setShowGoalPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowGoalPicker(false)}>
          <Pressable style={styles.goalModal} onPress={() => {}}>
            <View style={styles.goalModalHeader}>
              <Text style={styles.goalModalTitle}>Weekly Goal</Text>
              <Pressable onPress={() => setShowGoalPicker(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.goalModalSubtitle}>How many days per week do you want to work out?</Text>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Pressable
                key={n}
                style={({ pressed }) => [styles.goalOption, pressed && { opacity: 0.6 }]}
                onPress={() => handleGoalSelect(n)}
              >
                <Text style={styles.goalOptionText}>{n} day{n > 1 ? 's' : ''}</Text>
                {currentGoal === n && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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

function SwitchRow({ label, sublabel, value, onChange, disabled }: { label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable style={styles.switchRow} onPress={disabled ? () => onChange(true) : undefined}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.switchLabel, disabled && { color: colors.textMuted }]}>{label}</Text>
        {sublabel ? <Text style={styles.switchSublabel}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.borderColor }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.primaryDark : '#f4f4f4') : undefined}
      />
    </Pressable>
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
  switchSublabel: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
  sectionSubheading: { fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.xs },

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

  // Goal row
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.elevated,
  },
  goalRowValue: { fontSize: typography.size.sm, color: colors.textPrimary },

  // Goal picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  goalModal: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xl,
    width: '100%',
    gap: spacing.md,
  },
  goalModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalModalTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },
  goalModalSubtitle: { fontSize: typography.size.sm, color: colors.textSecondary },
  goalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  goalOptionText: { fontSize: typography.size.base, color: colors.textPrimary, fontWeight: '500' },
});
