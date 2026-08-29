import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Empty, Loading, Muted, Screen, Title } from '../../components/ui';
import { RequestCard } from '../../components/RequestCard';
import { useApi, useSocketEvent } from '../../hooks/useApi';
import { useDialog } from '../../store/DialogContext';
import { useToast } from '../../store/ToastContext';
import { useT } from '../../store/CopyContext';
import { api, ApiError } from '../../api/client';
import { time } from '../../lib/chairTime';
import { space } from '../../theme';
import type { AgendaEntry, ConfirmResult } from '../../types';

/**
 * The decisions waiting on this chair.
 *
 * They used to sit under the day's agenda on Today, which put the one thing in
 * the portal with a person waiting on the other end behind a scroll. A tab
 * carries a count, and a count is the whole point: an artist should be able to
 * see there is somebody to answer without opening anything.
 *
 * Not tied to the day on screen either — a request for next Tuesday is still
 * owed an answer today, and hiding it behind a date picker is how it gets
 * forgotten.
 */
export function ArtistRequestsScreen() {
  const t = useT();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const [busy, setBusy] = useState(false);

  const { data: requests, loading, reload } = useApi<AgendaEntry[]>('/appointments/requests');

  const refresh = useCallback(() => reload(true), [reload]);
  useSocketEvent('appointment:created', refresh);
  useSocketEvent('appointment:status', refresh);

  const accept = async (request: AgendaEntry, durationMin: number, movedTo: string | null) => {
    setBusy(true);
    try {
      const res = await api.post<ConfirmResult>(`/appointments/${request.id}/confirm`, {
        durationMin,
        ...(movedTo ? { startsAt: movedTo } : {}),
      });
      const who = request.user?.name.split(' ')[0] ?? 'They';
      const when = movedTo
        ? `moved to ${time(res.appointment.startsAt)}, ${durationMin} min`
        : `in for ${durationMin} min`;
      /* Says how many others lost that slot, because accepting one request is
         quietly declining the rest and the artist should know it happened. */
      toast(
        res.declined
          ? `${who} ${when} · ${res.declined} other request${res.declined === 1 ? '' : 's'} declined`
          : `${who} ${when} ✓`,
      );
      refresh();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not accept that request', {
        title: 'Couldn’t accept it',
        icon: '🗓️',
      });
    } finally {
      setBusy(false);
    }
  };

  const decline = async (request: AgendaEntry) => {
    const who = request.user?.name.split(' ')[0] ?? 'this client';
    const ok = await confirm({
      title: `Turn down ${who}?`,
      /* One message whether or not a reward is riding on it. Anything the shop
         puts back on the client's card is put back either way, and saying so
         here would be telling the chair exactly what it is not told. */
      message: 'They’re told, and the time stays open for someone else.',
      icon: '🗓️',
      tone: 'danger',
      confirmLabel: 'Decline it',
      cancelLabel: 'Keep it waiting',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.post(`/appointments/${request.id}/decline`);
      toast(`Declined · ${who} has been told`);
      refresh();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Could not decline that request', {
        title: 'Couldn’t decline it',
        icon: '🗓️',
      });
    } finally {
      setBusy(false);
    }
  };

  const waiting = requests?.length ?? 0;

  return (
    <Screen>
      <Title>{t('artistRequests.title', 'Requests')}</Title>
      <Muted style={{ marginTop: 2 }}>
        {t(
          'artistRequests.subtitle',
          'Nothing is held until you accept. Two people can ask for the same time — whoever you take gets it, and the rest are told.',
        )}
      </Muted>

      {loading && !requests ? (
        <Loading label={t('artistRequests.loading', 'Looking for requests…')} />
      ) : !waiting ? (
        <View style={{ marginTop: space.xl }}>
          <Empty
            icon="✅"
            title={t('artistRequests.noneTitle', 'Nobody waiting')}
            hint={t('artistRequests.noneHint', 'New requests land here the moment they are sent.')}
          />
        </View>
      ) : (
        requests?.map((r) => (
          <RequestCard key={r.id} request={r} busy={busy} onAccept={accept} onDecline={decline} />
        ))
      )}
    </Screen>
  );
}
