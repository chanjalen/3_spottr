import React from 'react';
import { GymListItem } from '../../types/gym';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GymsStackParamList } from '../../navigation/types';

type Props = {
  gyms: GymListItem[];
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymList'>;
};

export default function GymMap(_props: Props) {
  return null;
}
