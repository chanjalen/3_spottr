import React from 'react';
import MapView, { Marker } from 'react-native-maps';
import { StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { GymListItem } from '../../types/gym';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GymsStackParamList } from '../../navigation/types';

const DEFAULT_REGION = {
  latitude: 40.115,
  longitude: -88.235,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

type Props = {
  gyms: GymListItem[];
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymList'>;
};

export default function GymMap({ gyms, navigation }: Props) {
  const withCoords = gyms.filter(g => g.latitude && g.longitude);
  const mapRegion = (() => {
    if (withCoords.length === 0) return DEFAULT_REGION;
    const lat = parseFloat(withCoords[0].latitude!);
    const lng = parseFloat(withCoords[0].longitude!);
    return { latitude: lat, longitude: lng, latitudeDelta: 0.15, longitudeDelta: 0.15 };
  })();

  return (
    <MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
      {withCoords.map(g => (
        <Marker
          key={g.id}
          coordinate={{ latitude: parseFloat(g.latitude!), longitude: parseFloat(g.longitude!) }}
          title={g.name}
          description={g.address ?? undefined}
          pinColor={colors.primary}
          onCalloutPress={() => navigation.navigate('GymDetail', { gymId: g.id, gymName: g.name })}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 220,
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
});
