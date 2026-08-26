import React, { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Body, Button, Card, Field, Muted, Row, Title } from './ui';
import { useColors } from '../store/ThemeContext';
import { useDialog } from '../store/DialogContext';
import { useToast } from '../store/ToastContext';
import { api, ApiError } from '../api/client';
import { radius, space } from '../theme';
import type { AgendaEntry } from '../types';
import { useT } from '../store/CopyContext';

/**
 * Photographing a finished cut, at the chair.
 *
 * Two things go up together, and the second is the one people underrate: the
 * picture shows what it looked like, the note says how it was done. Guard
 * numbers and where the fade started are what let somebody repeat it — a
 * photograph alone leaves the next artist guessing at the same result.
 *
 * Nothing here saves anything to a profile. It proposes, and the client
 * decides; the copy says so plainly, because an artist about to point a camera
 * at somebody should be able to tell them what happens to the picture.
 */
export function HaircutCapture({
  entry,
  onClose,
  onSent,
}: {
  entry: AgendaEntry;
  onClose: () => void;
  onSent: () => void;
}) {
  const c = useColors();
  const t = useT();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [photo, setPhoto] = useState<Asset | null>(null);
  const [notes, setNotes] = useState(entry.user?.preferences?.clipperGuard ?? '');
  const [busy, setBusy] = useState(false);

  const pick = async (fromCamera: boolean) => {
    const result = fromCamera
      ? await launchCamera({ mediaType: 'photo', quality: 0.8, saveToPhotos: false })
      : await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 1 });

    if (result.didCancel) return;
    if (result.errorCode) {
      showError(result.errorMessage ?? 'Could not open the camera', {
        title: 'Couldn’t take a photo',
        icon: '📷',
      });
      return;
    }
    const asset = result.assets?.[0];
    if (asset?.uri) setPhoto(asset);
  };

  const send = async () => {
    if (!photo?.uri || !entry.user) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('user', entry.user.id);
      body.append('appointment', entry.id);
      body.append('serviceName', entry.serviceName);
      if (notes.trim()) body.append('notes', notes.trim());
      /* React Native's FormData takes this shape for a file, not a Blob. */
      body.append('images', {
        uri: photo.uri,
        name: photo.fileName ?? 'cut.jpg',
        type: photo.type ?? 'image/jpeg',
      } as unknown as Blob);

      await api.upload('/haircuts', body);
      toast(`Sent to ${entry.user.name.split(' ')[0]} to approve`);
      onSent();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not send that', {
        title: 'Photo not sent',
        icon: '📷',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: space.lg,
            paddingBottom: space.xxl,
          }}
        >
          <Title>{t('haircutCapture.photographTheCut', 'Photograph the cut')}</Title>
          <Muted style={{ marginTop: 4 }}>
            {entry.user?.name ?? 'This client'} · {entry.serviceName}
          </Muted>

          <Pressable
            onPress={() => pick(true)}
            style={{
              marginTop: space.lg,
              height: 190,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.surface2,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {photo?.uri ? (
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <>
                <Text style={{ fontSize: 34 }}>📷</Text>
                <Body style={{ fontWeight: '700', marginTop: 6 }}>{t('haircutCapture.takeAPhoto', 'Take a photo')}</Body>
              </>
            )}
          </Pressable>

          <Row style={{ marginTop: space.sm, gap: space.md }}>
            <Button
              title={photo ? 'Retake' : 'Camera'}
              variant="ghost"
              compact
              style={{ flex: 1 }}
              onPress={() => pick(true)}
            />
            <Button
              title={t('haircutCapture.fromGallery', 'From gallery')}
              variant="ghost"
              compact
              style={{ flex: 1 }}
              onPress={() => pick(false)}
            />
          </Row>

          <Field
            label={t('haircutCapture.howYouDidIt', 'How you did it')}
            value={notes}
            onChangeText={setNotes}
            placeholder="#2 sides, scissor top, natural left part"
            multiline
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <Muted style={{ marginTop: 4, fontSize: 11.5 }}>{t('haircutCapture.theHalfAPhoto', 'The half a photo can’t carry — this is what lets anyone repeat it.')}</Muted>

          <Card style={{ marginTop: space.lg, backgroundColor: c.surface2 }}>
            <Muted style={{ lineHeight: 19 }}>
              It goes to {entry.user?.name.split(' ')[0] ?? 'them'} to approve. Until they say yes it
              is not saved to their profile, and if they say no it is deleted.
            </Muted>
          </Card>

          <Button
            title={t('haircutCapture.sendForApproval', 'Send for approval')}
            disabled={!photo}
            loading={busy}
            onPress={send}
            style={{ marginTop: space.lg }}
          />
          <Button title={t('haircutCapture.notNow', 'Not now')} variant="ghost" onPress={onClose} style={{ marginTop: space.sm }} />
        </View>
      </View>
    </Modal>
  );
}
