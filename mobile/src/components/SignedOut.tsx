import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Body, Button, Card, Muted, Screen, Title } from './ui';
import { useT } from '../store/CopyContext';
import { space } from '../theme';

/**
 * What a tab shows to somebody who has not signed in.
 *
 * Only two tabs need it — Scan and Profile — because only those are entirely
 * about one person. Everything else in the app is the shop's own shopfront and
 * is readable by anyone.
 *
 * It says what the tab is *for* rather than only that it is locked. "Sign in to
 * continue" tells somebody nothing about whether it is worth signing in; naming
 * the loyalty card or the booking history is the argument for making an account
 * at all.
 */
export function SignedOut({
  icon,
  title,
  hint,
  reason,
}: {
  icon: string;
  title: string;
  hint: string;
  /* Carried to the sign-in screen so it can say why it appeared. */
  reason: string;
}) {
  const nav = useNavigation<any>();
  const t = useT();

  return (
    <Screen style={{ flexGrow: 1, justifyContent: 'center' }}>
      <Card style={{ alignItems: 'center', paddingVertical: space.xxl }}>
        <Body style={{ fontSize: 42 }}>{icon}</Body>
        <Title style={{ marginTop: space.md, textAlign: 'center' }}>{title}</Title>
        <Muted style={{ marginTop: space.sm, textAlign: 'center' }}>{hint}</Muted>

        <View style={{ alignSelf: 'stretch', marginTop: space.xl }}>
          <Button
            title={t('signedOut.signIn', 'Sign in')}
            onPress={() => nav.navigate('Login', { reason })}
          />
          <Button
            title={t('signedOut.createAccount', 'Create an account')}
            variant="secondary"
            onPress={() => nav.navigate('Register')}
            style={{ marginTop: space.sm }}
          />
        </View>
      </Card>
    </Screen>
  );
}
