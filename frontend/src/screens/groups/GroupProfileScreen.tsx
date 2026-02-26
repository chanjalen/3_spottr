import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import InactiveStreakSheet from '../../components/groups/InactiveStreakSheet';
import {
  fetchGroupDetail,
  fetchGroupStreakDetail,
  leaveGroup,
  generateInviteCode,
  updateGroup,
  GroupDetail,
  GroupStreakDetail,
} from '../../api/groups';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GroupProfile'>;
  route: RouteProp<RootStackParamList, 'GroupProfile'>;
};

export default function GroupProfileScreen({ navigation, route }: Props) {
  const groupId = route.params.groupId;
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [streakDetail, setStreakDetail] = useState<GroupStreakDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [streakSheetVisible, setStreakSheetVisible] = useState(false);
  const [streakLoading, setStreakLoading] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadGroup = useCallback(async () => {
    try {
      const data = await fetchGroupDetail(groupId);
      setGroup(data);
      if (data.invite_code) setInviteCode(data.invite_code);
    } catch {
      // handle error
    }
  }, [groupId]);

  const loadStreakDetail = useCallback(async () => {
    setStreakLoading(true);
    try {
      const data = await fetchGroupStreakDetail(groupId);
      setStreakDetail(data);
    } catch {
      // handle error
    } finally {
      setStreakLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadGroup();
      setIsLoading(false);
    };
    init();
  }, [loadGroup]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadGroup();
    if (streakDetail) await loadStreakDetail();
    setIsRefreshing(false);
  }, [loadGroup, loadStreakDetail, streakDetail]);

  const handleStreakPress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStreakSheetVisible(true);
    if (!streakDetail) await loadStreakDetail();
  }, [streakDetail, loadStreakDetail]);

  const handleLeaveGroup = useCallback(() => {
    Alert.alert(
      'Leave Group',
      `Are you sure you want to leave ${group?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsLeaving(true);
            try {
              await leaveGroup(groupId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Could not leave the group. Please try again.');
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ],
    );
  }, [groupId, group?.name, navigation]);

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', 'Invite code copied to clipboard.');
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const data = await generateInviteCode(groupId);
      setInviteCode(data.code);
    } catch {
      Alert.alert('Error', 'Could not generate invite code.');
    } finally {
      setGeneratingCode(false);
    }
  };


  // ── Edit modal handlers ────────────────────────────────────────────────────

  const openEditModal = () => {
    if (!group) return;
    setEditName(group.name);
    setEditAvatarUri(null);
    setEditVisible(true);
  };

  const handlePickEditAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change the group photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setEditAvatarUri(result.assets[0].uri);
  };

  const handleSaveChanges = async () => {
    if (!editName.trim()) {
      Alert.alert('Required', 'Group name cannot be empty.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateGroup(groupId, {
        name: editName.trim(),
        ...(editAvatarUri ? { avatarUri: editAvatarUri } : {}),
      });
      setGroup(updated);
      setEditVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };


  if (isLoading || !group) {
    return (
      <View style={[styles.loader, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  const isMember = group.is_member;
  const hasActiveStreak = group.group_streak > 0;

  // Avatar to show in edit modal (newly picked or existing)
  const editAvatarSource = editAvatarUri
    ? { uri: editAvatarUri }
    : group.avatar_url
    ? { uri: group.avatar_url }
    : null;

  return (
    <View style={styles.root}>
      {/* ── Header bar ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
        {isMember ? (
          <Pressable style={styles.headerBtn} onPress={openEditModal}>
            <Feather name="settings" size={20} color={colors.text.primary} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
            progressBackgroundColor={colors.background.elevated}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile header ── */}
        <View style={styles.header}>
          {group.avatar_url ? (
            <Image
              source={{ uri: group.avatar_url }}
              style={styles.groupAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.groupAvatarFallback}>
              <Text style={styles.groupAvatarInitial}>{group.name[0].toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.groupName}>{group.name}</Text>
          {!!group.description && (
            <Text style={styles.groupDescription}>{group.description}</Text>
          )}

          {/* Join code — visible to members only */}
          {isMember && (
            inviteCode ? (
              <View style={styles.codeRow}>
                <Text style={styles.codeLabel}>JOIN CODE:</Text>
                <Text style={styles.codeText}>{inviteCode}</Text>
                <Pressable style={styles.copyBtn} onPress={handleCopyCode}>
                  <Text style={styles.copyBtnText}>Copy</Text>
                </Pressable>
              </View>
            ) : isMember ? (
              <Pressable style={styles.generateCodeBtn} onPress={handleGenerateCode} disabled={generatingCode}>
                {generatingCode ? (
                  <ActivityIndicator size="small" color={colors.brand.primary} />
                ) : (
                  <>
                    <Feather name="link" size={14} color={colors.brand.primary} />
                    <Text style={styles.generateCodeText}>Generate Invite Code</Text>
                  </>
                )}
              </Pressable>
            ) : null
          )}

          {/* Badge pills */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Feather name={group.privacy === 'private' ? 'lock' : 'globe'} size={12} color={colors.text.muted} />
              <Text style={styles.badgeText}>{group.privacy === 'private' ? 'Private' : 'Public'}</Text>
            </View>
            <View style={styles.badge}>
              <Feather name="users" size={12} color={colors.text.muted} />
              <Text style={styles.badgeText}>{group.member_count} members</Text>
            </View>
            {hasActiveStreak && (
              <View style={styles.badge}>
                <Text style={styles.badgeEmoji}>🔥</Text>
                <Text style={styles.badgeText}>{group.group_streak} day streak</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Streak & Leave ── */}
        <View style={styles.streakSection}>
          <Text style={styles.streakSectionLabel}>Group Streak</Text>
          <View style={styles.streakActionsRow}>
            <TouchableOpacity
              style={[styles.streakButton, hasActiveStreak && styles.streakButtonActive]}
              onPress={handleStreakPress}
              activeOpacity={0.75}
            >
              {hasActiveStreak ? (
                <>
                  <Text style={styles.streakFlame}>🔥</Text>
                  <Text style={styles.streakButtonText}>{group.group_streak} day streak</Text>
                </>
              ) : (
                <>
                  <Feather name="zap-off" size={15} color={colors.text.muted} />
                  <Text style={[styles.streakButtonText, styles.streakButtonTextInactive]}>
                    No group streak active
                  </Text>
                </>
              )}
              <Feather name="chevron-right" size={15} color={hasActiveStreak ? colors.brand.primary : colors.text.muted} />
            </TouchableOpacity>
            {isMember && (
              <TouchableOpacity
                style={styles.leaveButton}
                onPress={handleLeaveGroup}
                activeOpacity={0.75}
                disabled={isLeaving}
              >
                <Feather name="log-out" size={14} color="#ef4444" />
                <Text style={styles.leaveButtonText}>{isLeaving ? 'Leaving…' : 'Leave'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {group.longest_group_streak > 0 && (
            <Text style={styles.streakBest}>Best: {group.longest_group_streak}d</Text>
          )}
        </View>

        {/* ── Members ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEMBERS</Text>
          {group.members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <Avatar
                uri={member.avatar_url}
                name={member.display_name || member.username}
                size={40}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.display_name || member.username}</Text>
                <Text style={styles.memberUsername}>@{member.username}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <InactiveStreakSheet
        isOpen={streakSheetVisible}
        groupId={groupId}
        groupStreak={group.group_streak}
        members={streakDetail?.members ?? []}
        isLoading={streakLoading}
        onClose={() => setStreakSheetVisible(false)}
      />

      {/* ── Group Settings Modal ── */}
      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKAV}
          >
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Group Settings</Text>
                <Pressable style={styles.modalCloseBtn} onPress={() => setEditVisible(false)}>
                  <Feather name="x" size={18} color={colors.text.secondary} />
                </Pressable>
              </View>

              <View style={styles.modalInfoContent}>
                {/* Avatar */}
                <View style={styles.avatarRow}>
                  {editAvatarSource ? (
                    <Image
                      source={editAvatarSource}
                      style={styles.editAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.editAvatarFallback}>
                      <Text style={styles.editAvatarInitial}>
                        {(editName || group.name)[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <Pressable style={styles.changePhotoBtn} onPress={handlePickEditAvatar}>
                    <Text style={styles.changePhotoText}>Change Photo</Text>
                  </Pressable>
                </View>

                {/* Group Name */}
                <Text style={styles.fieldLabel}>Group Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Group name"
                  placeholderTextColor={colors.text.muted}
                  maxLength={100}
                />

                <Pressable
                  style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
                  onPress={handleSaveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.base },
  loader: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header bar ───────────────────────────────────────────────────────────────
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.background.base,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: colors.text.primary,
  },

  // ── Scrollable content ────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: colors.background.base },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.base,
  },

  // ── Profile header ────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
  groupAvatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarInitial: {
    fontSize: typography.size['2xl'],
    fontFamily: typography.family.bold,
    color: '#fff',
  },
  groupName: {
    fontSize: typography.size.xl,
    fontFamily: typography.family.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  groupDescription: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing['2xl'],
  },

  // Join code
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
  },
  codeLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
    letterSpacing: 0.5,
  },
  codeText: {
    flex: 1,
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.brand.primary,
    letterSpacing: 2,
  },
  copyBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  copyBtnText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
  generateCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  generateCodeText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.brand.primary,
  },

  // Badge pills
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background.elevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeEmoji: { fontSize: 12 },
  badgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
  },

  // ── Streak section ────────────────────────────────────────────────────────────
  streakSection: { gap: spacing.xs },
  streakSectionLabel: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
    marginBottom: 2,
  },
  streakActionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.background.elevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streakButtonActive: {
    backgroundColor: colors.brand.primary + '15',
    borderColor: colors.brand.primary + '40',
  },
  streakFlame: { fontSize: typography.size.base },
  streakButtonText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.brand.primary,
  },
  streakButtonTextInactive: { color: colors.text.muted },
  streakBest: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
    paddingLeft: spacing.xs,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  leaveButtonText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: '#ef4444',
  },

  // ── Members ───────────────────────────────────────────────────────────────────
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.bold,
    color: colors.brand.primary,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.text.primary,
  },
  memberUsername: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.muted,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  creatorBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  creatorBadgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.bold,
    color: '#F59E0B',
    letterSpacing: 0.3,
  },
  adminBadge: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  adminBadgeText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.bold,
    color: '#8B5CF6',
    letterSpacing: 0.3,
  },
  memberRoleText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
    letterSpacing: 0.3,
  },
  actionBtn: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  actionBtnText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
  },
  promoteBtn: { borderColor: colors.success },
  promoteBtnText: { color: colors.success },
  demoteBtn: { borderColor: colors.warning },
  demoteBtnText: { color: colors.warning },
  kickBtn: { borderColor: colors.error },
  kickBtnText: { color: colors.error },

  // ── Edit Modal ────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalKAV: {
    width: '100%',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.background.elevated,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: colors.text.primary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  modalTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingHorizontal: spacing.lg,
  },
  modalTabItem: {
    marginRight: spacing.xl,
    paddingBottom: spacing.xs,
    position: 'relative',
  },
  modalTabText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.muted,
  },
  modalTabTextActive: {
    color: colors.brand.primary,
    fontFamily: typography.family.semibold,
  },
  modalTabTextDanger: {
    color: '#ef4444',
    fontFamily: typography.family.semibold,
  },
  modalTabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.brand.primary,
    borderRadius: 1,
  },
  modalTabUnderlineDanger: {
    backgroundColor: '#ef4444',
  },

  // Group Info tab
  modalInfoContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background.base,
  },
  editAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarInitial: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
  changePhotoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.base,
  },
  changePhotoText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.primary,
  },
  fieldLabel: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.text.secondary,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.primary,
    backgroundColor: colors.background.base,
  },
  fieldInputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 7,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    backgroundColor: colors.background.base,
  },
  privacyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.primary,
  },
  saveBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: 12,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: '#fff',
  },

  // Danger Zone tab
  modalDangerContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  dangerCard: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
  },
  dangerTitle: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: '#ef4444',
    marginBottom: spacing.xs,
  },
  dangerDescription: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: '#fff',
  },
});
