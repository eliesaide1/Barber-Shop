import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import {
  Badge,
  Between,
  Body,
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Loading,
  Muted,
  Row,
  Screen,
  Title,
} from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useColors } from '../../store/ThemeContext';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { api, ApiError } from '../../api/client';
import { absoluteUrl } from '../../config';
import { radius, space } from '../../theme';
import type { StyleCategory, StyleLook } from '../../types';

const CATEGORIES: StyleCategory[] = ['Fades', 'Classic', 'Textured', 'Beard', 'Design'];

const STATUS: Record<string, { tone: 'ok' | 'warn' | 'red'; label: string }> = {
  published: { tone: 'ok', label: 'PUBLISHED' },
  pending: { tone: 'warn', label: 'IN REVIEW' },
  rejected: { tone: 'red', label: 'NOT USED' },
};

/* The picker hands back a content:// uri plus the metadata fetch needs. */
const asUpload = (asset: Asset) => ({
  uri: asset.uri as string,
  name: asset.fileName ?? `cut-${Date.now()}.jpg`,
  type: asset.type ?? 'image/jpeg',
});

export function ArtistPortfolioScreen() {
  const c = useColors();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();

  const { data: looks, loading, reload } = useApi<StyleLook[]>('/styles/mine');

  const [photo, setPhoto] = useState<Asset | null>(null);
  const [form, setForm] = useState({ title: '', durationMin: '45', price: '25' });
  const [category, setCategory] = useState<StyleCategory>('Fades');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const fromCamera = await confirm({
      title: 'Add a photo',
      message: 'Shoot the cut now, or choose one you already took.',
      icon: '📸',
      confirmLabel: 'Take a photo',
      cancelLabel: 'Choose from gallery',
      /* Both buttons are real choices here, so tapping outside must not
         silently pick one — it cancels, and we check for that below. */
      dismissible: true,
    });

    /* `confirm` resolves false both for "gallery" and for a dismiss. Telling
       them apart matters, so the launcher itself reports a cancellation. */
    const result = fromCamera
      ? await launchCamera({ mediaType: 'photo', quality: 0.8, saveToPhotos: false })
      : await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 1 });

    if (result.didCancel) return;
    if (result.errorCode) {
      showError(
        result.errorMessage ?? 'The picker could not be opened. Check the app’s permissions.',
        { title: 'Couldn’t get a photo', icon: '📸' },
      );
      return;
    }
    const asset = result.assets?.[0];
    if (asset?.uri) setPhoto(asset);
  };

  const submit = async () => {
    if (!photo?.uri) {
      showError('Add a photo of the cut first.', { title: 'No photo yet', icon: '📸' });
      return;
    }
    if (form.title.trim().length < 2) {
      showError('Give the look a title so clients know what to ask for.', {
        title: 'Needs a title',
        icon: '✂️',
      });
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append('title', form.title.trim());
      body.append('category', category);
      body.append('durationMin', String(Number(form.durationMin) || 45));
      body.append('price', String(Number(form.price) || 0));
      /* React Native's FormData takes this shape for a file, not a Blob. */
      body.append('images', asUpload(photo) as unknown as Blob);

      await api.upload<StyleLook>('/styles', body);

      setPhoto(null);
      setForm({ title: '', durationMin: '45', price: '25' });
      toast('Submitted for shop approval');
      reload(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not upload that', {
        title: 'Upload failed',
        icon: '📸',
      });
    } finally {
      setBusy(false);
    }
  };

  const published = (looks ?? []).filter((l) => l.status === 'published').length;
  const inReview = (looks ?? []).filter((l) => l.status === 'pending').length;

  return (
    <Screen>
      <Title>Portfolio</Title>
      <Muted style={{ marginTop: 2 }}>Your work · the shop approves it before clients see it</Muted>

      <Row style={{ marginTop: space.lg, gap: space.md }}>
        {[
          { n: String(published), l: 'Published', accent: true },
          { n: String(inReview), l: 'In review' },
          { n: String(looks?.length ?? 0), l: 'Total' },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, padding: space.md }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: s.accent ? c.accentInk : c.text }}>
              {s.n}
            </Text>
            <Muted style={{ fontSize: 11, marginTop: 2 }}>{s.l}</Muted>
          </Card>
        ))}
      </Row>

      <Heading style={{ marginTop: space.xl }}>Add a cut</Heading>

      <Pressable onPress={pick} disabled={busy}>
        <Card
          style={{
            marginTop: space.sm,
            alignItems: 'center',
            paddingVertical: photo ? space.md : space.xxl,
            borderStyle: photo ? 'solid' : 'dashed',
            borderColor: photo ? c.accent : c.line,
          }}
        >
          {photo?.uri ? (
            <>
              <Image
                source={{ uri: photo.uri }}
                style={{ width: '100%', height: 220, borderRadius: radius.md }}
                resizeMode="cover"
              />
              <Muted style={{ marginTop: space.md }}>Tap to choose a different photo</Muted>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 34 }}>📸</Text>
              <Body style={{ fontWeight: '700', marginTop: space.sm }}>Photograph the cut</Body>
              <Muted style={{ marginTop: 4 }}>Or choose one from your gallery</Muted>
            </>
          )}
        </Card>
      </Pressable>

      <Field
        label="What is it?"
        value={form.title}
        onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
        placeholder="Mid skin fade — Hadi"
        maxLength={60}
      />

      <Muted style={{ marginTop: space.md, fontWeight: '600' }}>Category</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
        {CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: active ? c.accent : c.surface2,
                borderColor: active ? c.accent : c.line,
                borderWidth: 1,
              }}
            >
              <Text
                style={{ color: active ? c.onAccent : c.text, fontWeight: active ? '700' : '500', fontSize: 13 }}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Row style={{ gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Takes (min)"
            value={form.durationMin}
            onChangeText={(v) => setForm((f) => ({ ...f, durationMin: v.replace(/\D/g, '') }))}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="From ($)"
            value={form.price}
            onChangeText={(v) => setForm((f) => ({ ...f, price: v.replace(/\D/g, '') }))}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </Row>

      <Button
        title={busy ? 'Uploading…' : 'Submit for review'}
        onPress={submit}
        loading={busy}
        disabled={!photo}
        style={{ marginTop: space.lg }}
      />
      <Muted style={{ marginTop: space.sm, textAlign: 'center', fontSize: 11.5 }}>
        Make sure your client is happy for the photo to be posted.
      </Muted>

      <Heading style={{ marginTop: space.xl }}>Your uploads</Heading>

      {loading && !looks ? (
        <Loading />
      ) : !looks?.length ? (
        <View style={{ marginTop: space.sm }}>
          <Empty icon="🖼️" title="Nothing uploaded yet" hint="Your first cut will show up here." />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm }}>
          {looks.map((look) => {
            const meta = STATUS[look.status] ?? STATUS.pending;
            const image = absoluteUrl(look.images?.[0]);
            return (
              <View
                key={look.id}
                style={{
                  width: '48%',
                  backgroundColor: c.surface,
                  borderColor: c.line,
                  borderWidth: 1,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                }}
              >
                <View style={{ aspectRatio: 1, backgroundColor: c.surface3 }}>
                  {image ? (
                    <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 34 }}>✂️</Text>
                    </View>
                  )}
                  <Badge label={meta.label} tone={meta.tone} style={{ position: 'absolute', top: 8, left: 8 }} />
                </View>
                <View style={{ padding: space.md - 1 }}>
                  <Body style={{ fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                    {look.title}
                  </Body>
                  <Muted style={{ fontSize: 11, marginTop: 3 }}>
                    {look.category} · {look.durationMin} min · ${look.price}
                  </Muted>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
