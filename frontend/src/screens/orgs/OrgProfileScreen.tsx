import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
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
  addOrgMember,
  updateOrg,
  updateOrgAvatar,
  deleteOrg,
  leaveOrg,
  joinOrg,
  joinOrgViaCode,
  requestJoinOrg,
  fetchOrgMemberActivity,
  fetchOrgMemberLogs,
  fetchOrgMemberStatus,
  OrgDetail,
  OrgMember,
  OrgJoinRequest,
  MemberActivityItem,
  OrgLogItem,
  OrgLogType,
  MemberStatusItem,
  TodayCheckin,
  TodayWorkout,
} from '../../api/organizations';
import { fetchFriends } from '../../api/accounts';
import { UserBrief } from '../../types/user';
import { wsManager } from '../../services/websocket';
import RangeCalendar from '../../components/common/RangeCalendar';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';
import { RootStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'OrgProfile'>;
  route: RouteProp<RootStackParamList, 'OrgProfile'>;
};

type ProfileTab = 'Info' | 'Requests' | 'Activity';
type ActivitySubTab = 'Logs' | 'Users' | 'Stats';
type SettingsTab = 'info' | 'danger';

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShortDate(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtRelativeTime(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(isoStr);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function OrgProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { orgId, initialTab } = route.params;

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [requests, setRequests] = useState<OrgJoinRequest[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab ?? 'Info');
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

  // ── Activity tab ─────────────────────────────────────────────────────────
  const [activitySubTab, setActivitySubTab] = useState<ActivitySubTab>('Logs');

  // Stats sub-tab
  const [activityData, setActivityData] = useState<MemberActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityQuery, setActivityQuery] = useState('');
  const [activitySort, setActivitySort] = useState<'desc' | 'asc'>('desc');
  const [actStart, setActStart] = useState<Date | null>(null);
  const [actEnd, setActEnd] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(null);

  // Logs sub-tab
  const [logs, setLogs] = useState<OrgLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsNextCursor, setLogsNextCursor] = useState<string | null>(null);
  const [logsFetchingMore, setLogsFetchingMore] = useState(false);
  // Log filters
  const [logTypeFilter, setLogTypeFilter] = useState<OrgLogType>('all');
  const [logStartDate, setLogStartDate] = useState<Date | null>(null);
  const [logEndDate, setLogEndDate] = useState<Date | null>(null);
  const [logCalOpen, setLogCalOpen] = useState(false);
  const [logPendingStart, setLogPendingStart] = useState<Date | null>(null);
  const [logPendingEnd, setLogPendingEnd] = useState<Date | null>(null);

  // Users sub-tab
  const [memberStatus, setMemberStatus] = useState<MemberStatusItem[]>([]);
  const [memberStatusLoading, setMemberStatusLoading] = useState(false);
  // Detail modal for Users tab
  const [detailModal, setDetailModal] = useState<
    { kind: 'checkin'; data: TodayCheckin } | { kind: 'workout'; data: TodayWorkout } | null
  >(null);

  // ── Join (public) / Request (private) ───────────────────────────────────
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [joining, setJoining] = useState(false);

  // ── Join code modal ──────────────────────────────────────────────────────
  const [joinCodeVisible, setJoinCodeVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);

  // ── Add people modal ─────────────────────────────────────────────────────
  const [addPeopleVisible, setAddPeopleVisible] = useState(false);
  const [friends, setFriends] = useState<UserBrief[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [addedUsers, setAddedUsers] = useState<Set<string>>(new Set());

  const openAddPeople = async () => {
    setAddPeopleVisible(true);
    setFriendsLoading(true);
    try {
      const data = await fetchFriends();
      const memberIds = new Set(members.map((m) => m.user_id));
      setFriends(data.filter((f) => !memberIds.has(f.id)));
    } catch {
      Alert.alert('Error', 'Could not load friends.');
    } finally {
      setFriendsLoading(false);
    }
  };

  const handleAddFriend = async (friend: UserBrief) => {
    setAddingUser(friend.id);
    try {
      await addOrgMember(orgId, friend.id);
      setAddedUsers((prev) => new Set(prev).add(friend.id));
      setMembers((prev) => [...prev, {
        user_id: friend.id,
        username: friend.username,
        display_name: friend.display_name,
        avatar_url: friend.avatar_url,
        role: 'member',
        joined_at: new Date().toISOString(),
      }]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Could not add member.');
    } finally {
      setAddingUser(null);
    }
  };

  const isAdmin = org?.user_role === 'creator' || org?.user_role === 'admin';
  const isCreator = org?.user_role === 'creator';
  const isMember = !!org?.user_role;

  // ── Load data ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await fetchOrgDetail(orgId);
      setOrg(detail);
      setRequested(detail.pending_request);
      // Members list may be restricted for private orgs — fetch separately so
      // a 403 here doesn't wipe the whole profile view.
      try {
        const mems = await listOrgMembers(orgId);
        setMembers(mems);
      } catch {
        setMembers([]);
      }
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

  // Sync pending_requests_count live via WS (new requests in, or accept/deny by any admin)
  useEffect(() => {
    const handler = ({ org_id, pending_requests_count }: { org_id: string; org_name: string; pending_requests_count: number }) => {
      if (org_id !== orgId) return;
      setOrg(prev => prev ? { ...prev, pending_requests_count } : prev);
      if (isAdmin) loadAdminData();
    };
    wsManager.on('org_join_request', handler);
    return () => wsManager.off('org_join_request', handler);
  }, [orgId, isAdmin, loadAdminData]);

  const loadActivityData = useCallback(async (start: Date | null, end: Date | null) => {
    setActivityLoading(true);
    try {
      const data = await fetchOrgMemberActivity(
        orgId,
        start ? toDateStr(start) : null,
        end   ? toDateStr(end)   : null,
      );
      setActivityData(data);
    } catch {
      Alert.alert('Error', 'Could not load activity.');
    } finally {
      setActivityLoading(false);
    }
  }, [orgId]);

  const loadLogs = useCallback(async (
    cursor?: string,
    type: OrgLogType = 'all',
    start: Date | null = null,
    end: Date | null = null,
  ) => {
    if (!cursor) setLogsLoading(true);
    else setLogsFetchingMore(true);
    try {
      const res = await fetchOrgMemberLogs(
        orgId, cursor,
        start ? toDateStr(start) : undefined,
        end ? toDateStr(end) : undefined,
        type,
      );
      setLogs(prev => cursor ? [...prev, ...res.items] : res.items);
      setLogsNextCursor(res.next_cursor);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
      setLogsFetchingMore(false);
    }
  }, [orgId]);

  const loadMemberStatus = useCallback(async () => {
    setMemberStatusLoading(true);
    try {
      const data = await fetchOrgMemberStatus(orgId);
      setMemberStatus(data);
    } catch {
      // ignore
    } finally {
      setMemberStatusLoading(false);
    }
  }, [orgId]);

  // Load admin data when switching to Admin/Activity tab
  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    if (tab === 'Requests' && isAdmin) loadAdminData();
    if (tab === 'Activity' && isMember) {
      setActivitySubTab('Logs');
      loadLogs(undefined, logTypeFilter, logStartDate, logEndDate);
    }
  };

  const handleActivitySubTabChange = (sub: ActivitySubTab) => {
    setActivitySubTab(sub);
    if (sub === 'Logs' && logs.length === 0) loadLogs(undefined, logTypeFilter, logStartDate, logEndDate);
    if (sub === 'Users' && memberStatus.length === 0) loadMemberStatus();
    if (sub === 'Stats' && activityData.length === 0) loadActivityData(actStart, actEnd);
  };

  // ── Join requests ────────────────────────────────────────────────────────

  const decrementPendingCount = () => {
    setOrg(prev => prev ? { ...prev, pending_requests_count: Math.max(0, (prev.pending_requests_count ?? 1) - 1) } : prev);
  };

  const handleAccept = async (requestId: string) => {
    setActingOn(requestId);
    try {
      await acceptJoinRequest(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      decrementPendingCount();
      load(); // refresh member list
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
      decrementPendingCount();
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

  // ── Join public org ──────────────────────────────────────────────────────

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinOrg(orgId);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to join organization.');
    } finally {
      setJoining(false);
    }
  };

  // ── Request to join private org ──────────────────────────────────────────

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
          {isAdmin && (
            <Pressable style={({ pressed }) => [styles.addPeopleBtn, pressed && { opacity: 0.7 }]} onPress={openAddPeople}>
              <Feather name="user-plus" size={14} color={colors.primary} />
              <Text style={styles.addPeopleBtnText}>Add People</Text>
            </Pressable>
          )}
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


  // ── Activity tab ─────────────────────────────────────────────────────────

  const renderLogsTab = () => {
    const logDateLabel =
      logStartDate && logEndDate ? `${fmtShortDate(logStartDate)} – ${fmtShortDate(logEndDate)}`
      : logStartDate ? `From ${fmtShortDate(logStartDate)}`
      : logEndDate ? `Until ${fmtShortDate(logEndDate)}`
      : 'All time';

    const typeOptions: { key: OrgLogType; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'checkin', label: 'Check-ins' },
      { key: 'workout', label: 'Workouts' },
      { key: 'post', label: 'Posts' },
    ];

    return (
      <View style={{ flex: 1 }}>
        {/* Type filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.logFilterRow}>
          {typeOptions.map(opt => (
            <Pressable
              key={opt.key}
              style={[styles.logFilterChip, logTypeFilter === opt.key && styles.logFilterChipActive]}
              onPress={() => {
                setLogTypeFilter(opt.key);
                setLogs([]);
                setLogsNextCursor(null);
                loadLogs(undefined, opt.key, logStartDate, logEndDate);
              }}
            >
              <Text style={[styles.logFilterChipText, logTypeFilter === opt.key && styles.logFilterChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
          {/* Date chip */}
          <Pressable
            style={[styles.logFilterChip, (logStartDate || logEndDate) && styles.logFilterChipActive]}
            onPress={() => { setLogPendingStart(logStartDate); setLogPendingEnd(logEndDate); setLogCalOpen(true); }}
          >
            <Feather name="calendar" size={12} color={(logStartDate || logEndDate) ? '#fff' : colors.textSecondary} />
            <Text style={[styles.logFilterChipText, (logStartDate || logEndDate) && styles.logFilterChipTextActive]}>
              {logDateLabel}
            </Text>
          </Pressable>
        </ScrollView>

        {logsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={logs}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: 120 }}
            ListEmptyComponent={<Text style={styles.actEmpty}>No activity yet.</Text>}
            onEndReached={() => {
              if (logsNextCursor && !logsFetchingMore) loadLogs(logsNextCursor, logTypeFilter, logStartDate, logEndDate);
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={logsFetchingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}
            renderItem={({ item }) => (
              <Pressable
                style={styles.logCard}
                onPress={() => navigation.navigate('Profile', { username: item.username })}
              >
                <Avatar uri={item.avatar_url} name={item.display_name} size={36} />
                <View style={styles.logBody}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logName}>{item.display_name}</Text>
                    <Text style={styles.logTime}>{fmtRelativeTime(item.created_at)}</Text>
                  </View>
                  {item.type === 'checkin' && (
                    <>
                      <View style={styles.logBadge}>
                        <Feather name="check-circle" size={11} color="#10B981" />
                        <Text style={styles.logBadgeText}>Checked in</Text>
                        {!!item.workout_type && (
                          <Text style={styles.logBadgeSub}> · {item.workout_type.replace(/_/g, ' ')}</Text>
                        )}
                      </View>
                      {!!item.description && <Text style={styles.logDesc} numberOfLines={2}>{item.description}</Text>}
                      {!!item.location_name && (
                        <View style={styles.logLocation}>
                          <Feather name="map-pin" size={11} color={colors.textMuted} />
                          <Text style={styles.logLocationText}>{item.location_name}</Text>
                        </View>
                      )}
                    </>
                  )}
                  {item.type === 'workout' && (
                    <>
                      <View style={styles.logBadge}>
                        <Feather name="activity" size={11} color={colors.primary} />
                        <Text style={[styles.logBadgeText, { color: colors.primary }]}>Logged workout</Text>
                      </View>
                      <Text style={styles.logDesc}>
                        {item.workout_name}{item.duration_minutes != null ? ` · ${item.duration_minutes}min` : ''}
                      </Text>
                    </>
                  )}
                  {item.type === 'post' && (
                    <>
                      <View style={styles.logBadge}>
                        <Feather name="file-text" size={11} color={colors.textSecondary} />
                        <Text style={[styles.logBadgeText, { color: colors.textSecondary }]}>Posted</Text>
                      </View>
                      {!!item.description && <Text style={styles.logDesc} numberOfLines={2}>{item.description}</Text>}
                    </>
                  )}
                </View>
              </Pressable>
            )}
          />
        )}

        {/* Log date filter calendar modal */}
        <Modal visible={logCalOpen} transparent animationType="fade" onRequestClose={() => setLogCalOpen(false)}>
          <Pressable style={styles.calOverlay} onPress={() => setLogCalOpen(false)}>
            <Pressable style={styles.calCard} onPress={e => e.stopPropagation()}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Filter by Date</Text>
                <Pressable onPress={() => setLogCalOpen(false)}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
              <RangeCalendar
                startDate={logPendingStart}
                endDate={logPendingEnd}
                onChange={(s, e) => { setLogPendingStart(s); setLogPendingEnd(e); }}
              />
              <View style={styles.calActions}>
                <Pressable
                  style={[styles.calActionBtn, styles.calClearBtn]}
                  onPress={() => {
                    setLogStartDate(null); setLogEndDate(null);
                    setLogPendingStart(null); setLogPendingEnd(null);
                    setLogCalOpen(false);
                    setLogs([]); setLogsNextCursor(null);
                    loadLogs(undefined, logTypeFilter, null, null);
                  }}
                >
                  <Text style={styles.calClearText}>Clear</Text>
                </Pressable>
                <Pressable style={[styles.calActionBtn, styles.calCancelBtn]} onPress={() => setLogCalOpen(false)}>
                  <Text style={styles.calCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.calActionBtn, styles.calApplyBtn]}
                  onPress={() => {
                    setLogStartDate(logPendingStart); setLogEndDate(logPendingEnd);
                    setLogCalOpen(false);
                    setLogs([]); setLogsNextCursor(null);
                    loadLogs(undefined, logTypeFilter, logPendingStart, logPendingEnd);
                  }}
                >
                  <Text style={styles.calApplyText}>Apply</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  };

  const renderUsersTab = () => {
    if (memberStatusLoading) {
      return <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />;
    }
    return (
      <>
        <FlatList
          data={memberStatus}
          keyExtractor={item => item.user_id}
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: 120 }}
          ListEmptyComponent={<Text style={styles.actEmpty}>No members found.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.userRow}
              onPress={() => navigation.navigate('Profile', { username: item.username })}
            >
              <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
              <View style={styles.actInfo}>
                <Text style={styles.actName}>{item.display_name}</Text>
                <Text style={styles.actUsername}>@{item.username}</Text>
              </View>
              <View style={styles.userChecks}>
                {/* Check-in checkmark — tappable when done */}
                <Pressable
                  style={styles.userCheckRow}
                  disabled={!item.checked_in_today}
                  onPress={() => item.checkin_today && setDetailModal({ kind: 'checkin', data: item.checkin_today })}
                >
                  <Feather
                    name={item.checked_in_today ? 'check-circle' : 'circle'}
                    size={15}
                    color={item.checked_in_today ? '#10B981' : colors.borderColor}
                  />
                  <Text style={[styles.userCheckLabel, item.checked_in_today && styles.userCheckLabelActive]}>
                    Check-in
                  </Text>
                </Pressable>
                {/* Workout checkmark — tappable when done */}
                <Pressable
                  style={styles.userCheckRow}
                  disabled={!item.logged_workout_today}
                  onPress={() => item.workout_today && setDetailModal({ kind: 'workout', data: item.workout_today })}
                >
                  <Feather
                    name={item.logged_workout_today ? 'check-circle' : 'circle'}
                    size={15}
                    color={item.logged_workout_today ? '#10B981' : colors.borderColor}
                  />
                  <Text style={[styles.userCheckLabel, item.logged_workout_today && styles.userCheckLabelActive]}>
                    Workout
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />

        {/* Detail modal */}
        <Modal
          visible={detailModal !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setDetailModal(null)}
        >
          <Pressable style={styles.calOverlay} onPress={() => setDetailModal(null)}>
            <Pressable style={styles.detailCard} onPress={e => e.stopPropagation()}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle}>
                  {detailModal?.kind === 'checkin' ? 'Today\'s Check-in' : 'Today\'s Workout'}
                </Text>
                <Pressable onPress={() => setDetailModal(null)}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>

              {detailModal?.kind === 'checkin' && (
                <View style={styles.detailBody}>
                  {!!detailModal.data.photo_url && (
                    <Image source={{ uri: getImageUrl(detailModal.data.photo_url, 'detail') ?? detailModal.data.photo_url }} style={styles.detailPhoto} />
                  )}
                  {!!detailModal.data.workout_type && (
                    <View style={styles.detailPill}>
                      <Text style={styles.detailPillText}>
                        {detailModal.data.workout_type.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  )}
                  {!!detailModal.data.location_name && (
                    <View style={styles.detailRow}>
                      <Feather name="map-pin" size={13} color={colors.primary} />
                      <Text style={styles.detailMeta}>{detailModal.data.location_name}</Text>
                    </View>
                  )}
                  {!!detailModal.data.description && (
                    <Text style={styles.detailDesc}>{detailModal.data.description}</Text>
                  )}
                  <Text style={styles.detailTime}>{fmtRelativeTime(detailModal.data.created_at)}</Text>
                </View>
              )}

              {detailModal?.kind === 'workout' && (
                <View style={styles.detailBody}>
                  <Text style={styles.detailWorkoutName}>{detailModal.data.name}</Text>
                  {detailModal.data.duration_minutes != null && (
                    <View style={styles.detailRow}>
                      <Feather name="clock" size={13} color={colors.textSecondary} />
                      <Text style={styles.detailMeta}>{detailModal.data.duration_minutes} min</Text>
                    </View>
                  )}
                  <Text style={styles.detailTime}>{fmtRelativeTime(detailModal.data.created_at)}</Text>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  };

  const renderStatsTab = () => {
    const q = activityQuery.toLowerCase();
    const displayed = activityData
      .filter(m =>
        m.display_name.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q)
      )
      .sort((a, b) =>
        activitySort === 'desc'
          ? b.workout_count - a.workout_count
          : a.workout_count - b.workout_count
      );

    const dateChipLabel =
      actStart && actEnd
        ? `${fmtShortDate(actStart)} – ${fmtShortDate(actEnd)}`
        : actStart
        ? `From ${fmtShortDate(actStart)}`
        : 'All time';

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.actSearchRow}>
          <Feather name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.actSearchInput}
            placeholder="Search members..."
            placeholderTextColor={colors.textMuted}
            value={activityQuery}
            onChangeText={setActivityQuery}
            autoCorrect={false}
          />
        </View>
        <View style={styles.actChipRow}>
          <Pressable
            style={styles.actChip}
            onPress={() => { setPendingStart(actStart); setPendingEnd(actEnd); setCalendarOpen(true); }}
          >
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={styles.actChipText}>{dateChipLabel}</Text>
            <Feather name="chevron-down" size={13} color={colors.primary} />
          </Pressable>
          <Pressable
            style={styles.actChip}
            onPress={() => setActivitySort(s => s === 'desc' ? 'asc' : 'desc')}
          >
            <Feather name="arrow-up" size={13} color={colors.primary} />
            <Text style={styles.actChipText}>{activitySort === 'desc' ? 'Highest' : 'Lowest'}</Text>
          </Pressable>
        </View>
        {activityLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={item => item.user_id}
            contentContainerStyle={{ paddingHorizontal: spacing.base, paddingBottom: 120 }}
            ListEmptyComponent={<Text style={styles.actEmpty}>No members found.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.actRow}
                onPress={() => navigation.navigate('Profile', { username: item.username })}
              >
                <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
                <View style={styles.actInfo}>
                  <Text style={styles.actName}>{item.display_name}</Text>
                  <Text style={styles.actUsername}>@{item.username}</Text>
                </View>
                <View style={styles.actRight}>
                  <Text style={styles.actStreakText}>🔥 {item.current_streak}d</Text>
                  <Text style={styles.actCount}>Workouts: {item.workout_count}</Text>
                </View>
              </Pressable>
            )}
          />
        )}
        {/* Calendar modal */}
        <Modal
          visible={calendarOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCalendarOpen(false)}
        >
          <Pressable style={styles.calOverlay} onPress={() => setCalendarOpen(false)}>
            <Pressable style={styles.calCard} onPress={e => e.stopPropagation()}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Select Date Range</Text>
                <Pressable onPress={() => setCalendarOpen(false)}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
              <RangeCalendar
                startDate={pendingStart}
                endDate={pendingEnd}
                onChange={(s, e) => { setPendingStart(s); setPendingEnd(e); }}
              />
              <View style={styles.calActions}>
                <Pressable
                  style={[styles.calActionBtn, styles.calClearBtn]}
                  onPress={() => {
                    setActStart(null); setActEnd(null);
                    setPendingStart(null); setPendingEnd(null);
                    setCalendarOpen(false);
                    loadActivityData(null, null);
                  }}
                >
                  <Text style={styles.calClearText}>Clear</Text>
                </Pressable>
                <Pressable
                  style={[styles.calActionBtn, styles.calCancelBtn]}
                  onPress={() => setCalendarOpen(false)}
                >
                  <Text style={styles.calCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.calActionBtn, styles.calApplyBtn]}
                  onPress={() => {
                    setActStart(pendingStart); setActEnd(pendingEnd);
                    setCalendarOpen(false);
                    loadActivityData(pendingStart, pendingEnd);
                  }}
                >
                  <Text style={styles.calApplyText}>Apply</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  };

  const renderActivityTab = () => {
    const subTabs: ActivitySubTab[] = ['Logs', 'Users', 'Stats'];
    return (
      <View style={{ flex: 1 }}>
        {/* Sub-tab bar */}
        <View style={styles.actSubTabBar}>
          {subTabs.map(sub => (
            <Pressable
              key={sub}
              style={[styles.actSubTab, activitySubTab === sub && styles.actSubTabActive]}
              onPress={() => handleActivitySubTabChange(sub)}
            >
              <Text style={[styles.actSubTabText, activitySubTab === sub && styles.actSubTabTextActive]}>
                {sub}
              </Text>
            </Pressable>
          ))}
        </View>

        {activitySubTab === 'Logs' && renderLogsTab()}
        {activitySubTab === 'Users' && renderUsersTab()}
        {activitySubTab === 'Stats' && renderStatsTab()}
      </View>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background.base, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const tabs: ProfileTab[] = isMember ? (isAdmin ? ['Info', 'Requests', 'Activity'] : ['Info', 'Activity']) : ['Info'];

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
        {!isMember && org?.privacy === 'public' && (
          joining ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 10 }} />
          ) : (
            <Pressable style={styles.heroJoinBtn} onPress={handleJoin}>
              <Text style={styles.heroJoinBtnText}>Join</Text>
            </Pressable>
          )
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
              <Text style={styles.heroRequestBtnText}>Request to Join</Text>
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
          {tabs.map((tab) => {
            const pendingCount = org?.pending_requests_count ?? 0;
            const showBadge = tab === 'Requests' && pendingCount > 0;
            return (
              <Pressable
                key={tab}
                style={styles.tab}
                onPress={() => handleTabChange(tab)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {tab}
                  </Text>
                  {showBadge && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{pendingCount}</Text>
                    </View>
                  )}
                </View>
                {activeTab === tab && <View style={styles.tabIndicator} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Tab content */}
      {activeTab === 'Info' && renderInfoTab()}
      {activeTab === 'Requests' && renderAdminTab()}
      {activeTab === 'Activity' && renderActivityTab()}

      {/* Add People Modal */}
      <Modal visible={addPeopleVisible} transparent animationType="slide" onRequestClose={() => setAddPeopleVisible(false)}>
        <View style={styles.settingsOverlay}>
          <View style={[styles.settingsCard, { padding: spacing.base, maxHeight: '75%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={styles.settingsTitle}>Add People</Text>
              <Pressable onPress={() => setAddPeopleVisible(false)} hitSlop={12}>
                <Feather name="x" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
            {friendsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : friends.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: spacing.xl }}>
                No friends to add — they're either already members or you have no mutual follows.
              </Text>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(f) => f.id}
                renderItem={({ item: friend }) => {
                  const added = addedUsers.has(friend.id);
                  const loading = addingUser === friend.id;
                  return (
                    <View style={styles.memberRow}>
                      <Avatar uri={friend.avatar_url} name={friend.display_name} size={40} />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{friend.display_name}</Text>
                        <Text style={styles.memberUsername}>@{friend.username}</Text>
                      </View>
                      <Pressable
                        style={[styles.addFriendBtn, added && styles.addFriendBtnAdded]}
                        onPress={() => !added && !loading && handleAddFriend(friend)}
                        disabled={added || loading}
                      >
                        {loading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={[styles.addFriendBtnText, added && styles.addFriendBtnTextAdded]}>
                            {added ? 'Added' : 'Add'}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

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
                          <Image source={{ uri: getImageUrl(org.avatar_url, 'avatar') ?? org.avatar_url }} style={styles.settingsAvatarPreview} />
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
                  <View style={styles.settingsPrivacyRow}>
                    <Pressable
                      style={[styles.settingsPrivacyOption, editPrivacy === 'public' && styles.settingsPrivacyOptionActive]}
                      onPress={() => setEditPrivacy('public')}
                    >
                      <Feather name="globe" size={13} color={editPrivacy === 'public' ? '#fff' : colors.textMuted} />
                      <Text style={[styles.settingsPrivacyOptionText, editPrivacy === 'public' && styles.settingsPrivacyOptionTextActive]}>
                        Public
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.settingsPrivacyOption, editPrivacy === 'private' && styles.settingsPrivacyOptionActive]}
                      onPress={() => setEditPrivacy('private')}
                    >
                      <Feather name="lock" size={13} color={editPrivacy === 'private' ? '#fff' : colors.textMuted} />
                      <Text style={[styles.settingsPrivacyOptionText, editPrivacy === 'private' && styles.settingsPrivacyOptionTextActive]}>
                        Private
                      </Text>
                    </Pressable>
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

  heroJoinBtn: {
    marginTop: 10,
    paddingHorizontal: 28,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  heroJoinBtnText: { fontSize: typography.size.sm, color: '#fff', fontWeight: '700' },
  heroRequestBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  heroRequestBtnText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '700' },
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
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
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

  // ── Add People ────────────────────────────────────────────────────────────
  addPeopleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addPeopleBtnText: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.primary,
  },
  addFriendBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    minWidth: 60,
    alignItems: 'center',
  },
  addFriendBtnAdded: {
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
  addFriendBtnText: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  addFriendBtnTextAdded: {
    color: colors.textMuted,
  },

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
    gap: spacing.sm,
  },
  settingsPrivacyOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingVertical: 9,
    backgroundColor: colors.background.base,
  },
  settingsPrivacyOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  settingsPrivacyOptionText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  settingsPrivacyOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

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

  // ── Activity sub-tabs ─────────────────────────────────────────────────────
  actSubTabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: 3,
  },
  actSubTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
  },
  actSubTabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 2,
    elevation: 2,
  },
  actSubTabText: {
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.textMuted,
  },
  actSubTabTextActive: {
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // ── Logs sub-tab ──────────────────────────────────────────────────────────
  logCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
    gap: spacing.sm,
  },
  logBody: { flex: 1, gap: 3 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logName: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  logTime: { fontSize: typography.size.xs, color: colors.textMuted },
  logBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logBadgeText: { fontSize: typography.size.xs, fontWeight: '600', color: '#10B981' },
  logBadgeSub: { fontSize: typography.size.xs, color: colors.textMuted },
  logDesc: { fontSize: typography.size.xs, color: colors.textSecondary, lineHeight: 16 },
  logLocation: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  logLocationText: { fontSize: typography.size.xs, color: colors.textMuted },

  // ── Users sub-tab ─────────────────────────────────────────────────────────
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
    gap: spacing.sm,
  },
  userChecks: { gap: 4, alignItems: 'flex-end' },
  userCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userCheckLabel: { fontSize: typography.size.xs, color: colors.textMuted },
  userCheckLabelActive: { color: '#10B981', fontWeight: '600' },

  // ── Log filter chips ──────────────────────────────────────────────────────
  logFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  logFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  logFilterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  logFilterChipText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  logFilterChipTextActive: {
    color: '#fff',
  },

  // ── Detail modal (today's check-in / workout) ─────────────────────────────
  detailCard: {
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  detailTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detailBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  detailPhoto: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: colors.background.elevated,
  },
  detailPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(79,195,224,0.12)',
  },
  detailPillText: {
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailMeta: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  detailDesc: {
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  detailTime: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  detailWorkoutName: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // ── Activity tab ──────────────────────────────────────────────────────────
  actSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    marginHorizontal: spacing.base,
    fontStyle: 'italic',
  },
  actSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  actSearchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    padding: 0,
  },
  actChipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  actChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.07)',
  },
  actChipText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
    gap: spacing.sm,
  },
  actInfo: { flex: 1 },
  actName: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  actUsername: { fontSize: typography.size.xs, color: colors.textMuted },
  actRight: { alignItems: 'flex-end', gap: 2 },
  actStreakRow: { flexDirection: 'row', alignItems: 'center' },
  actStreakText: { fontSize: typography.size.xs, color: colors.textSecondary },
  actCount: { fontSize: typography.size.sm, fontWeight: '700', color: colors.textPrimary },
  actEmpty: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  // ── Calendar modal ────────────────────────────────────────────────────────
  calOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  calCard: {
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderColor,
  },
  calTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  calActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderColor,
  },
  calActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  calClearBtn: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  calClearText: { fontSize: typography.size.sm, color: colors.textSecondary, fontWeight: '600' },
  calCancelBtn: {
    borderWidth: 1,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  calCancelText: { fontSize: typography.size.sm, color: colors.textSecondary, fontWeight: '600' },
  calApplyBtn: {
    backgroundColor: colors.primary,
  },
  calApplyText: { fontSize: typography.size.sm, color: '#fff', fontWeight: '700' },
});
