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
  acceptJoinRequest,
  denyJoinRequest,
  promoteMember,
  demoteMember,
  kickMember,
  updateOrg,
  updateOrgAvatar,
  deleteOrg,
  leaveOrg,
  joinOrgViaCode,
  requestJoinOrg,
  OrgDetail,
  OrgMember,
  OrgJoinRequest,
} from '../../api/organizations';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'OrgProfile'>;
  route: RouteProp<RootStackParamList, 'OrgProfile'>;
};

type ProfileTab = 'Info' | 'Admin';
type SettingsTab = 'info' | 'danger';

export default function OrgProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { orgId } = route.params;

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [requests, setRequests] = useState<OrgJoinRequest[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Info');
  const [actingOn, setActingOn] = useState<string | null>(null);

  // ── Edit modal ───────────────────────────────────────────────────────────
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrivacy, setEditPrivacy] = useState<'public' | 'private'>('public');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('info');
  const [deleting, setDeleting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!org?.invite_code) return;
    await Clipboard.setStringAsync(org.invite_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ── Join request ─────────────────────────────────────────────────────────
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);

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
      setRequested(detail.pending_request);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const reqs = await listJoinRequests(orgId);
      setRequests(reqs);
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

  const getMemberActions = (member: OrgMember) => {
    const isMe = String(me?.id) === member.user_id;
    if (isMe || member.role === 'creator') return { promote: false, demote: false, kick: false };
    if (isCreator) return { promote: member.role === 'member', demote: member.role === 'admin', kick: true };
    if (isAdmin) return { promote: member.role === 'member', demote: false, kick: member.role === 'member' };
    return { promote: false, demote: false, kick: false };
  };

  const handlePromote = (member: OrgMember) => {
    const name = member.display_name || member.username;
    Alert.alert('Promote to Admin', `Make ${name} an admin?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Promote',
        onPress: async () => {
          setActingOn(member.user_id);
          try {
            await promoteMember(orgId, member.user_id);
            setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, role: 'admin' } : m));
          } catch {
            Alert.alert('Error', 'Failed to promote member.');
          } finally {
            setActingOn(null);
          }
        },
      },
    ]);
  };

  const handleDemote = (member: OrgMember) => {
    const name = member.display_name || member.username;
    Alert.alert('Demote to Member', `Remove admin role from ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Demote',
        style: 'destructive',
        onPress: async () => {
          setActingOn(member.user_id);
          try {
            await demoteMember(orgId, member.user_id);
            setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, role: 'member' } : m));
          } catch {
            Alert.alert('Error', 'Failed to demote member.');
          } finally {
            setActingOn(null);
          }
        },
      },
    ]);
  };

  const handleKick = (member: OrgMember) => {
    const name = member.display_name || member.username;
    Alert.alert('Remove Member', `Remove ${name} from the organization?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setActingOn(member.user_id);
          try {
            await kickMember(orgId, member.user_id);
            setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
          } catch {
            Alert.alert('Error', 'Failed to remove member.');
          } finally {
            setActingOn(null);
          }
        },
      },
    ]);
  };


  // ── Edit org ─────────────────────────────────────────────────────────────

  const openEdit = () => {
    if (!org) return;
    setEditName(org.name);
    setEditDesc(org.description);
    setEditPrivacy(org.privacy);
    setEditAvatarUri(null);
    setSettingsTab('info');
    setEditVisible(true);
  };

  const handlePickEditAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
    Alert.alert(
      'Delete Organization',
      `Permanently delete "${org?.name}"? This cannot be undone and all members will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteOrg(orgId);
              setEditVisible(false);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete organization.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
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

  // ── Request to join ──────────────────────────────────────────────────────

  const handleRequestJoin = async () => {
    setRequesting(true);
    try {
      await requestJoinOrg(orgId);
      setRequested(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to send join request.');
    } finally {
      setRequesting(false);
    }
  };

  // ── Tab content ──────────────────────────────────────────────────────────

  const renderInfoTab = () => (
    <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 120 }}>
      {/* Org info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoLeft}>
          <View style={styles.infoRow}>
            <Feather name={org?.privacy === 'private' ? 'lock' : 'globe'} size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>
              {org?.privacy === 'private' ? 'Private organization' : 'Public organization'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="users" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>{org?.member_count ?? 0} members</Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="user" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>Created by @{org?.created_by_username}</Text>
          </View>
        </View>
        {isMember && org?.invite_code && (
          <View style={styles.inviteCodeCard}>
            <Text style={styles.inviteCodeLabel}>INVITE CODE</Text>
            <Text style={styles.inviteCodeText}>{org.invite_code}</Text>
            <Pressable
              style={[styles.inviteCodeCopyBtn, codeCopied && styles.inviteCodeCopyBtnSuccess]}
              onPress={handleCopyCode}
            >
              <Feather
                name={codeCopied ? 'check' : 'copy'}
                size={13}
                color={codeCopied ? '#22c55e' : colors.primary}
              />
              <Text style={[styles.inviteCodeCopyText, codeCopied && styles.inviteCodeCopyTextSuccess]}>
                {codeCopied ? 'Copied!' : 'Copy'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Members */}
      <Text style={styles.sectionLabel}>MEMBERS</Text>
      {members.map((m) => {
        const actions = getMemberActions(m);
        return (
          <View key={m.user_id} style={styles.memberRow}>
            <Pressable onPress={() => navigation.navigate('Profile', { username: m.username })}>
              <Avatar uri={m.avatar_url} name={m.display_name} size={40} />
            </Pressable>
            <Pressable
              style={styles.memberInfo}
              onPress={() => navigation.navigate('Profile', { username: m.username })}
            >
              <Text style={styles.memberName}>{m.display_name}</Text>
              <Text style={styles.memberUsername}>@{m.username}</Text>
            </Pressable>
            <View style={styles.memberActions}>
              {m.role === 'creator' ? (
                <View style={styles.creatorBadge}>
                  <Text style={styles.creatorBadgeText}>CREATOR</Text>
                </View>
              ) : m.role === 'admin' ? (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>ADMIN</Text>
                </View>
              ) : (
                <Text style={styles.memberRoleText}>MEMBER</Text>
              )}
              {actingOn === m.user_id ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />
              ) : (
                <>
                  {actions.promote && (
                    <Pressable style={[styles.actionBtn, styles.promoteBtn]} onPress={() => handlePromote(m)}>
                      <Text style={[styles.actionBtnText, styles.promoteBtnText]}>Promote</Text>
                    </Pressable>
                  )}
                  {actions.demote && (
                    <Pressable style={[styles.actionBtn, styles.demoteBtn]} onPress={() => handleDemote(m)}>
                      <Text style={[styles.actionBtnText, styles.demoteBtnText]}>Demote</Text>
                    </Pressable>
                  )}
                  {actions.kick && (
                    <Pressable style={[styles.actionBtn, styles.kickBtn]} onPress={() => handleKick(m)}>
                      <Text style={[styles.actionBtnText, styles.kickBtnText]}>Remove</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </View>
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
            <Pressable onPress={() => navigation.navigate('Profile', { username: req.username })}>
              <Avatar uri={req.avatar_url} name={req.display_name} size={40} />
            </Pressable>
            <Pressable
              style={styles.memberInfo}
              onPress={() => navigation.navigate('Profile', { username: req.username })}
            >
              <Text style={styles.memberName}>{req.display_name}</Text>
              <Text style={styles.memberUsername}>@{req.username}</Text>
            </Pressable>
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

  const tabs: ProfileTab[] = isAdmin ? ['Info', 'Admin'] : ['Info'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{org?.name ?? 'Organization'}</Text>
        {isAdmin ? (
          <Pressable style={styles.backBtn} onPress={openEdit}>
            <Feather name="settings" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      {/* Org hero */}
      <View style={styles.hero}>
        <Avatar uri={org?.avatar_url ?? null} name={org?.name ?? ''} size={72} />
        <Text style={styles.orgName}>{org?.name}</Text>
        {!!org?.description && (
          <Text style={styles.orgDescription}>{org.description}</Text>
        )}
        {!isMember && org?.privacy === 'private' && (
          requesting ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 10 }} />
          ) : requested ? (
            <View style={styles.heroPendingBadge}>
              <Text style={styles.heroPendingText}>Requested</Text>
            </View>
          ) : (
            <Pressable style={styles.heroRequestBtn} onPress={handleRequestJoin}>
              <Text style={styles.heroRequestBtnText}>Request</Text>
            </Pressable>
          )
        )}
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

      {/* Organization Settings Modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <Pressable style={styles.settingsOverlay} onPress={() => setEditVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.settingsKAV}
          >
            <Pressable style={styles.settingsCard} onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.settingsHeaderRow}>
                <Text style={styles.settingsTitle}>Organization Settings</Text>
                <Pressable style={styles.settingsCloseBtn} onPress={() => setEditVisible(false)}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Tabs */}
              <View style={styles.settingsTabRow}>
                <Pressable style={styles.settingsTabItem} onPress={() => setSettingsTab('info')}>
                  <Text style={[styles.settingsTabText, settingsTab === 'info' && styles.settingsTabTextActive]}>
                    Org Info
                  </Text>
                  {settingsTab === 'info' && <View style={styles.settingsTabUnderline} />}
                </Pressable>
                {isCreator && (
                  <Pressable style={styles.settingsTabItem} onPress={() => setSettingsTab('danger')}>
                    <Text style={[styles.settingsTabText, settingsTab === 'danger' && styles.settingsTabTextDanger]}>
                      Danger Zone
                    </Text>
                    {settingsTab === 'danger' && (
                      <View style={[styles.settingsTabUnderline, styles.settingsTabUnderlineDanger]} />
                    )}
                  </Pressable>
                )}
              </View>

              {/* Tab content */}
              {settingsTab === 'info' ? (
                <View style={styles.settingsInfoContent}>
                  {/* Avatar row */}
                  <View style={styles.settingsAvatarRow}>
                    <Pressable onPress={handlePickEditAvatar}>
                      <View style={styles.settingsAvatarCircle}>
                        {editAvatarUri ? (
                          <Image source={{ uri: editAvatarUri }} style={styles.settingsAvatarPreview} />
                        ) : org?.avatar_url ? (
                          <Image source={{ uri: org.avatar_url }} style={styles.settingsAvatarPreview} />
                        ) : (
                          <Text style={styles.settingsAvatarInitial}>
                            {org?.name[0]?.toUpperCase() ?? '?'}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                    <Pressable style={styles.settingsChangePhotoBtn} onPress={handlePickEditAvatar}>
                      <Text style={styles.settingsChangePhotoText}>Change Photo</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.settingsFieldLabel}>Organization Name</Text>
                  <TextInput
                    style={styles.settingsFieldInput}
                    value={editName}
                    onChangeText={setEditName}
                    maxLength={100}
                    placeholderTextColor={colors.textMuted}
                  />

                  <Text style={styles.settingsFieldLabel}>Description</Text>
                  <TextInput
                    style={[styles.settingsFieldInput, styles.settingsFieldInputMultiline]}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    maxLength={500}
                    multiline
                    numberOfLines={2}
                    placeholderTextColor={colors.textMuted}
                  />

                  <Text style={styles.settingsFieldLabel}>Privacy</Text>
                  <Pressable
                    style={styles.settingsPrivacyRow}
                    onPress={() => setEditPrivacy(editPrivacy === 'public' ? 'private' : 'public')}
                  >
                    <Text style={styles.settingsPrivacyText}>
                      {editPrivacy === 'public' ? 'Public' : 'Private'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.textMuted} />
                  </Pressable>

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
              ) : (
                <View style={styles.settingsDangerContent}>
                  <View style={styles.settingsDangerCard}>
                    <Feather name="alert-triangle" size={22} color="#ef4444" style={{ marginBottom: spacing.sm }} />
                    <Text style={styles.settingsDangerTitle}>Delete Organization</Text>
                    <Text style={styles.settingsDangerDesc}>
                      Permanently delete this organization and all its announcements. This action cannot be undone and all members will be removed.
                    </Text>
                    <Pressable
                      style={[styles.settingsDeleteBtn, deleting && styles.settingsDeleteBtnDisabled]}
                      onPress={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="trash-2" size={15} color="#fff" />
                          <Text style={styles.settingsDeleteBtnText}>Delete Organization</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
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
  orgDescription: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
  myRoleBadge: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  myRoleBadgeText: { fontSize: typography.size.xs, color: colors.textMuted, fontWeight: '600' },

  heroRequestBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  heroRequestBtnText: { fontSize: typography.size.sm, color: '#fff', fontWeight: '700' },
  heroPendingBadge: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  heroPendingText: { fontSize: typography.size.sm, color: colors.textMuted, fontWeight: '600' },

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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  infoLeft: { flex: 1, gap: spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: typography.size.sm, color: colors.textSecondary },
  description: { fontSize: typography.size.sm, color: colors.textPrimary, lineHeight: 20 },
  inviteCodeCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.08)',
    minWidth: 96,
  },

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

  // hero role badge (kept for the hero section)
  roleBadgeCreator: { backgroundColor: 'rgba(234,179,8,0.15)' },
  roleBadgeAdmin: { backgroundColor: 'rgba(79,195,224,0.15)' },
  roleBadgeTextActive: { color: colors.textPrimary },

  // member list role badges
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontWeight: '700',
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
    fontWeight: '700',
    color: '#8B5CF6',
    letterSpacing: 0.3,
  },
  memberRoleText: {
    fontSize: typography.size.xs,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  actionBtn: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
  },
  actionBtnText: { fontSize: typography.size.xs, fontWeight: '600' },
  promoteBtn: { borderColor: '#22c55e' },
  promoteBtnText: { color: '#22c55e' },
  demoteBtn: { borderColor: '#f59e0b' },
  demoteBtnText: { color: '#f59e0b' },
  kickBtn: { borderColor: '#ef4444' },
  kickBtnText: { color: '#ef4444' },

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

  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.card,
  },
  inviteCodeLabel: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  inviteCodeText: {
    fontSize: typography.size.md,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: colors.textPrimary,
    letterSpacing: 2,
    textAlign: 'center',
  },
  inviteCodeCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(79,195,224,0.1)',
  },
  inviteCodeCopyBtnSuccess: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  inviteCodeCopyText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  inviteCodeCopyTextSuccess: {
    color: '#22c55e',
  },

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

  // ── Join code modal (bottom sheet) ────────────────────────────────────────
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
  modalInput: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    borderRadius: 10,
    padding: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.size.sm },

  // ── Organization Settings Modal (centered) ────────────────────────────────
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  settingsKAV: { width: '100%', alignItems: 'center' },
  settingsCard: {
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  settingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  settingsTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.textPrimary },
  settingsCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
    paddingHorizontal: spacing.lg,
  },
  settingsTabItem: {
    marginRight: spacing.xl,
    paddingBottom: spacing.xs,
    position: 'relative',
  },
  settingsTabText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textMuted },
  settingsTabTextActive: { color: colors.primary, fontWeight: '600' },
  settingsTabTextDanger: { color: '#ef4444', fontWeight: '600' },
  settingsTabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  settingsTabUnderlineDanger: { backgroundColor: '#ef4444' },

  // Org Info tab
  settingsInfoContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  settingsAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settingsAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  settingsAvatarPreview: { width: 48, height: 48 },
  settingsAvatarInitial: { fontSize: typography.size.lg, fontWeight: '700', color: '#fff' },
  settingsChangePhotoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.base,
  },
  settingsChangePhotoText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textPrimary },
  settingsFieldLabel: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  settingsFieldInput: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    backgroundColor: colors.background.base,
  },
  settingsFieldInputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 7,
  },
  settingsPrivacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    backgroundColor: colors.background.base,
  },
  settingsPrivacyText: { fontSize: typography.size.sm, color: colors.textPrimary },

  // Danger Zone tab
  settingsDangerContent: { padding: spacing.md, paddingBottom: spacing.lg },
  settingsDangerCard: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
  },
  settingsDangerTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: spacing.xs,
  },
  settingsDangerDesc: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  settingsDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  settingsDeleteBtnDisabled: { opacity: 0.6 },
  settingsDeleteBtnText: { fontSize: typography.size.base, fontWeight: '700', color: '#fff' },
});
