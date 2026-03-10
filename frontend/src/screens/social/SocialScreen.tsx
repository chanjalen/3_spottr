import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../../components/common/Avatar';
import { fetchDMConversations, fetchGroupConversations, sendZap } from '../../api/messaging';
import { Conversation, GroupConversation, Message as MessageType } from '../../types/messaging';
import { wsManager } from '../../services/websocket';
import { createGroup, joinViaCode } from '../../api/groups';
import { listMyOrgs, discoverOrgs, createOrg, joinOrgViaCode, joinOrg, requestJoinOrg, OrgListItem, LatestAnnouncement } from '../../api/organizations';
import { fetchFriends, searchUsers } from '../../api/accounts';
import { UserBrief } from '../../types/user';
import { colors, spacing, typography } from '../../theme';
import { SocialStackParamList, RootStackParamList } from '../../navigation/types';
import AppHeader from '../../components/navigation/AppHeader';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { useAuth } from '../../store/AuthContext';
import { useTutorial } from '../../store/TutorialContext';
import { timeAgo } from '../../utils/timeAgo';
import { staleCache } from '../../utils/staleCache';

type Props = {
  navigation: CompositeNavigationProp<
    NativeStackNavigationProp<SocialStackParamList, 'SocialHome'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
  route: RouteProp<SocialStackParamList, 'SocialHome'>;
};

type SocialTab = 'Messages' | 'Orgs';

export default function SocialScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { dm, group, org, optimisticDecrement, optimisticIncrement } = useUnreadCount();
  const { user: me } = useAuth();
  const { isActive: tutorialActive, step: tutorialStep, next: tutorialNext, pendingTabRequest, clearTabRequest } = useTutorial();
  const [activeTab, setActiveTab] = useState<SocialTab>(route.params?.tab ?? 'Messages');

  useEffect(() => {
    if (route.params?.tab) setActiveTab(route.params.tab);
  }, [route.params?.tab]);

  // Tutorial: switch to Orgs tab when requested via Next button
  useEffect(() => {
    if (pendingTabRequest === 'orgsTab') {
      clearTabRequest();
      setActiveTab('Orgs');
    }
  }, [pendingTabRequest]);

  // ── Messages state ────────────────────────────────────────────────────────
  const [dms, setDms] = useState<Conversation[]>([]);
  const [groupConvos, setGroupConvos] = useState<GroupConversation[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Group modal (create / join) ───────────────────────────────────────────
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupModalView, setGroupModalView] = useState<'options' | 'create' | 'join'>('options');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAvatarUri, setNewGroupAvatarUri] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupFriends, setGroupFriends] = useState<UserBrief[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [loadingGroupFriends, setLoadingGroupFriends] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendsVisibleCount, setFriendsVisibleCount] = useState(7);
  const [groupJoinCode, setGroupJoinCode] = useState('');
  const [joiningGroupCode, setJoiningGroupCode] = useState(false);

  // ── Orgs tab state ────────────────────────────────────────────────────────
  const [myOrgs, setMyOrgs] = useState<OrgListItem[]>([]);
  const [discoverOrgsList, setDiscoverOrgsList] = useState<OrgListItem[]>([]);
  const [orgsView, setOrgsView] = useState<'Mine' | 'Discover'>('Mine');
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgsRefreshing, setOrgsRefreshing] = useState(false);
  const orgSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orgSearchGenRef = useRef(0);
  const orgsViewRef = useRef<'Mine' | 'Discover'>('Mine');
  const orgSearchQueryRef = useRef('');
  // ── Create org modal ──────────────────────────────────────────────────────
  const [createOrgVisible, setCreateOrgVisible] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [newOrgPrivacy, setNewOrgPrivacy] = useState<'public' | 'private'>('public');
  const [newOrgPrivacyOpen, setNewOrgPrivacyOpen] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  // ── Org discover actions ──────────────────────────────────────────────────
  const [orgActionId, setOrgActionId] = useState<string | null>(null);
  const [requestedOrgIds, setRequestedOrgIds] = useState<Set<string>>(new Set());

  // ── Org join code modal ───────────────────────────────────────────────────
  const [orgJoinModalVisible, setOrgJoinModalVisible] = useState(false);
  const [orgInviteCode, setOrgInviteCode] = useState('');
  const [joiningOrgCode, setJoiningOrgCode] = useState(false);

  // ── Zap ───────────────────────────────────────────────────────────────────
  const [zapping, setZapping] = useState<string | null>(null); // partner_id being zapped
  const [zapCooldowns, setZapCooldowns] = useState<Record<string, number>>({}); // partnerId → sentAt ms

  // ── New message modal ─────────────────────────────────────────────────────
  const [newMsgVisible, setNewMsgVisible] = useState(false);
  const [newMsgQuery, setNewMsgQuery] = useState('');
  const [newMsgFriends, setNewMsgFriends] = useState<UserBrief[]>([]);
  const [newMsgResults, setNewMsgResults] = useState<UserBrief[]>([]);
  const [loadingNewMsg, setLoadingNewMsg] = useState(false);
  const newMsgSearchGenRef = useRef(0);
  const newMsgSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    const t0 = Date.now();
    const [cachedDms, cachedGroups] = await Promise.all([
      staleCache.get<Conversation[]>('social:messages:dm'),
      staleCache.get<GroupConversation[]>('social:messages:groups'),
    ]);
    if (cachedDms) { setDms(cachedDms); setLoadingMessages(false); }
    if (cachedGroups) { setGroupConvos(cachedGroups); setLoadingMessages(false); }

    try {
      const [dmData, groupData] = await Promise.all([
        fetchDMConversations().catch(() => [] as Conversation[]),
        fetchGroupConversations().catch(() => [] as GroupConversation[]),
      ]);
      staleCache.set('social:messages:dm', dmData, 2 * 60 * 1000);
      staleCache.set('social:messages:groups', groupData, 2 * 60 * 1000);
      setDms(dmData);
      setGroupConvos(groupData);
      console.log(`[PERF] Social/Messages: loaded ${dmData.length} DMs + ${groupData.length} groups in ${Date.now() - t0}ms`);
    } finally {
      setLoadingMessages(false);
      setRefreshing(false);
    }
  }, []);


  const loadMyOrgs = useCallback(async () => {
    const t0 = Date.now();
    const cached = await staleCache.get<OrgListItem[]>('social:orgs');
    if (cached) { setMyOrgs(cached); } else { setLoadingOrgs(true); }

    try {
      const data = await listMyOrgs();
      staleCache.set('social:orgs', data, 2 * 60 * 1000);
      setMyOrgs(data);
      console.log(`[PERF] Social/Orgs: loaded ${data.length} orgs in ${Date.now() - t0}ms`);
    } catch {
      if (!cached) setMyOrgs([]);
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  const loadDiscoverOrgs = useCallback(async (query?: string) => {
    const gen = ++orgSearchGenRef.current;
    setLoadingOrgs(true);
    try {
      const data = await discoverOrgs(query);
      if (gen !== orgSearchGenRef.current) return;
      setDiscoverOrgsList(data);
      // Sync requestedOrgIds with server-side pending_request flags so that
      // requests made from OrgProfileScreen are reflected here on re-fetch.
      setRequestedOrgIds(prev => {
        const updated = new Set(prev);
        data.forEach(o => { if (o.pending_request) updated.add(o.id); });
        return updated;
      });
    } catch {
      if (gen !== orgSearchGenRef.current) return;
      setDiscoverOrgsList([]);
    } finally {
      if (gen === orgSearchGenRef.current) setLoadingOrgs(false);
    }
  }, []);

  // ── Live WS updates for the chat list ────────────────────────────────────
  useEffect(() => {
    const handler = (msg: MessageType) => {
      const isOwnMessage = String(msg.sender) === String(me?.id);

      if (msg.group_id) {
        // Group message — update that conversation's preview and bubble to top
        setGroupConvos(prev => {
          const idx = prev.findIndex(g => String(g.group_id) === String(msg.group_id));
          if (idx === -1) {
            // First message in a group we haven't loaded yet — full refresh
            loadMessages();
            return prev;
          }
          const conv = prev[idx];
          const updated: GroupConversation = {
            ...conv,
            latest_message: msg,
            preview_text: null,
            unread_count: !isOwnMessage ? conv.unread_count + 1 : conv.unread_count,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
        // Bump the nav bar badge immediately — same event, same render cycle.
        if (!isOwnMessage) optimisticIncrement(1, 'group');
      } else if (msg.dm_recipient_id) {
        // DM message — figure out who the partner is, update that convo
        setDms(prev => {
          const partnerId = isOwnMessage
            ? String(msg.dm_recipient_id)
            : String(msg.sender);
          const idx = prev.findIndex(d => String(d.partner_id) === partnerId);
          if (idx === -1) {
            // First DM with this person — full refresh to get their profile info
            loadMessages();
            return prev;
          }
          const conv = prev[idx];
          const updated: Conversation = {
            ...conv,
            latest_message: msg,
            preview_text: null,
            unread_count: !isOwnMessage ? conv.unread_count + 1 : conv.unread_count,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
        // Bump the nav bar badge immediately — same event, same render cycle.
        if (!isOwnMessage) optimisticIncrement(1, 'dm');
      }
      // Note: the server also pushes an `unread_update` WS event with the exact
      // server-computed counts. UnreadCountContext listens to that and will
      // reconcile the nav bar badge within milliseconds if the optimistic value drifts.
    };

    wsManager.on('new_message', handler);
    return () => wsManager.off('new_message', handler);
  }, [me?.id, loadMessages, optimisticIncrement]);

  // Live WS updates for org announcement badges + preview (skip own posts for badge).
  useEffect(() => {
    const handler = (ann: {
      org: string; author_id: string; author_display_name: string;
      content: string; media: unknown[]; poll: unknown; created_at: string;
    }) => {
      const isOwn = String(ann.author_id) === String(me?.id);
      const preview: LatestAnnouncement = {
        author_display_name: ann.author_display_name,
        content: ann.content,
        has_media: ann.media.length > 0,
        has_poll: ann.poll !== null,
        created_at: ann.created_at,
      };
      setMyOrgs(prev => {
        const idx = prev.findIndex(o => o.id === ann.org);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          latest_announcement: preview,
          unread_count: isOwn ? prev[idx].unread_count : prev[idx].unread_count + 1,
        };
        return prev.map((o, i) => i === idx ? updated : o);
      });
    };
    wsManager.on('new_announcement', handler);
    return () => wsManager.off('new_announcement', handler);
  }, [me?.id]);

  // Live WS update when a join request arrives — bump pending_requests_count on the org row.
  useEffect(() => {
    const handler = ({ org_id, pending_requests_count }: { org_id: string; org_name: string; pending_requests_count: number }) => {
      setMyOrgs(prev => prev.map(o =>
        o.id === org_id ? { ...o, pending_requests_count } : o,
      ));
    };
    wsManager.on('org_join_request', handler);
    return () => wsManager.off('org_join_request', handler);
  }, []);

  // Keep refs in sync with state so focus effects can read the latest values.
  orgsViewRef.current = orgsView;
  orgSearchQueryRef.current = orgSearchQuery;

  // Reload messages every time this screen gains focus (returning from Chat, GroupChat, or other screens)
  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [loadMessages]),
  );

  // Re-fetch discover orgs on focus so requests made inside OrgProfileScreen
  // (pending_request flag) are reflected back in the list without manual refresh.
  useFocusEffect(
    useCallback(() => {
      if (orgsViewRef.current === 'Discover') {
        loadDiscoverOrgs(orgSearchQueryRef.current || undefined);
      }
    }, [loadDiscoverOrgs]),
  );

  // Reload when switching tabs internally
  const prevTabRef = useRef<SocialTab | null>(null);
  useEffect(() => {
    if (prevTabRef.current === null) { prevTabRef.current = activeTab; return; }
    if (activeTab === 'Messages') loadMessages();
    if (activeTab === 'Orgs') loadMyOrgs();
    prevTabRef.current = activeTab;
  }, [activeTab]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openGroupModal = async () => {
    setGroupModalVisible(true);
    setGroupModalView('options');
    setNewGroupName('');
    setNewGroupAvatarUri(null);
    setSelectedFriendIds(new Set());
    setGroupJoinCode('');
  };

  const closeGroupModal = () => {
    setGroupModalVisible(false);
    setGroupModalView('options');
    setNewGroupName('');
    setNewGroupAvatarUri(null);
    setSelectedFriendIds(new Set());
    setGroupJoinCode('');
    setGroupFriends([]);
    setFriendSearchQuery('');
    setFriendsVisibleCount(7);
  };

  const openCreateGroupView = async () => {
    setGroupModalView('create');
    setFriendSearchQuery('');
    setFriendsVisibleCount(7);
    setLoadingGroupFriends(true);
    try {
      const friends = await fetchFriends();
      setGroupFriends(friends);
    } catch {
      setGroupFriends([]);
    } finally {
      setLoadingGroupFriends(false);
    }
  };

  const handlePickGroupAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to add a group photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setNewGroupAvatarUri(result.assets[0].uri);
    }
  };

  const toggleFriend = (id: string) => {
    setSelectedFriendIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      await createGroup({
        name: newGroupName.trim(),
        avatarUri: newGroupAvatarUri ?? undefined,
        member_ids: Array.from(selectedFriendIds),
      });
      closeGroupModal();
      loadMessages();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleJoinGroupViaCode = async () => {
    const code = groupJoinCode.trim();
    if (!code) return;
    setJoiningGroupCode(true);
    try {
      await joinViaCode(code);
      closeGroupModal();
      Alert.alert('Joined!', 'You have joined the group.');
      loadMessages();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Invalid or expired invite code');
    } finally {
      setJoiningGroupCode(false);
    }
  };

  const handleZap = async (partnerId: string) => {
    if (zapping) return;
    setZapping(partnerId);
    try {
      await sendZap(partnerId);
      setZapCooldowns(prev => ({ ...prev, [partnerId]: Date.now() }));
      setTimeout(() => {
        setZapCooldowns(prev => { const n = { ...prev }; delete n[partnerId]; return n; });
      }, 60_000);
    } catch {
      // silently ignore
    } finally {
      setZapping(null);
    }
  };

  const openNewMessage = async () => {
    setNewMsgVisible(true);
    setNewMsgQuery('');
    setNewMsgResults([]);
    setLoadingNewMsg(true);
    try {
      const friends = await fetchFriends();
      setNewMsgFriends(friends);
    } catch {
      setNewMsgFriends([]);
    } finally {
      setLoadingNewMsg(false);
    }
  };

  const closeNewMessage = () => {
    setNewMsgVisible(false);
    setNewMsgQuery('');
    setNewMsgResults([]);
    if (newMsgSearchTimeoutRef.current) clearTimeout(newMsgSearchTimeoutRef.current);
  };

  const handleNewMsgSearch = (q: string) => {
    setNewMsgQuery(q);
    if (newMsgSearchTimeoutRef.current) clearTimeout(newMsgSearchTimeoutRef.current);
    const gen = ++newMsgSearchGenRef.current;
    if (!q.trim()) {
      setNewMsgResults([]);
      return;
    }
    newMsgSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers(q);
        if (gen !== newMsgSearchGenRef.current) return;
        setNewMsgResults(results);
      } catch {
        if (gen !== newMsgSearchGenRef.current) return;
        setNewMsgResults([]);
      }
    }, 300);
  };

  const handleSelectNewMsgUser = (user: UserBrief) => {
    closeNewMessage();
    navigation.navigate('Chat', {
      partnerId: String(user.id),
      partnerName: user.display_name,
      partnerUsername: user.username,
      partnerAvatar: user.avatar_url,
    });
  };


  // ── Orgs handlers ─────────────────────────────────────────────────────────
  const handleOrgSearch = (q: string) => {
    setOrgSearchQuery(q);
    setDiscoverOrgsList([]);
    setLoadingOrgs(true);
    ++orgSearchGenRef.current;
    if (orgSearchTimeoutRef.current) clearTimeout(orgSearchTimeoutRef.current);
    orgSearchTimeoutRef.current = setTimeout(() => loadDiscoverOrgs(q || undefined), 400);
  };

  const handleSwitchOrgsView = (view: 'Mine' | 'Discover') => {
    setOrgsView(view);
    setOrgSearchQuery('');
    if (view === 'Mine') loadMyOrgs();
    else loadDiscoverOrgs();
  };

  const handleOrgsRefresh = useCallback(async () => {
    setOrgsRefreshing(true);
    try {
      if (orgsView === 'Mine') {
        const data = await listMyOrgs();
        setMyOrgs(data);
      } else {
        const data = await discoverOrgs(orgSearchQuery || undefined);
        setDiscoverOrgsList(data);
      }
    } catch {
      // silently ignore
    } finally {
      setOrgsRefreshing(false);
    }
  }, [orgsView, orgSearchQuery]);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      await createOrg({
        name: newOrgName.trim(),
        description: newOrgDesc.trim(),
        privacy: newOrgPrivacy,
      });
      setCreateOrgVisible(false);
      setNewOrgName('');
      setNewOrgDesc('');
      setNewOrgPrivacy('public');
      setNewOrgPrivacyOpen(false);
      loadMyOrgs();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to create organization');
    } finally {
      setCreatingOrg(false);
    }
  };

  // ── Org card renderer ─────────────────────────────────────────────────────
  const handleJoinOrg = async (item: OrgListItem) => {
    setOrgActionId(item.id);
    try {
      await joinOrg(item.id);
      setDiscoverOrgsList(prev => prev.filter(o => o.id !== item.id));
      loadMyOrgs();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to join organization.');
    } finally {
      setOrgActionId(null);
    }
  };

  const handleRequestJoinOrg = async (item: OrgListItem) => {
    setOrgActionId(item.id);
    try {
      await requestJoinOrg(item.id);
      setRequestedOrgIds(prev => new Set(prev).add(item.id));
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to send join request.');
    } finally {
      setOrgActionId(null);
    }
  };

  const annPreviewText = (ann: LatestAnnouncement): string => {
    if (ann.content) return ann.content;
    if (ann.has_poll) return 'Poll';
    if (ann.has_media) return 'Photo';
    return '';
  };

  const renderOrgCard = ({ item }: { item: OrgListItem }) => {
    const roleBg = item.user_role === 'creator'
      ? 'rgba(234,179,8,0.15)'
      : item.user_role === 'admin'
      ? 'rgba(79,195,224,0.15)'
      : 'rgba(0,0,0,0.06)';
    const ann = item.user_role ? item.latest_announcement : null;
    const totalBadge = (item.unread_count ?? 0) + (item.pending_requests_count ?? 0);
    return (
      <Pressable
        style={({ pressed }) => [styles.discoverRow, pressed && styles.convoRowPressed]}
        onPress={() => {
          if (orgsView === 'Discover') {
            navigation.navigate('OrgProfile', { orgId: item.id });
            return;
          }
          if (item.unread_count > 0) {
            optimisticDecrement(item.unread_count, 'org');
            setMyOrgs(prev => prev.map(o => o.id === item.id ? { ...o, unread_count: 0 } : o));
          }
          navigation.navigate('OrgAnnouncements', {
            orgId: item.id,
            orgName: item.name,
            orgAvatar: item.avatar_url,
          });
        }}
      >
        <Avatar uri={item.avatar_url} name={item.name} size={44} />
        <View style={styles.convoInfo}>
          <View style={styles.convoTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
              <Text style={styles.convoName} numberOfLines={1}>{item.name}</Text>
              {item.privacy === 'private' && (
                <Feather name="lock" size={12} color={colors.textMuted} />
              )}
            </View>
            {ann
              ? <Text style={styles.convoTime}>{timeAgo(ann.created_at)}</Text>
              : <Text style={styles.memberCount}>{item.member_count} members</Text>
            }
          </View>
          {ann ? (
            <Text style={styles.convoLast} numberOfLines={1}>
              {me?.username && ann.content?.includes(`@${me.username}`)
                ? `${ann.author_display_name} mentioned you`
                : `${ann.author_display_name}: ${annPreviewText(ann)}`}
            </Text>
          ) : !!item.description && (
            <Text style={styles.convoLast} numberOfLines={1}>{item.description}</Text>
          )}
        </View>
        {item.user_role ? (
          totalBadge > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{totalBadge}</Text>
            </View>
          ) : (
            <View style={[styles.joinedBadge, { backgroundColor: roleBg }]}>
              <Text style={styles.joinedBadgeText}>{item.user_role}</Text>
            </View>
          )
        ) : (item.pending_request || requestedOrgIds.has(item.id)) ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>Requested</Text>
          </View>
        ) : orgActionId === item.id ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
        ) : (
          <Pressable
            style={[styles.joinBtn, item.privacy === 'private' && styles.requestBtn]}
            onPress={() => item.privacy === 'public' ? handleJoinOrg(item) : handleRequestJoinOrg(item)}
          >
            <Text style={[styles.joinBtnText, item.privacy === 'private' && styles.requestBtnText]}>
              {item.privacy === 'public' ? 'Join' : 'Request'}
            </Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  // ── Row renderers ─────────────────────────────────────────────────────────
  const renderDM = (item: Conversation) => (
    <Pressable
      key={item.partner_id}
      style={({ pressed }) => [styles.convoRow, pressed && styles.convoRowPressed]}
      onPress={() => {
        if (item.unread_count > 0) {
          optimisticDecrement(item.unread_count, 'dm');
          setDms(prev => prev.map(d =>
            d.partner_id === item.partner_id ? { ...d, unread_count: 0 } : d,
          ));
        }
        navigation.navigate('Chat', {
          partnerId: item.partner_id,
          partnerName: item.partner_display_name,
          partnerUsername: item.partner_username,
          partnerAvatar: item.partner_avatar_url,
        });
      }}
    >
      <Avatar uri={item.partner_avatar_url} name={item.partner_display_name} size={48} />
      <View style={styles.convoInfo}>
        <View style={styles.convoTopRow}>
          <Text style={styles.convoName} numberOfLines={1}>{item.partner_display_name}</Text>
          {!!item.latest_message?.created_at && (
            <Text style={styles.convoTime}>{timeAgo(item.latest_message.created_at)}</Text>
          )}
        </View>
        <Text style={styles.convoLast} numberOfLines={1}>
          {item.preview_text ?? (!item.latest_message
            ? 'No messages yet'
            : item.latest_message.content
            ? item.latest_message.content
            : item.latest_message.media?.length
            ? (item.latest_message.media.some((m: any) => m.kind === 'video') ? 'Video' : 'Photo')
            : item.latest_message.shared_post
            ? 'Shared a post'
            : '')}
        </Text>
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}
      {!item.partner_has_activity_today && !zapCooldowns[item.partner_id] && (
        <Pressable
          style={[styles.zapBtn, zapping === item.partner_id && styles.zapBtnDisabled]}
          onPress={() => handleZap(item.partner_id)}
          disabled={zapping !== null}
          hitSlop={8}
        >
          {zapping === item.partner_id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="zap" size={15} color="#fff" />
          )}
        </Pressable>
      )}
    </Pressable>
  );

  const renderGroupConvo = (item: GroupConversation) => (
    <Pressable
      key={item.group_id}
      style={({ pressed }) => [styles.convoRow, pressed && styles.convoRowPressed]}
      onPress={() => {
        if (item.unread_count > 0) {
          optimisticDecrement(item.unread_count, 'group');
          setGroupConvos(prev => prev.map(g =>
            g.group_id === item.group_id ? { ...g, unread_count: 0 } : g,
          ));
        }
        navigation.navigate('GroupChat', { groupId: item.group_id, groupName: item.group_name, groupAvatar: item.avatar_url });
      }}
    >
      <Avatar uri={item.avatar_url} name={item.group_name} size={48} />
      <View style={styles.convoInfo}>
        <View style={styles.convoTopRow}>
          <View style={styles.nameStreakRow}>
            <Text style={styles.convoName} numberOfLines={1}>{item.group_name}</Text>
            {item.group_streak > 0 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>🔥 {item.group_streak}</Text>
              </View>
            )}
          </View>
          {!!item.latest_message?.created_at && (
            <Text style={styles.convoTime}>{timeAgo(item.latest_message.created_at)}</Text>
          )}
        </View>
        <Text style={styles.convoLast} numberOfLines={1}>
          {item.preview_text ?? (!item.latest_message
            ? 'No messages yet'
            : (() => {
                const sender = item.latest_message.sender_username ? `${item.latest_message.sender_username}: ` : '';
                if (item.latest_message.content) return `${sender}${item.latest_message.content}`;
                if (item.latest_message.media?.length)
                  return `${sender}${item.latest_message.media.some((m: any) => m.kind === 'video') ? 'Video' : 'Photo'}`;
                if (item.latest_message.shared_post) return `${sender}Shared a post`;
                return '';
              })())}
        </Text>
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}
    </Pressable>
  );


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        <AppHeader />

        {/* Tab row */}
        <View style={styles.tabRow}>
          {(['Messages', 'Orgs'] as SocialTab[]).map((tab) => {
            const tabCount = tab === 'Messages' ? dm + group : org;
            return (
              <Pressable
                key={tab}
                style={styles.tab}
                onPress={() => {
                  if (tab === 'Orgs' && activeTab !== 'Orgs') {
                    setOrgsView('Mine');
                    setOrgSearchQuery('');
                    setLoadingOrgs(true);
                    if (tutorialActive && tutorialStep === 10) tutorialNext();
                  }
                  setActiveTab(tab);
                }}
              >
                <View style={styles.tabLabelRow}>
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
                  {tabCount > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{tabCount > 99 ? '99+' : tabCount}</Text>
                    </View>
                  )}
                </View>
                {activeTab === tab && <View style={styles.tabIndicator} />}
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {activeTab === 'Messages' ? (
        // ────────────────── Messages tab ──────────────────
        loadingMessages ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadMessages(); }}
                tintColor={colors.primary}
              />
            }
          >
            {/* MESSAGES section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>MESSAGES</Text>
              <Pressable
                style={styles.addBtn}
                onPress={openNewMessage}
              >
                <Feather name="plus" size={18} color="#fff" />
              </Pressable>
            </View>
            {dms.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>No conversations yet</Text>
              </View>
            ) : (
              <>
                {dms.slice(0, 5).map(renderDM)}
                {dms.length > 5 && (
                  <Pressable
                    style={styles.seeAllBtn}
                    onPress={() => navigation.navigate('AllDMs')}
                  >
                    <Text style={styles.seeAllText}>See all ({dms.length})</Text>
                    <Feather name="chevron-right" size={14} color={colors.primary} />
                  </Pressable>
                )}
              </>
            )}

            {/* GROUP CHATS section */}
            <View style={[styles.sectionHeader, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>GROUP CHATS</Text>
              <Pressable
                style={styles.addBtn}
                onPress={openGroupModal}
              >
                <Feather name="plus" size={18} color="#fff" />
              </Pressable>
            </View>
            {groupConvos.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>No group chats yet</Text>
              </View>
            ) : (
              <>
                {groupConvos.slice(0, 5).map(renderGroupConvo)}
                {groupConvos.length > 5 && (
                  <Pressable
                    style={styles.seeAllBtn}
                    onPress={() => navigation.navigate('AllGroupChats')}
                  >
                    <Text style={styles.seeAllText}>See all ({groupConvos.length})</Text>
                    <Feather name="chevron-right" size={14} color={colors.primary} />
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        )
      ) : (
        // ────────────────── Orgs tab ──────────────────
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.groupsHeader}>
            <Text style={styles.sectionTitle}>ORGANIZATIONS</Text>
            <Pressable style={styles.createBtn} onPress={() => setCreateOrgVisible(true)}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.createBtnText}>Create Org</Text>
            </Pressable>
          </View>

          {/* Mine / Discover toggle */}
          <View style={styles.orgsToggleRow}>
            {(['Mine', 'Discover'] as const).map((v) => (
              <Pressable
                key={v}
                style={[styles.orgsToggleBtn, orgsView === v && styles.orgsToggleBtnActive]}
                onPress={() => handleSwitchOrgsView(v)}
              >
                <Text style={[styles.orgsToggleText, orgsView === v && styles.orgsToggleTextActive]}>
                  {v}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Search bar (Discover only) */}
          {orgsView === 'Discover' && (
            <View style={styles.searchContainer}>
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search organizations..."
                placeholderTextColor={colors.textMuted}
                value={orgSearchQuery}
                onChangeText={handleOrgSearch}
                returnKeyType="search"
              />
            </View>
          )}

          {/* Orgs list */}
          {loadingOrgs && !orgsRefreshing ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={orgsView === 'Mine' ? myOrgs.slice(0, 5) : discoverOrgsList}
              keyExtractor={(item) => item.id}
              renderItem={renderOrgCard}
              extraData={requestedOrgIds}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.md }}
              refreshControl={
                <RefreshControl
                  refreshing={orgsRefreshing}
                  onRefresh={handleOrgsRefresh}
                  tintColor={colors.primary}
                />
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Feather name="award" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>
                    {orgsView === 'Mine' ? 'No organizations yet' : 'No organizations found'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {orgsView === 'Mine' ? 'Create one to get started!' : 'Try a different search'}
                  </Text>
                </View>
              }
              ListFooterComponent={
                orgsView === 'Mine' && myOrgs.length > 5 ? (
                  <Pressable
                    style={styles.seeAllBtn}
                    onPress={() => navigation.navigate('AllOrgs')}
                  >
                    <Text style={styles.seeAllText}>See all ({myOrgs.length})</Text>
                    <Feather name="chevron-right" size={14} color={colors.primary} />
                  </Pressable>
                ) : null
              }
            />
          )}

          {/* Join with invite code */}
          <Pressable
            style={[styles.joinRow, { marginBottom: Math.max(insets.bottom, 16) + 100 }]}
            onPress={() => setOrgJoinModalVisible(true)}
          >
            <View style={styles.joinIconWrap}>
              <Feather name="key" size={16} color={colors.primary} />
            </View>
            <Text style={styles.joinRowText}>Join Org with Invite Code</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* ── New Message Modal ── */}
      <Modal
        visible={newMsgVisible}
        transparent
        animationType="fade"
        onRequestClose={closeNewMessage}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNewMessage} />
          <View style={[styles.modalCard, styles.newMsgCard]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>New Message</Text>
              <Pressable style={styles.modalCloseBtn} onPress={closeNewMessage}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Search bar */}
            <View style={styles.newMsgSearchWrap}>
              <Feather name="search" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.newMsgSearchInput}
                placeholder="Search friends..."
                placeholderTextColor={colors.textMuted}
                value={newMsgQuery}
                onChangeText={handleNewMsgSearch}
                autoFocus
                returnKeyType="search"
              />
            </View>

            {/* Results list */}
            {loadingNewMsg ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={newMsgQuery.trim() ? newMsgResults : newMsgFriends}
                keyExtractor={(item) => String(item.id)}
                style={styles.newMsgList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [styles.newMsgRow, pressed && styles.convoRowPressed]}
                    onPress={() => handleSelectNewMsgUser(item)}
                  >
                    <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
                    <View style={styles.newMsgRowInfo}>
                      <Text style={styles.newMsgName}>{item.display_name}</Text>
                      <Text style={styles.newMsgUsername}>@{item.username}</Text>
                    </View>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.newMsgEmpty}>
                    <Text style={styles.emptyText}>
                      {newMsgQuery.trim() ? 'No users found' : 'No friends yet'}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Group Modal (Create / Join) ── */}
      <Modal
        visible={groupModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeGroupModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeGroupModal} />

          {groupModalView === 'options' && (
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Group Chats</Text>
                <Pressable style={styles.modalCloseBtn} onPress={closeGroupModal}>
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

              <Pressable style={styles.groupOptionBtn} onPress={openCreateGroupView}>
                <View style={styles.groupOptionIcon}>
                  <Feather name="users" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupOptionTitle}>Create Group</Text>
                  <Text style={styles.groupOptionSubtitle}>Start a private group with friends</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>

              <Pressable style={styles.groupOptionBtn} onPress={() => setGroupModalView('join')}>
                <View style={styles.groupOptionIcon}>
                  <Feather name="key" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupOptionTitle}>Join with Code</Text>
                  <Text style={styles.groupOptionSubtitle}>Enter an invite code to join a group</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

          {groupModalView === 'create' && (
            <View style={[styles.modalCard, styles.groupCreateCard]}>
              <View style={styles.modalHeaderRow}>
                <Pressable onPress={() => setGroupModalView('options')}>
                  <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                </Pressable>
                <Text style={styles.modalTitle}>Create Group</Text>
                <Pressable style={styles.modalCloseBtn} onPress={closeGroupModal}>
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

              {/* Avatar picker */}
              <Pressable style={styles.avatarRow} onPress={handlePickGroupAvatar}>
                <View style={styles.avatarCircle}>
                  {newGroupAvatarUri ? (
                    <Image source={{ uri: newGroupAvatarUri }} style={styles.avatarPreview} />
                  ) : (
                    <Feather name="camera" size={22} color="#fff" />
                  )}
                </View>
                <Text style={styles.addPhotoText}>{newGroupAvatarUri ? 'Change Photo' : 'Add Photo'}</Text>
              </Pressable>

              {/* Group Name */}
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Group Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Morning Workout Crew"
                  placeholderTextColor={colors.textMuted}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  maxLength={100}
                />
              </View>

              {/* Friends list */}
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Add Friends</Text>
                {loadingGroupFriends ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
                ) : (() => {
                  const filtered = friendSearchQuery.trim()
                    ? groupFriends.filter(f =>
                        f.display_name.toLowerCase().includes(friendSearchQuery.toLowerCase()) ||
                        f.username.toLowerCase().includes(friendSearchQuery.toLowerCase()),
                      )
                    : groupFriends;
                  const displayed = filtered.slice(0, friendsVisibleCount);
                  const hasMore = displayed.length < filtered.length;
                  return (
                    <>
                      <View style={styles.friendSearchWrap}>
                        <Feather name="search" size={14} color={colors.textMuted} />
                        <TextInput
                          style={styles.friendSearchInput}
                          placeholder="Search friends..."
                          placeholderTextColor={colors.textMuted}
                          value={friendSearchQuery}
                          onChangeText={(q) => {
                            setFriendSearchQuery(q);
                            setFriendsVisibleCount(7);
                          }}
                          returnKeyType="search"
                        />
                        {!!friendSearchQuery && (
                          <Pressable onPress={() => { setFriendSearchQuery(''); setFriendsVisibleCount(7); }}>
                            <Feather name="x" size={14} color={colors.textMuted} />
                          </Pressable>
                        )}
                      </View>
                      {groupFriends.length === 0 ? (
                        <Text style={[styles.emptyText, { paddingVertical: 8 }]}>No friends to add</Text>
                      ) : filtered.length === 0 ? (
                        <Text style={[styles.emptyText, { paddingVertical: 8 }]}>No results</Text>
                      ) : (
                        <FlatList
                          data={displayed}
                          keyExtractor={(f) => String(f.id)}
                          style={styles.friendsList}
                          keyboardShouldPersistTaps="handled"
                          onEndReachedThreshold={0.3}
                          onEndReached={() => {
                            if (hasMore) setFriendsVisibleCount(c => c + 7);
                          }}
                          ListFooterComponent={hasMore ? (
                            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 8 }} />
                          ) : null}
                          renderItem={({ item }) => {
                            const selected = selectedFriendIds.has(String(item.id));
                            return (
                              <Pressable
                                style={styles.friendRow}
                                onPress={() => toggleFriend(String(item.id))}
                              >
                                <Avatar uri={item.avatar_url} name={item.display_name} size={36} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.friendName}>{item.display_name}</Text>
                                  <Text style={styles.friendUsername}>@{item.username}</Text>
                                </View>
                                <View style={[styles.friendCheckbox, selected && styles.friendCheckboxSelected]}>
                                  {selected && <Feather name="check" size={12} color="#fff" />}
                                </View>
                              </Pressable>
                            );
                          }}
                        />
                      )}
                    </>
                  );
                })()}
              </View>

              <Pressable
                style={[styles.createGroupBtn, (!newGroupName.trim() || creatingGroup) && styles.createGroupBtnDisabled]}
                onPress={handleCreateGroup}
                disabled={!newGroupName.trim() || creatingGroup}
              >
                {creatingGroup ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createGroupBtnText}>
                    Create{selectedFriendIds.size > 0 ? ` & Add ${selectedFriendIds.size}` : ''}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {groupModalView === 'join' && (
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Pressable onPress={() => setGroupModalView('options')}>
                  <Feather name="arrow-left" size={20} color={colors.textPrimary} />
                </Pressable>
                <Text style={styles.modalTitle}>Join with Code</Text>
                <Pressable style={styles.modalCloseBtn} onPress={closeGroupModal}>
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
              <Text style={styles.joinModalSubtitle}>Enter the 8-character code shared by a group member.</Text>
              <TextInput
                style={styles.joinModalInput}
                placeholder="e.g. ABC12345"
                placeholderTextColor={colors.textMuted}
                value={groupJoinCode}
                onChangeText={setGroupJoinCode}
                autoCapitalize="characters"
                autoFocus
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={handleJoinGroupViaCode}
              />
              <Pressable
                style={[styles.createGroupBtn, (!groupJoinCode.trim() || joiningGroupCode) && styles.createGroupBtnDisabled]}
                onPress={handleJoinGroupViaCode}
                disabled={!groupJoinCode.trim() || joiningGroupCode}
              >
                {joiningGroupCode ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createGroupBtnText}>Join Group</Text>
                )}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Org Modal ── */}
      <Modal
        visible={createOrgVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOrgVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOrgVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Create Organization</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setCreateOrgVisible(false)}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Organization Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., CrossFit Crew"
                placeholderTextColor={colors.textMuted}
                value={newOrgName}
                onChangeText={setNewOrgName}
                maxLength={100}
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMulti]}
                placeholder="Describe your organization..."
                placeholderTextColor={colors.textMuted}
                value={newOrgDesc}
                onChangeText={setNewOrgDesc}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Privacy</Text>
              <Pressable style={styles.dropdown} onPress={() => setNewOrgPrivacyOpen(!newOrgPrivacyOpen)}>
                <Text style={styles.dropdownValue}>
                  {newOrgPrivacy === 'public' ? 'Public — Anyone can join' : 'Private — Approval required'}
                </Text>
                <Feather
                  name={newOrgPrivacyOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
              {newOrgPrivacyOpen && (
                <View style={styles.dropdownMenu}>
                  {([
                    { value: 'public', label: 'Public — Anyone can join' },
                    { value: 'private', label: 'Private — Approval required' },
                  ] as const).map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[styles.dropdownItem, newOrgPrivacy === opt.value && styles.dropdownItemActive]}
                      onPress={() => { setNewOrgPrivacy(opt.value); setNewOrgPrivacyOpen(false); }}
                    >
                      <Text style={[styles.dropdownItemText, newOrgPrivacy === opt.value && styles.dropdownItemTextActive]}>
                        {opt.label}
                      </Text>
                      {newOrgPrivacy === opt.value && (
                        <Feather name="check" size={14} color={colors.primary} />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <Pressable
              style={[styles.createGroupBtn, (!newOrgName.trim() || creatingOrg) && styles.createGroupBtnDisabled]}
              onPress={handleCreateOrg}
              disabled={!newOrgName.trim() || creatingOrg}
            >
              {creatingOrg ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createGroupBtnText}>Create Organization</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Join Org via Code Modal ── */}
      <Modal
        visible={orgJoinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setOrgJoinModalVisible(false); setOrgInviteCode(''); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setOrgJoinModalVisible(false); setOrgInviteCode(''); }} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Join with Invite Code</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => { setOrgJoinModalVisible(false); setOrgInviteCode(''); }}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.joinModalSubtitle}>Enter the 8-character org invite code.</Text>
            <TextInput
              style={styles.joinModalInput}
              placeholder="e.g. ABC12345"
              placeholderTextColor={colors.textMuted}
              value={orgInviteCode}
              onChangeText={setOrgInviteCode}
              autoCapitalize="characters"
              autoFocus
              maxLength={8}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.createGroupBtn, (!orgInviteCode.trim() || joiningOrgCode) && styles.createGroupBtnDisabled]}
              onPress={async () => {
                const code = orgInviteCode.trim();
                if (!code) return;
                setJoiningOrgCode(true);
                try {
                  await joinOrgViaCode(code);
                  setOrgInviteCode('');
                  setOrgJoinModalVisible(false);
                  Alert.alert('Joined!', 'You have joined the organization.');
                  loadMyOrgs();
                } catch (e: any) {
                  Alert.alert('Error', e?.response?.data?.error ?? 'Invalid or expired invite code');
                } finally {
                  setJoiningOrgCode(false);
                }
              }}
              disabled={!orgInviteCode.trim() || joiningOrgCode}
            >
              {joiningOrgCode ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createGroupBtnText}>Join Organization</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </View>
  );
}

const styles = StyleSheet.create({
  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { fontWeight: '700', color: colors.textPrimary },
  tabBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', lineHeight: 12 },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },

  // ── Section headers ───────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.size.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primary,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Convo rows (shared) ───────────────────────────────────────────────────
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  convoRowPressed: { backgroundColor: colors.background.elevated },
  convoInfo: { flex: 1, gap: 2 },
  convoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convoName: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
    marginRight: spacing.xs,
  },
  convoTime: { fontSize: typography.size.xs, color: colors.textMuted },
  convoLast: { fontSize: typography.size.sm, color: colors.textSecondary },
  nameStreakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  streakBadge: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  streakText: { fontSize: typography.size.xs, fontWeight: '600', color: '#F97316' },
  zapBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zapBtnDisabled: { opacity: 0.5 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // ── Empty states ──────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing['2xl'],
  },
  emptySection: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  emptyText: { fontSize: typography.size.sm, color: colors.textMuted },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  seeAllText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },
  emptyTitle: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  emptySubtitle: { fontSize: typography.size.sm, color: colors.textMuted },

  // ── Groups tab ────────────────────────────────────────────────────────────
  groupsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  createBtnText: { fontSize: typography.size.sm, fontWeight: '600', color: '#fff' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  memberCount: { fontSize: typography.size.xs, color: colors.textMuted },
  joinedBadge: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  joinedBadgeText: { fontSize: typography.size.xs, fontWeight: '600', color: colors.textSecondary },
  pendingBadgeText: { fontSize: typography.size.xs, fontWeight: '600', color: '#F59E0B' },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { fontSize: typography.size.xs, fontWeight: '600', color: '#fff' },
  requestBtnText: { color: colors.primary },

  // ── Join via code row ─────────────────────────────────────────────────────
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
  },
  joinIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(79,195,224,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinRowText: {
    flex: 1,
    fontSize: typography.size.sm,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  // ── Join modal ────────────────────────────────────────────────────────────
  joinModalSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  joinModalInput: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.size.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
    letterSpacing: 3,
    textAlign: 'center',
  },

  // ── Create Group Modal ────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.base,
    gap: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPreview: { width: 56, height: 56, borderRadius: 28 },
  addPhotoText: {
    fontSize: typography.size.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  inputBlock: { gap: spacing.xs },
  inputLabel: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    backgroundColor: colors.background.elevated,
  },
  modalInputMulti: { height: 80 },
  dropdown: {
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
  dropdownValue: { fontSize: typography.size.sm, color: colors.textPrimary },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: -4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  dropdownItemActive: { backgroundColor: colors.background.elevated },
  dropdownItemText: { fontSize: typography.size.sm, color: colors.textPrimary },
  dropdownItemTextActive: { color: colors.primary, fontWeight: '600' },
  createGroupBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  createGroupBtnDisabled: { opacity: 0.5 },
  createGroupBtnText: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: '#fff',
  },

  // ── New Message Modal ─────────────────────────────────────────────────────
  newMsgCard: {
    maxHeight: '70%',
  },
  newMsgSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.elevated,
  },
  newMsgSearchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  newMsgList: {
    flexGrow: 0,
  },
  newMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: 10,
  },
  newMsgRowInfo: {
    gap: 2,
  },
  newMsgName: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  newMsgUsername: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  newMsgEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },

  // ── Group modal ───────────────────────────────────────────────────────────
  groupOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
  },
  groupOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(79,195,224,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupOptionTitle: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  groupOptionSubtitle: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  groupCreateCard: {
    maxHeight: '85%',
  },
  friendSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.background.elevated,
    marginBottom: spacing.xs,
  },
  friendSearchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  friendsList: {
    maxHeight: 220,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  friendName: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  friendUsername: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  friendCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // ── Orgs tab ──────────────────────────────────────────────────────────────
  orgsToggleRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    padding: 3,
  },
  orgsToggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  orgsToggleBtnActive: { backgroundColor: '#fff' },
  orgsToggleText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textMuted },
  orgsToggleTextActive: { fontWeight: '700', color: colors.textPrimary },
});
