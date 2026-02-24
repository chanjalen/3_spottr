import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/common/Avatar';
import {
  fetchOrgDetail,
  listOrgMembers,
  listJoinRequests,
  listInviteCodes,
  acceptJoinRequest,
  denyJoinRequest,
  promoteMember,
  demoteMember,
  kickMember,
  generateInviteCode,
  deactivateInviteCode,
  updateOrg,
  updateOrgAvatar,
  deleteOrg,
  leaveOrg,
  joinOrgViaCode,
  OrgDetail,
  OrgMember,
  OrgJoinRequest,
  OrgInviteCode,
} from '../../api/organizations';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'OrgProfile'>;
  route: RouteProp<RootStackParamList, 'OrgProfile'>;
};

type ProfileTab = 'Info' | 'Admin' | 'Settings';

export default function OrgProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { orgId } = route.params;

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [requests, setRequests] = useState<OrgJoinRequest[]>([]);
  const [codes, setCodes] = useState<OrgInviteCode[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Info');
  const [actingOn, setActingOn] = useState<string | null>(null);

  // ── Edit modal ───────────────────────────────────────────────────────────
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrivacy, setEditPrivacy] = useState<'public' | 'private'>('public');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Join code modal ──────────────────────────────────────────────────────
  const [joinCodeVisible, setJoinCodeVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);

  const isAdmin = org?.user_role === 'creator' || org?.user_role === 'admin';
  const isCreator = org?.user_role === 'creator';
  const isMember = !!org?.user_role;

  // ── Load data ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, mems] = await Promise.all([
        fetchOrgDetail(orgId),
        listOrgMembers(orgId),
      ]);
      setOrg(detail);
      setMembers(mems);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [reqs, inviteCodes] = await Promise.all([
        listJoinRequests(orgId),
        listInviteCodes(orgId),
      ]);
      setRequests(reqs);
      setCodes(inviteCodes);
    } catch {
      // ignore
    }
  }, [orgId, isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Load admin data when switching to Admin tab
  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    if (tab === 'Admin' && isAdmin) loadAdminData();
  };

  // ── Join requests ────────────────────────────────────────────────────────

  const handleAccept = async (requestId: string) => {
    setActingOn(requestId);
    try {
      await acceptJoinRequest(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      load(); // refresh member count
    } catch {
      Alert.alert('Error', 'Failed to accept request.');
    } finally {
      setActingOn(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    setActingOn(requestId);
    try {
      await denyJoinRequest(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      Alert.alert('Error', 'Failed to deny request.');
    } finally {
      setActingOn(null);
    }
  };

  // ── Member management ────────────────────────────────────────────────────

  const handleMemberAction = (member: OrgMember) => {
    if (!isAdmin) return;
    const myId = String(me?.id);
    if (member.user_id === myId) return;
    if (member.role === 'creator') return;

    const options: { text: string; style?: 'destructive' | 'cancel'; onPress: () => void }[] = [];

    if (isCreator) {
      if (member.role === 'member') {
        options.push({ text: 'Promote to Admin', onPress: () => handlePromote(member.user_id) });
      }
      if (member.role === 'admin') {
        options.push({ text: 'Demote to Member', onPress: () => handleDemote(member.user_id) });
      }
    }
    options.push({ text: 'Remove from Org', style: 'destructive', onPress: () => handleKick(member.user_id) });
    options.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });

    Alert.alert(member.display_name, `Manage ${member.display_name}`, options);
  };

  const handlePromote = async (userId: string) => {
    setActingOn(userId);
    try {
      await promoteMember(orgId, userId);
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: 'admin' } : m));
    } catch {
      Alert.alert('Error', 'Failed to promote member.');
    } finally {
      setActingOn(null);
    }
  };

  const handleDemote = async (userId: string) => {
    setActingOn(userId);
    try {
      await demoteMember(orgId, userId);
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: 'member' } : m));
    } catch {
      Alert.alert('Error', 'Failed to demote member.');
    } finally {
      setActingOn(null);
    }
  };

  const handleKick = async (userId: string) => {
    setActingOn(userId);
    try {
      await kickMember(orgId, userId);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch {
      Alert.alert('Error', 'Failed to remove member.');
    } finally {
      setActingOn(null);
    }
  };

  // ── Invite codes ─────────────────────────────────────────────────────────

  const handleGenerateCode = async () => {
    try {
      const code = await generateInviteCode(orgId);
      setCodes(prev => [...prev, code]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to generate code.');
    }
  };

  const handleDeactivateCode = async (codeId: string) => {
    try {
      await deactivateInviteCode(orgId, codeId);
      setCodes(prev => prev.map(c => c.id === codeId ? { ...c, is_active: false } : c));
    } catch {
      Alert.alert('Error', 'Failed to deactivate code.');
    }
  };

  // ── Edit org ─────────────────────────────────────────────────────────────

  const openEdit = () => {
    if (!org) return;
    setEditName(org.name);
    setEditDesc(org.description);
    setEditPrivacy(org.privacy);
    setEditAvatarUri(null);
    setEditVisible(true);
  };

  const handlePickEditAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setEditAvatarUri(result.assets[0].uri);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      let updated = await updateOrg(orgId, {
        name: editName.trim(),
        description: editDesc.trim(),
        privacy: editPrivacy,
      });
      if (editAvatarUri) {
        updated = await updateOrgAvatar(orgId, editAvatarUri);
      }
      setOrg(updated);
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // ── Leave / Delete ───────────────────────────────────────────────────────

  const handleLeave = () => {
    Alert.alert('Leave Organization', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveOrg(orgId);
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.error ?? 'Failed to leave org.');
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Organization', 'This will permanently delete the org and all announcements. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOrg(orgId);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to delete organization.');
          }
        },
      },
    ]);
  };

  // ── Join via code ────────────────────────────────────────────────────────

  const handleJoinCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoiningCode(true);
    try {
      await joinOrgViaCode(code);
      setJoinCode('');
      setJoinCodeVisible(false);
      Alert.alert('Joined!', 'You have joined the organization.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Invalid or expired invite code.');
    } finally {
      setJoiningCode(false);
    }
  };

  // ── Tab content ──────────────────────────────────────────────────────────

  const renderInfoTab = () => (
    <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 120 }}>
      {/* Org info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Feather name={org?.privacy === 'private' ? 'lock' : 'globe'} size={16} color={colors.textMuted} />
          <Text style={styles.infoText}>
            {org?.privacy === 'private' ? 'Private organization' : 'Public organization'}
          </Text>
        </View>
        {!!org?.description && (
          <Text style={styles.description}>{org.description}</Text>
        )}
        <View style={styles.infoRow}>
          <Feather name="users" size={16} color={colors.textMuted} />
          <Text style={styles.infoText}>{org?.member_count ?? 0} members</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="user" size={16} color={colors.textMuted} />
          <Text style={styles.infoText}>Created by @{org?.created_by_username}</Text>
        </View>
      </View>

      {/* Members */}
      <Text style={styles.sectionLabel}>MEMBERS</Text>
      {members.map((m) => {
        const isMe = String(me?.id) === m.user_id;
        return (
          <Pressable
            key={m.user_id}
            style={({ pressed }) => [styles.memberRow, pressed && isAdmin && !isMe && { opacity: 0.7 }]}
            onPress={() => handleMemberAction(m)}
            disabled={!isAdmin || isMe || m.role === 'creator'}
          >
            <Avatar uri={m.avatar_url} name={m.display_name} size={40} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.display_name}</Text>
              <Text style={styles.memberUsername}>@{m.username}</Text>
            </View>
            <View style={[
              styles.roleBadge,
              m.role === 'creator' && styles.roleBadgeCreator,
              m.role === 'admin' && styles.roleBadgeAdmin,
            ]}>
              <Text style={[
                styles.roleBadgeText,
                (m.role === 'creator' || m.role === 'admin') && styles.roleBadgeTextActive,
              ]}>
                {m.role}
              </Text>
            </View>
            {actingOn === m.user_id && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
            )}
          </Pressable>
        );
      })}

      {/* Leave / join with code buttons */}
      {isMember && !isCreator && (
        <Pressable style={styles.leaveBtn} onPress={handleLeave}>
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.leaveBtnText}>Leave Organization</Text>
        </Pressable>
      )}
      {!isMember && (
        <Pressable style={styles.joinCodeBtn} onPress={() => setJoinCodeVisible(true)}>
          <Feather name="key" size={16} color={colors.primary} />
          <Text style={styles.joinCodeBtnText}>Join with Invite Code</Text>
        </Pressable>
      )}
    </ScrollView>
  );

  const renderAdminTab = () => (
    <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 120 }}>
      {/* Join requests */}
      <Text style={styles.sectionLabel}>JOIN REQUESTS</Text>
      {requests.filter(r => r.status === 'pending').length === 0 ? (
        <Text style={styles.emptySection}>No pending requests</Text>
      ) : (
        requests.filter(r => r.status === 'pending').map((req) => (
          <View key={req.id} style={styles.requestRow}>
            <Avatar uri={req.avatar_url} name={req.display_name} size={40} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{req.display_name}</Text>
              <Text style={styles.memberUsername}>@{req.username}</Text>
            </View>
            <View style={styles.requestActions}>
              {actingOn === req.id ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Pressable style={styles.acceptBtn} onPress={() => handleAccept(req.id)}>
                    <Feather name="check" size={16} color="#22c55e" />
                  </Pressable>
                  <Pressable style={styles.denyBtn} onPress={() => handleDeny(req.id)}>
                    <Feather name="x" size={16} color="#ef4444" />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ))
      )}

      {/* Invite codes */}
      <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
        <Text style={styles.sectionLabel}>INVITE CODES</Text>
        <Pressable onPress={handleGenerateCode} style={styles.genCodeBtn}>
          <Feather name="plus" size={14} color="#fff" />
          <Text style={styles.genCodeText}>Generate</Text>
        </Pressable>
      </View>
      {codes.length === 0 ? (
        <Text style={styles.emptySection}>No invite codes</Text>
      ) : (
        codes.map((code) => (
          <View key={code.id} style={styles.codeRow}>
            <View style={styles.codeInfo}>
              <Text style={[styles.codeText, !code.is_active && styles.codeInactive]}>
                {code.code}
              </Text>
              <Text style={styles.codeStatus}>{code.is_active ? 'Active' : 'Inactive'}</Text>
            </View>
            <View style={styles.codeActions}>
              {code.is_active && (
                <>
                  <Pressable
                    style={styles.copyCodeBtn}
                    onPress={() => Clipboard.setString(code.code)}
                  >
                    <Feather name="copy" size={15} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    style={styles.deactivateBtn}
                    onPress={() => handleDeactivateCode(code.id)}
                  >
                    <Feather name="x-circle" size={15} color={colors.textMuted} />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderSettingsTab = () => (
    <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 120 }}>
      {isAdmin && (
        <Pressable style={styles.settingsRow} onPress={openEdit}>
          <Feather name="edit-2" size={18} color={colors.textPrimary} />
          <Text style={styles.settingsRowText}>Edit Organization</Text>
          <Feather name="chevron-right" size={16} color={colors.textMuted} />
        </Pressable>
      )}
      {isCreator && (
        <Pressable style={[styles.settingsRow, styles.settingsRowDanger]} onPress={handleDelete}>
          <Feather name="trash-2" size={18} color="#ef4444" />
          <Text style={[styles.settingsRowText, { color: '#ef4444' }]}>Delete Organization</Text>
          <Feather name="chevron-right" size={16} color="#ef4444" />
        </Pressable>
      )}
    </ScrollView>
  );

  // ── Main render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background.base, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const tabs: ProfileTab[] = isAdmin ? ['Info', 'Admin', 'Settings'] : ['Info'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Organization</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Org hero */}
      <View style={styles.hero}>
        <Avatar uri={org?.avatar_url ?? null} name={org?.name ?? ''} size={72} />
        <Text style={styles.orgName}>{org?.name}</Text>
        {org?.user_role && (
          <View style={[
            styles.myRoleBadge,
            org.user_role === 'creator' && styles.roleBadgeCreator,
            org.user_role === 'admin' && styles.roleBadgeAdmin,
          ]}>
            <Text style={[
              styles.myRoleBadgeText,
              (org.user_role === 'creator' || org.user_role === 'admin') && styles.roleBadgeTextActive,
            ]}>
              {org.user_role}
            </Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      {tabs.length > 1 && (
        <View style={styles.tabRow}>
          {tabs.map((tab) => (
            <Pressable
              key={tab}
              style={styles.tab}
              onPress={() => handleTabChange(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* Tab content */}
      {activeTab === 'Info' && renderInfoTab()}
      {activeTab === 'Admin' && renderAdminTab()}
      {activeTab === 'Settings' && renderSettingsTab()}

      {/* Edit org modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditVisible(false)} />
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Edit Organization</Text>
              <Pressable onPress={() => setEditVisible(false)}>
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Avatar picker */}
            <Pressable style={styles.avatarRow} onPress={handlePickEditAvatar}>
              <View style={styles.avatarCircle}>
                {editAvatarUri ? (
                  <Image source={{ uri: editAvatarUri }} style={styles.avatarPreview} />
                ) : org?.avatar_url ? (
                  <Image source={{ uri: org.avatar_url }} style={styles.avatarPreview} />
                ) : (
                  <Feather name="camera" size={22} color="#fff" />
                )}
              </View>
              <Text style={styles.addPhotoText}>Change Photo</Text>
            </Pressable>

            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                maxLength={100}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                value={editDesc}
                onChangeText={setEditDesc}
                maxLength={500}
                multiline
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Privacy</Text>
              <View style={styles.privacyRow}>
                {(['public', 'private'] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.privacyBtn, editPrivacy === p && styles.privacyBtnActive]}
                    onPress={() => setEditPrivacy(p)}
                  >
                    <Feather
                      name={p === 'private' ? 'lock' : 'globe'}
                      size={14}
                      color={editPrivacy === p ? '#fff' : colors.textMuted}
                    />
                    <Text style={[styles.privacyBtnText, editPrivacy === p && styles.privacyBtnTextActive]}>
                      {p === 'public' ? 'Public' : 'Private'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              style={[styles.saveBtn, (!editName.trim() || saving) && styles.saveBtnDisabled]}
              onPress={handleSaveEdit}
              disabled={!editName.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join via code modal */}
      <Modal
        visible={joinCodeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinCodeVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setJoinCodeVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Join with Invite Code</Text>
              <Pressable onPress={() => setJoinCodeVisible(false)}>
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter 8-character code"
              placeholderTextColor={colors.textMuted}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoFocus
              maxLength={8}
            />
            <Pressable
              style={[styles.saveBtn, (!joinCode.trim() || joiningCode) && styles.saveBtnDisabled]}
              onPress={handleJoinCode}
              disabled={!joinCode.trim() || joiningCode}
            >
              {joiningCode ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Join</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.textPrimary },

  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  orgName: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  myRoleBadge: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  myRoleBadgeText: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '600' },

  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { fontWeight: '700', color: colors.textPrimary },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },

  sectionLabel: {
    fontSize: typography.size.xs,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptySection: { fontSize: typography.size.sm, color: colors.textMuted, marginBottom: spacing.sm },

  infoCard: {
    backgroundColor: colors.background.card,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: typography.size.sm, color: colors.textSecondary },
  description: { fontSize: typography.size.sm, color: colors.textPrimary, lineHeight: 20 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
    gap: spacing.sm,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  memberUsername: { fontSize: typography.size.xs, color: colors.textMuted },

  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  roleBadgeCreator: { backgroundColor: 'rgba(234,179,8,0.15)' },
  roleBadgeAdmin: { backgroundColor: 'rgba(79,195,224,0.15)' },
  roleBadgeText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  roleBadgeTextActive: { color: colors.textPrimary },

  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  leaveBtnText: { fontSize: typography.size.sm, color: '#ef4444', fontWeight: '600' },

  joinCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.05)',
  },
  joinCodeBtnText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
    gap: spacing.sm,
  },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34,197,94,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  genCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  genCodeText: { fontSize: typography.size.xs, color: '#fff', fontWeight: '600' },

  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  codeInfo: { gap: 2 },
  codeText: { fontSize: typography.size.md, fontWeight: '700', fontFamily: 'monospace', color: colors.textPrimary, letterSpacing: 2 },
  codeInactive: { color: colors.textMuted, textDecorationLine: 'line-through' },
  codeStatus: { fontSize: typography.size.xs, color: colors.textMuted },
  codeActions: { flexDirection: 'row', gap: 8 },
  copyCodeBtn: { padding: 6 },
  deactivateBtn: { padding: 6 },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  settingsRowDanger: { borderBottomColor: 'transparent' },
  settingsRowText: { flex: 1, fontSize: typography.size.sm, fontWeight: '500', color: colors.textPrimary },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: colors.background.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.base,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.textPrimary },
  inputBlock: { marginBottom: spacing.md },
  inputLabel: { fontSize: typography.size.xs, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 10,
    padding: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPreview: { width: 60, height: 60 },
  addPhotoText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '500' },
  privacyRow: { flexDirection: 'row', gap: spacing.sm },
  privacyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
  },
  privacyBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  privacyBtnText: { fontSize: typography.size.sm, color: colors.textMuted },
  privacyBtnTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.size.sm },
});
