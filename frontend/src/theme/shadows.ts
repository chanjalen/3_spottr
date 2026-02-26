import { Platform } from 'react-native';

export const shadowsIOS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 60,
  },
  fab: {
    shadowColor: 'rgba(79, 195, 224, 0.5)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
} as const;

export const elevationAndroid = {
  sm: 1,
  md: 4,
  lg: 8,
  fab: 12,
} as const;

export const shadow = (level: 'sm' | 'md' | 'lg' | 'fab') => {
  if (Platform.OS === 'android') {
    return { elevation: elevationAndroid[level] };
  }
  return shadowsIOS[level];
};
