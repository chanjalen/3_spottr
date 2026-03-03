import { DeviceEventEmitter } from 'react-native';

export const FEED_REFRESH_EVENT = 'spottr:feed:refresh';

/** Call this after a post is successfully created to trigger a feed refresh. */
export const emitFeedRefresh = () => DeviceEventEmitter.emit(FEED_REFRESH_EVENT);
