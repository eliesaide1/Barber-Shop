import React from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../store/AuthContext';
import { useColors, useTheme } from '../store/ThemeContext';
import { useDialog } from '../store/DialogContext';
import { Body, Button, Card, Loading, Muted, Screen, Title } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { space } from '../theme';

import { LoginScreen, RegisterScreen } from '../screens/AuthScreens';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { DeviceScreen } from '../screens/DeviceScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { CompleteProfileScreen } from '../screens/CompleteProfileScreen';
import { HaircutsScreen } from '../screens/HaircutsScreen';
import { ContactFab } from '../components/ContactFab';
import { HomeScreen } from '../screens/HomeScreen';
import { BookScreen } from '../screens/BookScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { ShopScreen, ProductScreen, CartScreen } from '../screens/ShopScreens';
import { LoyaltyScreen } from '../screens/LoyaltyScreen';
import { LookbookScreen } from '../screens/LookbookScreen';
import {
  AppointmentsScreen,
  NotificationsScreen,
  PreferencesScreen,
  ProfileScreen,
} from '../screens/ProfileScreens';

import { ArtistScheduleScreen } from '../screens/artist/ScheduleScreen';
import { ArtistRequestsScreen } from '../screens/artist/RequestsScreen';
import { ArtistClientsScreen } from '../screens/artist/ClientsScreen';
import { ArtistCheckInScreen } from '../screens/artist/CheckInScreen';
import { ArtistMoreScreen, ArtistBroadcastScreen } from '../screens/artist/MoreScreen';
import { ArtistPortfolioScreen } from '../screens/artist/PortfolioScreen';
import { ArtistClientHistoryScreen } from '../screens/artist/ClientHistoryScreen';

import { useApi, useSocketEvent } from '../hooks/useApi';
import { useFirstLaunch } from '../lib/firstLaunch';
import { useT } from '../store/CopyContext';
import { navigationRef } from './ref';

import type { AgendaEntry } from '../types';
import type {
  ArtistStackParamList,
  ArtistTabParamList,
  RootStackParamList,
  TabParamList,
} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();
const ArtistStack = createNativeStackNavigator<ArtistStackParamList>();
const ArtistTabs = createBottomTabNavigator<ArtistTabParamList>();

/* Drawn icons rather than an icon font — react-native-svg is already in the
   bundle for the QR codes, so this costs nothing extra. The centre Scan tab is
   raised, because scanning is the one thing you do standing at the chair. */
const ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  Book: 'calendar',
  Scan: 'scan',
  Shop: 'bag',
  Profile: 'user',
};

/* The artist bar mirrors the client one: the raised centre button is the thing
   you do standing at the chair — for a client that's scanning, for an artist
   it's showing the code to scan. */
const ARTIST_ICONS: Record<keyof ArtistTabParamList, IconName> = {
  Today: 'calendar',
  Requests: 'bell',
  Clients: 'users',
  CheckIn: 'qr',
  More: 'more',
};

function TabIcon({ name, focused }: { name: keyof TabParamList; focused: boolean }) {
  const c = useColors();

  if (name === 'Scan') {
    return (
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          borderWidth: 4,
          borderColor: c.bg,
          shadowColor: c.accent,
          shadowOpacity: 0.4,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Icon name={ICONS.Scan} color={c.onAccent} size={26} active />
      </View>
    );
  }

  return <Icon name={ICONS[name]} color={focused ? c.accentInk : c.muted} active={focused} />;
}

function MainTabs() {
  const c = useColors();
  const t = useT();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accentInk,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      {/* Every tab names itself explicitly rather than falling back to the
          route name, so the shop can rename one without the route — and every
          navigate('Shop') in the app — moving with it. */}
      <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.home', 'Home') }} />
      <Tabs.Screen name="Book" component={BookScreen} options={{ tabBarLabel: t('tabs.book', 'Book') }} />
      <Tabs.Screen name="Scan" component={ScanScreen} options={{ tabBarLabel: t('tabs.scan', 'Scan') }} />
      <Tabs.Screen name="Shop" component={ShopScreen} options={{ tabBarLabel: t('tabs.shop', 'Shop') }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('tabs.profile', 'Profile') }} />
    </Tabs.Navigator>
  );
}

function ArtistTabIcon({ name, focused }: { name: keyof ArtistTabParamList; focused: boolean }) {
  const c = useColors();

  if (name === 'CheckIn') {
    return (
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          borderWidth: 4,
          borderColor: c.bg,
          shadowColor: c.accent,
          shadowOpacity: 0.4,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Icon name={ARTIST_ICONS.CheckIn} color={c.onAccent} size={26} active />
      </View>
    );
  }

  return <Icon name={ARTIST_ICONS[name]} color={focused ? c.accentInk : c.muted} active={focused} />;
}

function ArtistMainTabs() {
  const c = useColors();
  const t = useT();

  /* The count lives on the bar rather than inside the screen, because the whole
     reason requests moved out of Today is so an artist can see there is
     somebody to answer without opening anything. */
  const { data: requests, reload: reloadRequests } = useApi<AgendaEntry[]>('/appointments/requests');
  useSocketEvent('appointment:created', () => reloadRequests(true));
  useSocketEvent('appointment:status', () => reloadRequests(true));
  const waiting = requests?.length ?? 0;
  return (
    <ArtistTabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accentInk,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarIcon: ({ focused }) => <ArtistTabIcon name={route.name} focused={focused} />,
      })}
    >
      <ArtistTabs.Screen name="Today" component={ArtistScheduleScreen} options={{ tabBarLabel: t('artistTabs.today', 'Today') }} />
      <ArtistTabs.Screen
        name="Requests"
        component={ArtistRequestsScreen}
        options={{
          tabBarLabel: t('artistTabs.requests', 'Requests'),
          tabBarBadge: waiting || undefined,
          tabBarBadgeStyle: { backgroundColor: c.danger, fontSize: 11 },
        }}
      />
      {/* Check-in sits third of five on purpose: it is the raised button, and a
          raised button that is not in the middle looks like a mistake. */}
      <ArtistTabs.Screen name="CheckIn" component={ArtistCheckInScreen} options={{ tabBarLabel: t('artistTabs.checkIn', 'Check-in') }} />
      <ArtistTabs.Screen name="Clients" component={ArtistClientsScreen} options={{ tabBarLabel: t('artistTabs.clients', 'Clients') }} />
      <ArtistTabs.Screen name="More" component={ArtistMoreScreen} options={{ tabBarLabel: t('artistTabs.more', 'More') }} />
    </ArtistTabs.Navigator>
  );
}

/**
 * A shop admin has no chair and no loyalty card, so neither portal fits them —
 * the client app would show empty bookings and the artist portal would ask the
 * API for a check-in code it cannot mint. Rather than drop them into a broken
 * surface, say plainly where their tools are.
 */
function AdminNotice() {
  const t = useT();
  const { user, config, signOut } = useAuth();
  const { confirm } = useDialog();

  const confirmSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      icon: '👋',
      tone: 'danger',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    });
    if (ok) signOut();
  };

  return (
    <Screen style={{ flexGrow: 1, justifyContent: 'center' }}>
      <Card style={{ alignItems: 'center', paddingVertical: space.xxl }}>
        <Text style={{ fontSize: 42 }}>🖥️</Text>
        <Title style={{ marginTop: space.md, textAlign: 'center' }}>{t('nav.useTheBackOffice', 'Use the back office')}</Title>
        <Muted style={{ marginTop: space.sm, textAlign: 'center' }}>
          You’re signed in as a shop admin. Approving products, managing artists and
          broadcasting to the whole shop all live in the web back office.
        </Muted>
        <Body style={{ marginTop: space.lg, fontWeight: '700' }}>{user?.email}</Body>
        <Muted style={{ marginTop: 4 }}>{config?.shop.name}</Muted>
      </Card>
      <Button title={t('nav.signOut', 'Sign out')} variant="danger" onPress={confirmSignOut} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

export function RootNavigator() {
  const { user, isArtist, booting, profileComplete } = useAuth();
  const firstLaunch = useFirstLaunch();
  const t = useT();
  const isAdmin = user?.role === 'admin';
  const c = useColors();
  const { name } = useTheme();

  const navTheme = {
    ...(name === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(name === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.line,
      primary: c.accent,
    },
  };

  /* The flag is read from storage, so it arrives a frame or two after the
     first render. Waiting for it alongside the session keeps the sign-in
     screen from flashing up in front of the walkthrough. */
  if (booting || firstLaunch.state === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        <Loading label={t('nav.openingTheShop', 'Opening the shop…')} />
      </View>
    );
  }

  /* Only the client app. An artist messaging themselves is nonsense and an
     admin has no chair — but a visitor with no account is exactly who wants to
     ask the shop a question, so this is not gated on being signed in. With no
     session it falls back to the shop's own number. */
  const showContact =
    !isAdmin &&
    !isArtist &&
    (!user || profileComplete) &&
    /* Not over the introduction: it sits outside the navigators, so without
       this it paints over a screen that has not handed the app over yet. */
    !(!user && firstLaunch.state === 'first');

  return (
    <View style={{ flex: 1 }}>
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {!user && firstLaunch.state === 'first' ? (
        /* Swapped out rather than navigated away from: finishing the
           walkthrough is a change in what the app is showing, not a screen you
           can reverse into with a back gesture afterwards. */
        <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <RootStack.Screen name="Tabs">
            {() => <OnboardingScreen onDone={firstLaunch.complete} />}
          </RootStack.Screen>
        </RootStack.Navigator>
      ) : user && !profileComplete ? (
        /* A client whose card is only half filled. In front of the app rather
           than beside it: a client book that is only sometimes filled in is one
           no artist trusts. */
        <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <RootStack.Screen name="Tabs" component={CompleteProfileScreen} />
        </RootStack.Navigator>
      ) : user && isAdmin ? (
        <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <RootStack.Screen name="Tabs" component={AdminNotice} />
        </RootStack.Navigator>
      ) : user && isArtist ? (
        <ArtistStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <ArtistStack.Screen name="ArtistTabs" component={ArtistMainTabs} options={{ headerShown: false }} />
          <ArtistStack.Screen
            name="Broadcast"
            component={ArtistBroadcastScreen}
            options={{ title: t('screens.broadcast', 'Message clients') }}
          />
          <ArtistStack.Screen
            name="ClientHistory"
            component={ArtistClientHistoryScreen}
            options={{ title: t('screens.client', 'Client') }}
          />
          <ArtistStack.Screen
            name="Portfolio"
            component={ArtistPortfolioScreen}
            options={{ title: t('screens.portfolio', 'Portfolio') }}
          />
          <ArtistStack.Screen name="Device" component={DeviceScreen} options={{ title: t('screens.device', 'This device') }} />
          <ArtistStack.Screen name="Privacy" component={PrivacyScreen} options={{ title: t('screens.privacy', 'Privacy policy') }} />
          <ArtistStack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ title: t('screens.notifications', 'Notifications') }}
          />
        </ArtistStack.Navigator>
      ) : (
        /* Signed in or not, the same tabs.
        
           A visitor can see the barbers, the price list, the shelf and the
           lookbook. The moment they reach for something that belongs to a
           person — a booking, a stamp, a profile — they are sent to Login and
           returned to where they were.

           Apple 5.1.1(v): registration may only be required for account-based
           features, and a shop's shopfront is not one of them. */
        <RootStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
          <RootStack.Screen name="Product" component={ProductScreen} options={{ title: t('screens.product', 'Product') }} />
          <RootStack.Screen name="Cart" component={CartScreen} options={{ title: t('screens.cart', 'Cart') }} />
          <RootStack.Screen name="Loyalty" component={LoyaltyScreen} options={{ title: t('screens.loyalty', 'Loyalty card') }} />
          <RootStack.Screen name="Appointments" component={AppointmentsScreen} options={{ title: t('screens.appointments', 'Appointments') }} />
          <RootStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('screens.notifications', 'Notifications') }} />
          <RootStack.Screen name="Preferences" component={PreferencesScreen} options={{ title: t('screens.preferences', 'Preferences') }} />
          <RootStack.Screen name="Lookbook" component={LookbookScreen} options={{ title: t('screens.lookbook', 'Styles') }} />
          <RootStack.Screen name="Haircuts" component={HaircutsScreen} options={{ title: t('screens.haircuts', 'My haircuts') }} />
          <RootStack.Screen name="Device" component={DeviceScreen} options={{ title: t('screens.device', 'This device') }} />
          <RootStack.Screen name="Privacy" component={PrivacyScreen} options={{ title: t('screens.privacy', 'Privacy policy') }} />
          {/* Reached from wherever somebody was stopped, and dismissed back to
              it — not a wall the app starts behind. */}
          <RootStack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <RootStack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
        </RootStack.Navigator>
      )}
    {/* Outside the navigators, so it stays put while screens come and go rather
        than being remounted — and animates with nothing. Inside the container
        all the same: it reads appointments through `useApi`, which refetches on
        focus, and `useFocusEffect` has no navigation object to attach to out
        here. Absolutely positioned either way, so the layout is unchanged. */}
    {showContact && <ContactFab />}
    </NavigationContainer>
    </View>
  );
}
