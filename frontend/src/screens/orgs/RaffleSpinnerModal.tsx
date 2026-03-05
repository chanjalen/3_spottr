import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/common/Avatar';
import { colors, spacing, typography } from '../../theme';
import {
  getRaffleEntries,
  drawRaffle,
  createAnnouncement,
  RaffleEntryUser,
} from '../../api/organizations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RaffleSpinResult {
  winnerId: string;
  winnerUsername: string;
  winnerDisplayName: string;
  winnerAvatarUrl: string | null;
}

interface Props {
  visible: boolean;
  orgId: string;
  raffleId: string;
  isAdmin: boolean;
  onClose: () => void;
  spinResult: RaffleSpinResult | null;
}

// ---------------------------------------------------------------------------
// Wheel helpers
// ---------------------------------------------------------------------------

const WHEEL_COLORS = [
  '#4FC3E0', '#A78BFA', '#F59E0B', '#34D399', '#F87171',
  '#60A5FA', '#FB923C', '#A3E635', '#E879F9', '#2DD4BF',
];

function sectorPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`;
}

interface WheelSlice {
  user: RaffleEntryUser;
  startAngle: number;
  endAngle: number;
  color: string;
  labelX: number;
  labelY: number;
  label: string;
}

function buildSlices(users: RaffleEntryUser[], cx: number, cy: number, r: number): WheelSlice[] {
  const total = users.reduce((s, u) => s + u.entries, 0);
  if (total === 0) return [];
  let angle = -Math.PI / 2; // start at top
  return users.map((u, i) => {
    const sweep = (u.entries / total) * 2 * Math.PI;
    const start = angle;
    const end = angle + sweep;
    const mid = (start + end) / 2;
    const labelR = r * 0.65;
    angle = end;
    return {
      user: u,
      startAngle: start,
      endAngle: end,
      color: WHEEL_COLORS[i % WHEEL_COLORS.length],
      labelX: cx + labelR * Math.cos(mid),
      labelY: cy + labelR * Math.sin(mid),
      label: u.display_name.slice(0, 8),
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RaffleSpinnerModal({
  visible,
  orgId,
  raffleId,
  isAdmin,
  onClose,
  spinResult,
}: Props) {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<RaffleEntryUser[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<RaffleSpinResult | null>(null);
  const [postingToChat, setPostingToChat] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const currentAngle = useRef(0);

  const CX = 150, CY = 150, R = 130;

  // Load entries when modal opens
  useEffect(() => {
    if (!visible) return;
    setWinner(null);
    spinAnim.setValue(0);
    currentAngle.current = 0;
    setLoadingEntries(true);
    getRaffleEntries(orgId, raffleId)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoadingEntries(false));
  }, [visible, orgId, raffleId]);

  // When spinResult arrives via WS (or from draw), animate the wheel
  useEffect(() => {
    if (!spinResult || entries.length === 0) return;

    // Find winner slice
    const total = entries.reduce((s, u) => s + u.entries, 0);
    if (total === 0) return;
    let angle = -Math.PI / 2;
    let winnerMidAngle = 0;
    for (const u of entries) {
      const sweep = (u.entries / total) * 2 * Math.PI;
      if (u.user_id === spinResult.winnerId) {
        winnerMidAngle = angle + sweep / 2;
        break;
      }
      angle += sweep;
    }

    // Target: spin 8 full rotations + offset to land on winner
    // We negate because we want the winner sector to end up at the top (pointer)
    const fullRotations = 8 * 2 * Math.PI;
    const targetAngle = currentAngle.current + fullRotations + (Math.PI / 2 - winnerMidAngle);
    const animTarget = targetAngle / (2 * Math.PI); // in "full rotations" units for interpolation

    Animated.timing(spinAnim, {
      toValue: animTarget,
      duration: 3500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      currentAngle.current = targetAngle;
      setWinner(spinResult);
    });
  }, [spinResult]);

  const slices = buildSlices(entries, CX, CY, R);

  const spinRotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleSpin = useCallback(async () => {
    if (spinning || entries.length === 0) return;
    setSpinning(true);
    try {
      await drawRaffle(orgId, raffleId);
      // The WS spinResult will trigger the animation via useEffect above
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to draw raffle.');
    } finally {
      setSpinning(false);
    }
  }, [spinning, entries, orgId, raffleId]);

  const handlePostToChat = useCallback(async () => {
    if (!winner) return;
    setPostingToChat(true);
    try {
      await createAnnouncement(orgId, {
        content: `🏆 Raffle Winner: @${winner.winnerUsername}! Congratulations ${winner.winnerDisplayName}!`,
      });
    } catch {}
    setPostingToChat(false);
    onClose();
  }, [winner, orgId, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🎡 Raffle Spinner</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        {loadingEntries ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.hint}>Loading entries…</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={48} color={colors.textMuted} />
            <Text style={styles.hint}>No entries yet. Members earn entries by checking in or finishing a workout.</Text>
          </View>
        ) : (
          <>
            {/* Wheel */}
            <View style={styles.wheelContainer}>
              {/* Pointer triangle at top */}
              <View style={styles.pointer} />
              <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
                <Svg width={300} height={300}>
                  <G>
                    {slices.map((s, i) => (
                      <G key={i}>
                        <Path d={sectorPath(CX, CY, R, s.startAngle, s.endAngle)} fill={s.color} />
                        {slices.length < 20 && (
                          <SvgText
                            x={s.labelX}
                            y={s.labelY}
                            fontSize={10}
                            fill="#fff"
                            textAnchor="middle"
                            alignmentBaseline="middle"
                          >
                            {s.label}
                          </SvgText>
                        )}
                      </G>
                    ))}
                  </G>
                </Svg>
              </Animated.View>
            </View>

            {/* Entry count */}
            <Text style={styles.entryCount}>
              {entries.reduce((s, u) => s + u.entries, 0)} total entries · {entries.length} members
            </Text>

            {/* Winner reveal */}
            {winner ? (
              <View style={styles.winnerCard}>
                <Text style={styles.winnerLabel}>🎉 Winner!</Text>
                <Avatar uri={winner.winnerAvatarUrl} name={winner.winnerDisplayName} size={64} />
                <Text style={styles.winnerName}>{winner.winnerDisplayName}</Text>
                <Text style={styles.winnerUsername}>@{winner.winnerUsername}</Text>
                {isAdmin && (
                  <Pressable
                    style={[styles.postBtn, postingToChat && { opacity: 0.6 }]}
                    onPress={handlePostToChat}
                    disabled={postingToChat}
                  >
                    {postingToChat
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.postBtnText}>Post to Announcements</Text>
                    }
                  </Pressable>
                )}
              </View>
            ) : isAdmin ? (
              <Pressable
                style={[styles.spinBtn, (spinning || entries.length === 0) && { opacity: 0.5 }]}
                onPress={handleSpin}
                disabled={spinning || entries.length === 0}
              >
                {spinning
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.spinBtnText}>SPIN 🎡</Text>
                }
              </Pressable>
            ) : (
              <Text style={styles.hint}>Waiting for admin to spin…</Text>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: { padding: 6 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  wheelContainer: {
    alignItems: 'center',
    marginTop: spacing.md,
    position: 'relative',
  },
  pointer: {
    position: 'absolute',
    top: -10,
    zIndex: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#F59E0B',
  },
  entryCount: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  winnerCard: {
    marginTop: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: 20,
    padding: spacing.xl,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    width: '80%',
  },
  winnerLabel: {
    fontSize: typography.size.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  winnerName: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  winnerUsername: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  postBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  postBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: typography.size.sm,
  },
  spinBtn: {
    marginTop: spacing.lg,
    backgroundColor: '#A78BFA',
    borderRadius: 14,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    shadowColor: '#A78BFA',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  spinBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: typography.size.md,
    letterSpacing: 1,
  },
});
