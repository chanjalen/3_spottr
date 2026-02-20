import { useState, useCallback, useEffect, useRef } from 'react';
import { FeedItem } from '../types/feed';
import { FeedTab } from '../components/common/FeedTabs';
import { fetchFeed, searchFeed } from '../api/feed';
import { searchUsers } from '../api/accounts';
import { UserSearchResult } from '../types/user';
import { SAMPLE_FEED } from '../utils/sampleData';

const USE_SAMPLE_DATA = false;

export interface FeedSearchResults {
  users: UserSearchResult[];
  posts: FeedItem[];
}

export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>(USE_SAMPLE_DATA ? SAMPLE_FEED : []);
  const [activeTab, setActiveTab] = useState<FeedTab>('main');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedSearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFeed = useCallback(async (tab: FeedTab) => {
    if (USE_SAMPLE_DATA) {
      const filtered =
        tab === 'friends'
          ? SAMPLE_FEED.filter((i) => i.visibility === 'friends')
          : SAMPLE_FEED;
      setItems(filtered);
      setNextCursor('');
      return;
    }

    setIsLoading(true);
    try {
      const { items: data, nextCursor: cursor } = await fetchFeed(tab);
      setItems(data);
      setNextCursor(cursor);
    } catch {
      // Keep existing items on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial feed on mount
  useEffect(() => {
    loadFeed('main');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore || isLoading) return;

    setIsLoadingMore(true);
    try {
      const { items: data, nextCursor: cursor } = await fetchFeed(activeTab, nextCursor);
      setItems((prev) => [...prev, ...data]);
      setNextCursor(cursor);
    } catch {
      // ignore
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, isLoading, activeTab]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadFeed(activeTab);
    setIsRefreshing(false);
  }, [activeTab, loadFeed]);

  const changeTab = useCallback(
    (tab: FeedTab) => {
      setActiveTab(tab);
      setSearchQuery('');
      setSearchResults(null);
      loadFeed(tab);
    },
    [loadFeed],
  );

  const updateItem = useCallback((id: string, updates: Partial<FeedItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  // Debounced search — fires 300ms after typing stops (matches web)
  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!q.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const [userData, postData] = await Promise.all([
          searchUsers(q.trim()).catch(() => []),
          searchFeed(q.trim()).catch(() => []),
        ]);
        setSearchResults({ users: userData, posts: postData });
      } catch {
        setSearchResults({ users: [], posts: [] });
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
  }, []);

  return {
    items,
    activeTab,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore: !!nextCursor,
    // search
    searchQuery,
    searchResults,
    isSearching,
    // actions
    refresh,
    changeTab,
    updateItem,
    loadMore,
    handleSearchChange,
    clearSearch,
  };
}
