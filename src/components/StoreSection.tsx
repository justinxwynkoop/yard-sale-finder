import React from 'react';
import { Text, View } from 'react-native';
import { Listing } from '../types';
import { StoreListingTile } from './StoreListingTile';

const INK = '#171513';

interface Props {
  name: string;
  listings: Listing[];
  onPressListing: (listing: Listing) => void;
}

export function StoreSection({ name, listings, onPressListing }: Props) {
  if (listings.length === 0) return null;

  return (
    <View style={{ paddingTop: 18 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: INK,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          paddingHorizontal: 16,
          marginBottom: 10,
        }}
      >
        {name}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: 16,
          gap: 10,
        }}
      >
        {listings.map((listing) => (
          <StoreListingTile
            key={listing.id}
            listing={listing}
            onPress={() => onPressListing(listing)}
          />
        ))}
      </View>
    </View>
  );
}
