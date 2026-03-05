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
import { RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/AuthContext';
import Avatar from '../../components/common/Avatar';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { updateUserAvatar, apiDeleteAccount, apiUpdateProfile, apiUpdatePreferences, apiUpdatePrivacy } from '../../api/accounts';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EditProfile'>;
  route: RouteProp<RootStackParamList, 'EditProfile'>;
};

type SideTab = 'Profile' | 'Account' | 'Preferences' | 'Privacy' | 'Notifications';
const SIDE_TABS: SideTab[] = ['Profile', 'Account', 'Preferences', 'Privacy', 'Notifications'];

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

  // Preferences — seeded from user account, saved on change
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>(user?.weight_unit ?? 'lbs');
  const [distanceUnit, setDistanceUnit] = useState<'miles' | 'km'>(user?.distance_unit ?? 'miles');
  const [prefSaving, setPrefSaving] = useState(false);

  const handlePrefChange = async (field: 'weight_unit' | 'distance_unit', value: string) => {
    if (field === 'weight_unit') setWeightUnit(value as 'lbs' | 'kg');
    else setDistanceUnit(value as 'miles' | 'km');
    if (prefSaving) return;
    setPrefSaving(true);
    try {
      const updated = await apiUpdatePreferences({ [field]: value });
      await updateUser(updated);
    } catch {
      // revert on failure
      if (field === 'weight_unit') setWeightUnit(user?.weight_unit ?? 'lbs');
      else setDistanceUnit(user?.distance_unit ?? 'miles');
    } finally {
      setPrefSaving(false);
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

          {activeTab === 'Preferences' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Units</Text>
              <Text style={styles.sectionSubheading}>Used as defaults when logging workouts and PRs.</Text>
              <ToggleRow
                label="Weight Unit"
                left="lbs"
                right="kg"
                value={weightUnit}
                onChange={(v) => handlePrefChange('weight_unit', v)}
              />
              <ToggleRow
                label="Distance Unit"
                left="miles"
                right="km"
                value={distanceUnit}
                onChange={(v) => handlePrefChange('distance_unit', v)}
              />
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
              <Text style={styles.sectionSubheading}>Push notifications are not yet enabled. These settings will take effect when notifications are activated.</Text>
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

function SwitchRow({ label, sublabel, value, onChange }: { label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {sublabel ? <Text style={styles.switchSublabel}>{sublabel}</Text> : null}
      </View>
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
  switchSublabel: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
  sectionSubheading: { fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.xs },
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
