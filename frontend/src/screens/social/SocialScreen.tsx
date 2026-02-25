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
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../../components/common/Avatar';
import { fetchDMConversations, fetchGroupConversations, sendZap } from '../../api/messaging';
import { Conversation, GroupConversation, Message as MessageType } from '../../types/messaging';
import { wsManager } from '../../services/websocket';
import { searchGroups, createGroup, joinViaCode, joinGroup, requestJoinGroup, GroupListItem } from '../../api/groups';
import { listMyOrgs, discoverOrgs, createOrg, joinOrgViaCode, joinOrg, requestJoinOrg, OrgListItem } from '../../api/organizations';
import { fetchFriends, searchUsers } from '../../api/accounts';
import { UserBrief } from '../../types/user';
import { colors, spacing, typography } from '../../theme';
import { SocialStackParamList, RootStackParamList } from '../../navigation/types';
import AppHeader from '../../components/navigation/AppHeader';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { useAuth } from '../../store/AuthContext';
import { timeAgo } from '../../utils/timeAgo';

type Props = {
  navigation: CompositeNavigationProp<
    NativeStackNavigationProp<SocialStackParamList, 'SocialHome'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type SocialTab = 'Messages' | 'Groups' | 'Orgs';

export default function SocialScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { optimisticDecrement, optimisticIncrement } = useUnreadCount();
  const { user: me } = useAuth();
  const [activeTab, setActiveTab] = useState<SocialTab>('Messages');

  // ── Messages state ────────────────────────────────────────────────────────
  const [dms, setDms] = useState<Conversation[]>([]);
  const [groupConvos, setGroupConvos] = useState<GroupConversation[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Groups tab state ──────────────────────────────────────────────────────
  const [discoverGroups, setDiscoverGroups] = useState<GroupListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);

  // ── Orgs tab state ────────────────────────────────────────────────────────
  const [myOrgs, setMyOrgs] = useState<OrgListItem[]>([]);
  const [discoverOrgsList, setDiscoverOrgsList] = useState<OrgListItem[]>([]);
  const [orgsView, setOrgsView] = useState<'Mine' | 'Discover'>('Mine');
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const orgSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orgSearchGenRef = useRef(0);
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

  // ── Create group modal ────────────────────────────────────────────────────
  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrivacy, setNewPrivacy] = useState<'public' | 'private'>('public');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Zap ───────────────────────────────────────────────────────────────────
  const [zapping, setZapping] = useState<string | null>(null); // partner_id being zapped

  // ── Group join/request ────────────────────────────────────────────────────
  const [joining, setJoining] = useState<string | null>(null); // group_id being joined/requested

  // ── New message modal ─────────────────────────────────────────────────────
  const [newMsgVisible, setNewMsgVisible] = useState(false);
  const [newMsgQuery, setNewMsgQuery] = useState('');
  const [newMsgFriends, setNewMsgFriends] = useState<UserBrief[]>([]);
  const [newMsgResults, setNewMsgResults] = useState<UserBrief[]>([]);
  const [loadingNewMsg, setLoadingNewMsg] = useState(false);
  const newMsgSearchGenRef = useRef(0);
  const newMsgSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Join via code ─────────────────────────────────────────────────────────
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    try {
      const [dmData, groupData] = await Promise.all([
        fetchDMConversations().catch(() => []),
        fetchGroupConversations().catch(() => []),
      ]);
      setDms(dmData);
      setGroupConvos(groupData);
    } finally {
      setLoadingMessages(false);
      setRefreshing(false);
    }
  }, []);

  const loadGroups = useCallback(async (query?: string) => {
    const gen = ++searchGenRef.current;
    setLoadingGroups(true);
    try {
      const data = await searchGroups(query);
      if (gen !== searchGenRef.current) return; // stale response, ignore
      setDiscoverGroups(data);
    } catch {
      if (gen !== searchGenRef.current) return;
      setDiscoverGroups([]);
    } finally {
      if (gen === searchGenRef.current) setLoadingGroups(false);
    }
  }, []);

  const loadMyOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    try {
      const data = await listMyOrgs();
      setMyOrgs(data);
    } catch {
      setMyOrgs([]);
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

  // Reload messages every time this screen gains focus (returning from Chat, GroupChat, or other screens)
  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [loadMessages]),
  );

  // Reload when switching tabs internally
  const prevTabRef = useRef<SocialTab | null>(null);
  useEffect(() => {
    if (prevTabRef.current === null) { prevTabRef.current = activeTab; return; }
    if (activeTab === 'Messages') loadMessages();
    if (activeTab === 'Groups') loadGroups();
    if (activeTab === 'Orgs') loadMyOrgs();
    prevTabRef.current = activeTab;
  }, [activeTab]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setDiscoverGroups([]);
    setLoadingGroups(true);
    ++searchGenRef.current; // invalidate any in-flight request immediately
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => loadGroups(q || undefined), 400);
  };

  const handlePickAvatar = async () => {
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
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleCreateGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createGroup({
        name: newName.trim(),
        description: newDesc.trim(),
        privacy: newPrivacy,
        avatarUri: avatarUri ?? undefined,
      });
      setCreateVisible(false);
      setNewName('');
      setNewDesc('');
      setNewPrivacy('public');
      setPrivacyOpen(false);
      setAvatarUri(null);
      loadGroups(searchQuery || undefined);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleZap = async (partnerId: string) => {
    if (zapping) return;
    setZapping(partnerId);
    try {
      await sendZap(partnerId);
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

  const handleJoinViaCode = async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setJoiningCode(true);
    try {
      await joinViaCode(code);
      setInviteCode('');
      setJoinModalVisible(false);
      Alert.alert('Joined!', 'You have joined the group.');
      loadMessages();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Invalid or expired invite code');
    } finally {
      setJoiningCode(false);
    }
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

  const renderOrgCard = ({ item }: { item: OrgListItem }) => {
    const roleBg = item.user_role === 'creator'
      ? 'rgba(234,179,8,0.15)'
      : item.user_role === 'admin'
      ? 'rgba(79,195,224,0.15)'
      : 'rgba(0,0,0,0.06)';
    return (
      <Pressable
        style={({ pressed }) => [styles.discoverRow, pressed && styles.convoRowPressed]}
        onPress={() => navigation.navigate('OrgAnnouncements', {
          orgId: item.id,
          orgName: item.name,
          orgAvatar: item.avatar_url,
        })}
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
            <Text style={styles.memberCount}>{item.member_count} members</Text>
          </View>
          {!!item.description && (
            <Text style={styles.convoLast} numberOfLines={1}>{item.description}</Text>
          )}
        </View>
        {item.user_role ? (
          <View style={[styles.joinedBadge, { backgroundColor: roleBg }]}>
            <Text style={styles.joinedBadgeText}>{item.user_role}</Text>
          </View>
        ) : requestedOrgIds.has(item.id) ? (
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
          {item.latest_message?.content ?? 'No messages yet'}
        </Text>
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}
      {!item.partner_has_activity_today && (
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
          {item.latest_message
            ? `${item.latest_message.sender_username ?? ''}: ${item.latest_message.content}`
            : 'No messages yet'}
        </Text>
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
        </View>
      )}
    </Pressable>
  );

  const handleJoinGroup = async (item: GroupListItem) => {
    if (joining) return;
    setJoining(item.id);
    try {
      if (item.privacy === 'public') {
        await joinGroup(item.id);
        setDiscoverGroups(prev =>
          prev.map(g => g.id === item.id ? { ...g, is_member: true } : g),
        );
      } else {
        await requestJoinGroup(item.id);
        setDiscoverGroups(prev =>
          prev.map(g => g.id === item.id ? { ...g, has_pending_request: true } : g),
        );
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Something went wrong. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setJoining(null);
    }
  };

  const renderDiscoverGroup = ({ item }: { item: GroupListItem }) => {
    const isJoining = joining === item.id;
    return (
      <Pressable
        style={({ pressed }) => [styles.discoverRow, pressed && styles.convoRowPressed]}
        onPress={() => navigation.navigate('GroupProfile', { groupId: item.id })}
      >
        <Avatar uri={item.avatar_url} name={item.name} size={44} />
        <View style={styles.convoInfo}>
          <View style={styles.convoTopRow}>
            <Text style={styles.convoName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.memberCount}>{item.member_count} members</Text>
          </View>
          {!!item.description && (
            <Text style={styles.convoLast} numberOfLines={1}>{item.description}</Text>
          )}
        </View>
        {item.is_member ? (
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedBadgeText}>Joined</Text>
          </View>
        ) : item.has_pending_request ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>Pending</Text>
          </View>
        ) : (
          <Pressable
            style={[
              styles.joinBtn,
              item.privacy === 'private' && styles.requestBtn,
              (isJoining || !!joining) && styles.joinBtnDisabled,
            ]}
            onPress={() => handleJoinGroup(item)}
            disabled={!!joining}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={item.privacy === 'public' ? '#fff' : colors.primary} />
            ) : (
              <Text style={[styles.joinBtnText, item.privacy === 'private' && styles.requestBtnText]}>
                {item.privacy === 'public' ? 'Join' : 'Request'}
              </Text>
            )}
          </Pressable>
        )}
      </Pressable>
    );
  };

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
          {(['Messages', 'Groups', 'Orgs'] as SocialTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={styles.tab}
              onPress={() => {
                if (tab === 'Groups' && activeTab !== 'Groups') {
                  setSearchQuery('');
                  setDiscoverGroups([]);
                  setLoadingGroups(true);
                }
                if (tab === 'Orgs' && activeTab !== 'Orgs') {
                  setOrgsView('Mine');
                  setOrgSearchQuery('');
                  setLoadingOrgs(true);
                }
                setActiveTab(tab);
              }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab && <View style={styles.tabIndicator} />}
            </Pressable>
          ))}
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
              dms.map(renderDM)
            )}

            {/* GROUP CHATS section */}
            <View style={[styles.sectionHeader, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>GROUP CHATS</Text>
            </View>
            {groupConvos.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>No group chats yet</Text>
              </View>
            ) : (
              groupConvos.map(renderGroupConvo)
            )}
          </ScrollView>
        )
      ) : activeTab === 'Groups' ? (
        // ────────────────── Groups tab ──────────────────
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.groupsHeader}>
            <Text style={styles.sectionTitle}>DISCOVER GROUPS</Text>
            <Pressable style={styles.createBtn} onPress={() => setCreateVisible(true)}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.createBtnText}>Create Group</Text>
            </Pressable>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search groups..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              returnKeyType="search"
            />
          </View>

          {/* Groups list */}
          {loadingGroups ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={searchQuery ? discoverGroups : discoverGroups.filter(g => !g.is_member)}
              keyExtractor={(item) => item.id}
              renderItem={renderDiscoverGroup}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.md }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Feather name="users" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>No groups to discover</Text>
                  <Text style={styles.emptySubtitle}>Create one to get started!</Text>
                </View>
              }
            />
          )}

          {/* Join with invite code — tappable row, opens modal */}
          <Pressable
            style={[styles.joinRow, { marginBottom: Math.max(insets.bottom, 16) + 100 }]}
            onPress={() => setJoinModalVisible(true)}
          >
            <View style={styles.joinIconWrap}>
              <Feather name="key" size={16} color={colors.primary} />
            </View>
            <Text style={styles.joinRowText}>Join with Invite Code</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
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
          {loadingOrgs ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={orgsView === 'Mine' ? myOrgs : discoverOrgsList}
              keyExtractor={(item) => item.id}
              renderItem={renderOrgCard}
              extraData={requestedOrgIds}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.md }}
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

      {/* ── Join via Code Modal ── */}
      <Modal
        visible={joinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setJoinModalVisible(false); setInviteCode(''); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setJoinModalVisible(false); setInviteCode(''); }} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Join with Invite Code</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => { setJoinModalVisible(false); setInviteCode(''); }}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.joinModalSubtitle}>Enter the 8-character code shared by a group admin.</Text>
            <TextInput
              style={styles.joinModalInput}
              placeholder="e.g. ABC12345"
              placeholderTextColor={colors.textMuted}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              autoFocus
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleJoinViaCode}
            />
            <Pressable
              style={[styles.createGroupBtn, (!inviteCode.trim() || joiningCode) && styles.createGroupBtnDisabled]}
              onPress={handleJoinViaCode}
              disabled={!inviteCode.trim() || joiningCode}
            >
              {joiningCode ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createGroupBtnText}>Join Group</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Group Modal ── */}
      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setCreateVisible(false); setAvatarUri(null); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Tap outside to close */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setCreateVisible(false); setAvatarUri(null); }} />

          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Create Group</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => { setCreateVisible(false); setAvatarUri(null); }}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Avatar picker */}
            <Pressable style={styles.avatarRow} onPress={handlePickAvatar}>
              <View style={styles.avatarCircle}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
                ) : (
                  <Feather name="camera" size={22} color="#fff" />
                )}
              </View>
              <Text style={styles.addPhotoText}>{avatarUri ? 'Change Photo' : 'Add Photo'}</Text>
            </Pressable>

            {/* Group Name */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Group Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., Morning Workout Crew"
                placeholderTextColor={colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                maxLength={100}
              />
            </View>

            {/* Description */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMulti]}
                placeholder="Describe your group..."
                placeholderTextColor={colors.textMuted}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            {/* Privacy dropdown */}
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Privacy</Text>
              <Pressable style={styles.dropdown} onPress={() => setPrivacyOpen(!privacyOpen)}>
                <Text style={styles.dropdownValue}>
                  {newPrivacy === 'public' ? 'Public — Anyone can join' : 'Private — Approval required'}
                </Text>
                <Feather
                  name={privacyOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
              {privacyOpen && (
                <View style={styles.dropdownMenu}>
                  {([
                    { value: 'public', label: 'Public — Anyone can join' },
                    { value: 'private', label: 'Private — Approval required' },
                  ] as const).map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[styles.dropdownItem, newPrivacy === opt.value && styles.dropdownItemActive]}
                      onPress={() => { setNewPrivacy(opt.value); setPrivacyOpen(false); }}
                    >
                      <Text style={[styles.dropdownItemText, newPrivacy === opt.value && styles.dropdownItemTextActive]}>
                        {opt.label}
                      </Text>
                      {newPrivacy === opt.value && (
                        <Feather name="check" size={14} color={colors.primary} />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Create button */}
            <Pressable
              style={[styles.createGroupBtn, (!newName.trim() || creating) && styles.createGroupBtnDisabled]}
              onPress={handleCreateGroup}
              disabled={!newName.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createGroupBtnText}>Create Group</Text>
              )}
            </Pressable>
          </View>
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
    backgroundColor: colors.primary,
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
