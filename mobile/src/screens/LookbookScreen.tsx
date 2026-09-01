import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Badge,
  Body,
  Button,
  Card,
  Empty,
  Loading,
  Muted,
  Row,
  Screen,
  Title,
} from '../components/ui';
import { useApi, useSocketEvent } from '../hooks/useApi';
import { useRequireAuth } from '../lib/requireAuth';
import { useColors } from '../store/ThemeContext';
import { useToast } from '../store/ToastContext';
import { useDialog } from '../store/DialogContext';
import { api, ApiError } from '../api/client';
import { absoluteUrl } from '../config';
import { radius, space } from '../theme';
import type { StyleLook } from '../types';
import { useT } from '../store/CopyContext';

const CATEGORIES = ['All', 'Fades', 'Classic', 'Textured', 'Beard', 'Design'] as const;

/** The client-facing lookbook — real work from the shop's chairs. */
export function LookbookScreen() {
  const c = useColors();
  const t = useT();
  const requireAuth = useRequireAuth();
  const nav = useNavigation<any>();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [savedOnly, setSavedOnly] = useState(false);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (category !== 'All') params.set('category', category);
    if (savedOnly) params.set('saved', 'true');
    const qs = params.toString();
    return `/styles${qs ? `?${qs}` : ''}`;
  }, [category, savedOnly]);

  const { data: looks, loading, setData, reload: reloadLooks } = useApi<StyleLook[]>(path);

  /* A style approved, withdrawn or re-photographed in the back office. The
     saved-hearts are held in the same rows, so this re-reads rather than
     patching — the server is the one that knows what is published now. */
  useSocketEvent('lookbook:changed', () => reloadLooks(true));

  const toggleSave = async (look: StyleLook) => {
    /* A saved look belongs to somebody, so this is the one thing on an
       otherwise open screen that needs an account. Asked before the heart
       flips, or it would fill in and then quietly undo itself. */
    if (!requireAuth(t('auth.reasonSave', 'Sign in to save looks to your lookbook.'))) return;

    /* Flip it locally first — a heart that waits on the network feels broken. */
    setData((looks ?? []).map((l) => (l.id === look.id ? { ...l, saved: !l.saved } : l)));
    try {
      const res = await api.post<{ saved: boolean }>(`/styles/${look.id}/save`);
      toast(res.saved ? 'Saved to your lookbook' : 'Removed');
    } catch (err) {
      setData((looks ?? []).map((l) => (l.id === look.id ? { ...l, saved: look.saved } : l)));
      showError(err instanceof ApiError ? err.message : 'Could not save that', {
        title: 'Couldn’t save the look',
        icon: '🖼️',
      });
    }
  };

  return (
    <Screen>
      <Title>{t('lookbook.styles', 'Styles')}</Title>
      <Muted style={{ marginTop: 2 }}>{t('lookbook.realWorkFromOur', 'Real work from our chairs · tap to book the look')}</Muted>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
        {CATEGORIES.map((cat) => {
          const active = !savedOnly && cat === category;
          return (
            <Pressable
              key={cat}
              onPress={() => {
                setCategory(cat);
                setSavedOnly(false);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: active ? c.accent : c.surface2,
                borderColor: active ? c.accent : c.line,
                borderWidth: 1,
              }}
            >
              <Text style={{ color: active ? c.onAccent : c.text, fontWeight: active ? '700' : '500', fontSize: 13 }}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setSavedOnly((v) => !v)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: savedOnly ? c.accent : c.surface2,
            borderColor: savedOnly ? c.accent : c.line,
            borderWidth: 1,
          }}
        >
          <Text style={{ color: savedOnly ? c.onAccent : c.text, fontWeight: savedOnly ? '700' : '500', fontSize: 13 }}>
            ♥ Saved
          </Text>
        </Pressable>
      </View>

      {loading && !looks ? (
        <Loading />
      ) : !looks?.length ? (
        <View style={{ marginTop: space.lg }}>
          <Empty
            icon="🖼️"
            title={savedOnly ? 'Nothing saved yet' : 'No looks here yet'}
            hint={savedOnly ? 'Tap the heart on a cut to keep it.' : 'Your artists post their work here.'}
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg }}>
          {looks.map((look) => {
            const image = absoluteUrl(look.images?.[0]);
            return (
              <View key={look.id} style={{ width: '48%' }}>
                <View
                  style={{
                    backgroundColor: c.surface,
                    borderColor: c.line,
                    borderWidth: 1,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ aspectRatio: 3 / 4, backgroundColor: c.surface3 }}>
                    {image ? (
                      <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 40 }}>✂️</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => toggleSave(look)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={look.saved ? 'Remove from saved' : 'Save this look'}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16, color: look.saved ? '#ff6b6b' : '#fff' }}>
                        {look.saved ? '♥' : '♡'}
                      </Text>
                    </Pressable>
                    <Badge
                      label={`${look.durationMin} min`}
                      tone="dim"
                      style={{ position: 'absolute', bottom: 8, right: 8 }}
                    />
                  </View>

                  <View style={{ padding: space.md - 1 }}>
                    <Body style={{ fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                      {look.title}
                    </Body>
                    <Muted style={{ fontSize: 11, marginTop: 3 }}>
                      {look.category} · from ${look.price}
                    </Muted>
                    {!!look.artist?.displayName && (
                      <Muted style={{ fontSize: 11, marginTop: 2 }}>{look.artist.displayName}</Muted>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Button
        title={t('lookbook.bookACut', 'Book a cut')}
        onPress={() => nav.navigate('Tabs', { screen: 'Book' })}
        style={{ marginTop: space.xl }}
      />
    </Screen>
  );
}
