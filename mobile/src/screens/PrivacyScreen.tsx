import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Between, Body, Card, Heading, Muted, Screen, Title } from '../components/ui';
import { useColors } from '../store/ThemeContext';
import {
  POLICY_CONTACT,
  POLICY_COPYRIGHT,
  POLICY_SECTIONS,
  POLICY_URL,
  type PolicyBlock,
} from '../lib/privacyPolicy';
import { space } from '../theme';

/**
 * The privacy policy, in full.
 *
 * Guideline 5.1.1 asks for the policy to be reachable inside the app, not only
 * as a URL in the store listing — so the text is here rather than behind a tap
 * that opens a browser. The published copy is still linked at the bottom for
 * anyone who wants the canonical one, or a copy they can send to somebody.
 *
 * Reached from Profile for a client and from More for an artist, because both
 * are people whose data this describes.
 */
function Block({ block }: { block: PolicyBlock }) {
  const c = useColors();

  if (block.kind === 'subheading') {
    return <Heading style={{ marginTop: space.lg }}>{block.text}</Heading>;
  }

  if (block.kind === 'list') {
    return (
      <View style={{ marginTop: space.sm }}>
        {block.items.map((item) => (
          <View key={item} style={{ flexDirection: 'row', marginTop: space.xs }}>
            {/* A drawn dot rather than a bullet character: the glyph varies by
                font and lands off the text baseline on Android. */}
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: c.accent,
                marginTop: 8,
                marginRight: space.md,
              }}
            />
            <Body style={{ flex: 1, lineHeight: 20 }}>{item}</Body>
          </View>
        ))}
      </View>
    );
  }

  return <Body style={{ marginTop: space.sm, lineHeight: 21 }}>{block.text}</Body>;
}

export function PrivacyScreen() {
  const c = useColors();

  return (
    <Screen>
      <Title>Privacy policy</Title>

      {POLICY_SECTIONS.map((section) => (
        <View key={section.number} style={{ marginTop: space.xl }}>
          <Heading style={{ fontSize: 16 }}>
            {section.number}. {section.title}
          </Heading>
          {section.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </View>
      ))}

      <Heading style={{ marginTop: space.xl, fontSize: 16 }}>18. Contact Us</Heading>
      <Body style={{ marginTop: space.sm, lineHeight: 21 }}>
        If you have questions, concerns, or requests regarding this Privacy Policy or your personal
        information, please contact us:
      </Body>
      <Card style={{ marginTop: space.md }}>
        {POLICY_CONTACT.map(([label, value], i) => (
          <Between
            key={label}
            style={{
              paddingVertical: space.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.line,
            }}
          >
            <Muted>{label}</Muted>
            <Body style={{ maxWidth: '60%', textAlign: 'right' }}>{value}</Body>
          </Between>
        ))}
      </Card>

      <Pressable
        onPress={() => Linking.openURL(POLICY_URL).catch(() => {})}
        accessibilityRole="link"
        accessibilityLabel="Open the published privacy policy in your browser"
        style={{ marginTop: space.xl }}
      >
        <Text style={{ color: c.accentInk, fontWeight: '700' }}>Read it on the web ›</Text>
      </Pressable>

      <Muted style={{ marginTop: space.lg, marginBottom: space.xxl }}>{POLICY_COPYRIGHT}</Muted>
    </Screen>
  );
}
