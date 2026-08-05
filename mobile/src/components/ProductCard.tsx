import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useColors } from '../store/ThemeContext';
import { radius, space } from '../theme';
import { absoluteUrl } from '../config';
import type { Product } from '../types';

export function ProductCard({
  product,
  onPress,
  onAdd,
  inCart = 0,
  width,
}: {
  product: Product;
  onPress: () => void;
  onAdd?: () => void;
  inCart?: number;
  width?: number;
}) {
  const c = useColors();
  const out = product.stock <= 0;
  const image = absoluteUrl(product.images?.[0]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        flex: width ? undefined : 1,
        backgroundColor: c.surface,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.lg,
        overflow: 'hidden',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ aspectRatio: 1, backgroundColor: c.surface3, alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 46 }}>{product.icon}</Text>
        )}

        {out ? (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>SOLD OUT</Text>
          </View>
        ) : (
          <>
            {!!product.tag && (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  borderRadius: radius.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 }}>
                  {product.tag}
                </Text>
              </View>
            )}
            {onAdd && (
              <Pressable
                onPress={onAdd}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name} to cart`}
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: inCart ? 14 : 19 }}>
                  {inCart || '+'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      <View style={{ padding: space.md - 1 }}>
        <Text numberOfLines={2} style={{ color: c.text, fontWeight: '700', fontSize: 13, lineHeight: 17, height: 34 }}>
          {product.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 10.5, marginTop: 3 }} numberOfLines={1}>
          {product.size}
          {product.owner ? ` · ${product.owner.displayName.split(' ')[0]}` : ' · FadeRoom'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>${product.price}</Text>
            {!!product.compareAtPrice && (
              <Text style={{ color: c.muted, fontSize: 12, textDecorationLine: 'line-through' }}>
                ${product.compareAtPrice}
              </Text>
            )}
          </View>
          <Text style={{ color: c.accentInk, fontSize: 11, fontWeight: '700' }}>★ {product.rating}</Text>
        </View>
      </View>
    </Pressable>
  );
}
