/**
 * Pure-logic tests for the reaction_update useEffect handler used in
 * ChatScreen.tsx and GroupChatScreen.tsx.
 *
 * The useEffect contains this transformation:
 *
 *   prev.map(m =>
 *     !('isDivider' in m) && String(m.id) === data.message_id
 *       ? { ...m, reactions: data.reactions.map(r => ({
 *             emoji: r.emoji, count: r.count,
 *             user_reacted: r.reactor_ids.includes(myId),
 *           }))}
 *       : m,
 *   )
 *
 * We extract that logic into a pure function here so we can test every branch
 * without rendering React components.
 *
 * Run: npm test -- reactionUpdate
 */

import { Message, MessageReaction } from '../../../types/messaging';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Divider {
  isDivider: true;
  label: string;
}

type ListItem = Message | Divider;

interface ReactionUpdatePayload {
  message_id: string;
  reactions: Array<{ emoji: string; count: number; reactor_ids: string[] }>;
}

// ---------------------------------------------------------------------------
// The extracted transformation (mirrors ChatScreen / GroupChatScreen exactly)
// ---------------------------------------------------------------------------

function applyReactionUpdate(
  prev: ListItem[],
  data: ReactionUpdatePayload,
  myId: string,
): ListItem[] {
  return prev.map(m =>
    !('isDivider' in m) && String(m.id) === data.message_id
      ? {
          ...m,
          reactions: data.reactions.map(r => ({
            emoji: r.emoji,
            count: r.count,
            user_reacted: r.reactor_ids.includes(myId),
          })),
        }
      : m,
  );
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeMessage(id: string, reactions?: MessageReaction[]): Message {
  return {
    id,
    sender: 'user-sender',
    sender_username: 'alice',
    sender_avatar_url: null,
    content: 'hello',
    created_at: '2026-01-01T00:00:00Z',
    is_read: true,
    reactions: reactions ?? [],
  };
}

function makeDivider(label = 'Today'): Divider {
  return { isDivider: true, label };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyReactionUpdate — targeting the correct message', () => {
  it('updates reactions on the matching message', () => {
    const msg = makeMessage('msg-1');
    const result = applyReactionUpdate(
      [msg],
      { message_id: 'msg-1', reactions: [{ emoji: '👍', count: 1, reactor_ids: ['user-a'] }] },
      'user-z',
    );
    const updated = result[0] as Message;
    expect(updated.reactions).toHaveLength(1);
    expect(updated.reactions![0].emoji).toBe('👍');
    expect(updated.reactions![0].count).toBe(1);
  });

  it('does not modify a message whose id does not match', () => {
    const msg = makeMessage('msg-99', [{ emoji: '❤️', count: 1, user_reacted: false }]);
    const result = applyReactionUpdate(
      [msg],
      { message_id: 'msg-OTHER', reactions: [] },
      'user-z',
    );
    const unchanged = result[0] as Message;
    expect(unchanged.reactions).toEqual([{ emoji: '❤️', count: 1, user_reacted: false }]);
  });

  it('updates only the matching message when multiple messages exist', () => {
    const target = makeMessage('target-id');
    const other = makeMessage('other-id', [{ emoji: '🔥', count: 5, user_reacted: true }]);
    const divider = makeDivider();

    const result = applyReactionUpdate(
      [divider, other, target] as ListItem[],
      {
        message_id: 'target-id',
        reactions: [{ emoji: '👍', count: 2, reactor_ids: ['u1', 'u2'] }],
      },
      'u1',
    );

    // divider unchanged
    expect('isDivider' in result[0]).toBe(true);
    // other message unchanged
    const otherResult = result[1] as Message;
    expect(otherResult.reactions).toEqual([{ emoji: '🔥', count: 5, user_reacted: true }]);
    // target updated
    const targetResult = result[2] as Message;
    expect(targetResult.reactions![0].emoji).toBe('👍');
  });
});

describe('applyReactionUpdate — user_reacted computation', () => {
  it('sets user_reacted=true when myId is in reactor_ids', () => {
    const msg = makeMessage('msg-1');
    const myId = 'user-me';
    const result = applyReactionUpdate(
      [msg],
      { message_id: 'msg-1', reactions: [{ emoji: '💪', count: 1, reactor_ids: [myId] }] },
      myId,
    );
    const updated = result[0] as Message;
    expect(updated.reactions![0].user_reacted).toBe(true);
  });

  it('sets user_reacted=false when myId is NOT in reactor_ids', () => {
    const msg = makeMessage('msg-1');
    const myId = 'user-me';
    const result = applyReactionUpdate(
      [msg],
      {
        message_id: 'msg-1',
        reactions: [{ emoji: '👏', count: 2, reactor_ids: ['other-1', 'other-2'] }],
      },
      myId,
    );
    const updated = result[0] as Message;
    expect(updated.reactions![0].user_reacted).toBe(false);
  });

  it('computes user_reacted independently per emoji in the same message', () => {
    const msg = makeMessage('msg-1');
    const myId = 'me';
    const result = applyReactionUpdate(
      [msg],
      {
        message_id: 'msg-1',
        reactions: [
          { emoji: '👍', count: 2, reactor_ids: ['me', 'them'] },    // I reacted
          { emoji: '❤️', count: 1, reactor_ids: ['them'] },           // I did not react
        ],
      },
      myId,
    );
    const updated = result[0] as Message;
    expect(updated.reactions![0].user_reacted).toBe(true);   // 👍
    expect(updated.reactions![1].user_reacted).toBe(false);  // ❤️
  });
});

describe('applyReactionUpdate — edge cases', () => {
  it('clears all reactions when server sends an empty list', () => {
    const msg = makeMessage('msg-1', [{ emoji: '👍', count: 3, user_reacted: true }]);
    const result = applyReactionUpdate(
      [msg],
      { message_id: 'msg-1', reactions: [] },
      'me',
    );
    const updated = result[0] as Message;
    expect(updated.reactions).toEqual([]);
  });

  it('never modifies divider items', () => {
    const divider = makeDivider('Yesterday');
    const result = applyReactionUpdate(
      [divider],
      { message_id: 'any-id', reactions: [] },
      'me',
    );
    expect(result[0]).toEqual(divider);
  });

  it('preserves all other message fields (content, sender, etc.)', () => {
    const msg = makeMessage('msg-1');
    msg.content = 'original content';
    msg.sender = 'original-sender';

    const result = applyReactionUpdate(
      [msg],
      { message_id: 'msg-1', reactions: [{ emoji: '🙌', count: 1, reactor_ids: ['x'] }] },
      'me',
    );
    const updated = result[0] as Message;
    expect(updated.content).toBe('original content');
    expect(updated.sender).toBe('original-sender');
  });

  it('handles an empty messages array gracefully', () => {
    const result = applyReactionUpdate(
      [],
      { message_id: 'msg-1', reactions: [] },
      'me',
    );
    expect(result).toEqual([]);
  });

  it('handles multiple emojis from the server', () => {
    const msg = makeMessage('msg-1');
    const result = applyReactionUpdate(
      [msg],
      {
        message_id: 'msg-1',
        reactions: [
          { emoji: '🔥', count: 5, reactor_ids: ['u1', 'u2', 'u3', 'u4', 'u5'] },
          { emoji: '👍', count: 3, reactor_ids: ['u1', 'u2', 'u3'] },
          { emoji: '❤️', count: 1, reactor_ids: ['u1'] },
        ],
      },
      'u1',
    );
    const updated = result[0] as Message;
    expect(updated.reactions).toHaveLength(3);
    expect(updated.reactions!.every(r => r.user_reacted)).toBe(true); // u1 in all
  });
});
