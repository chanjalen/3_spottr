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

type SocialTab = 'Messages' | 'Groups';

export default function SocialScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { optimisticDecrement, refresh: refreshUnread } = useUnreadCount();
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

  // ── Live WS updates for the chat list ────────────────────────────────────
  useEffect(() => {
    const handler = (msg: MessageType) => {
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
            unread_count: String(msg.sender) !== String(me?.id)
              ? conv.unread_count + 1
              : conv.unread_count,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
      } else if (msg.dm_recipient_id) {
        // DM message — figure out who the partner is, update that convo
        setDms(prev => {
          const partnerId = String(msg.sender) === String(me?.id)
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
            unread_count: String(msg.sender) !== String(me?.id)
              ? conv.unread_count + 1
              : conv.unread_count,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
      }
      // Keep the global unread badge in sync
      refreshUnread();
    };

    wsManager.on('new_message', handler);
    return () => wsManager.off('new_message', handler);
  }, [me?.id, loadMessages, refreshUnread]);

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

  const handleZap = async (partnerId: string, partnerName: string) => {
    if (zapping) return;
    setZapping(partnerId);
    try {
      await sendZap(partnerId);
      Alert.alert('Zapped!', `You zapped ${partnerName}!`);
    } catch (e: any) {
      Alert.alert('Cannot zap', e?.response?.data?.error ?? 'Something went wrong');
    } finally {
      setZapping(null);
    }
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
          {item.latest_message?.created_at && (
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
          onPress={() => handleZap(item.partner_id, item.partner_display_name)}
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
          {item.latest_message?.created_at && (
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
          {(['Messages', 'Groups'] as SocialTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={styles.tab}
              onPress={() => {
                if (tab === 'Groups' && activeTab !== 'Groups') {
                  setSearchQuery('');
                  setDiscoverGroups([]);
                  setLoadingGroups(true);
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
                onPress={() => Alert.alert('New Message', 'Coming soon')}
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
      ) : (
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
      )}

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
});
