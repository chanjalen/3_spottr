import { useState, useCallback } from 'react';
import { FeedItem } from '../types/feed';
import { FeedTab } from '../components/common/FeedTabs';
import { fetchFeed } from '../api/feed';
import { SAMPLE_FEED } from '../utils/sampleData';

const USE_SAMPLE_DATA = __DEV__;

export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>(USE_SAMPLE_DATA ? SAMPLE_FEED : []);
  const [activeTab, setActiveTab] = useState<FeedTab>('main');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadFeed = useCallback(async (tab: FeedTab) => {
    if (USE_SAMPLE_DATA) {
      const filtered =
        tab === 'friends'
          ? SAMPLE_FEED.filter((i) => i.visibility === 'friends')
          : SAMPLE_FEED;
      setItems(filtered);
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchFeed(tab);
      setItems(data);
    } catch {
      // Keep existing items on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadFeed(activeTab);
    setIsRefreshing(false);
  }, [activeTab, loadFeed]);

  const changeTab = useCallback(
    (tab: FeedTab) => {
      setActiveTab(tab);
      loadFeed(tab);
    },
    [loadFeed],
  );

  const updateItem = useCallback((id: number, updates: Partial<FeedItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  return {
    items,
    activeTab,
    isLoading,
    isRefreshing,
    refresh,
    changeTab,
    updateItem,
  };
}
