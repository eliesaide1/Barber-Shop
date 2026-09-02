/**
 * The privacy policy, as published.
 *
 * Carried in the app rather than fetched, because guideline 5.1.1 asks for it
 * "within the app in an easily accessible manner" — and a screen that needs the
 * network is not accessible on the aeroplane, on a dead connection, or on the
 * reviewer's device when the server happens to be redeploying.
 *
 * The canonical copy lives at POLICY_URL and this is a transcription of it.
 * When one changes the other has to change with it: a policy that disagrees
 * with itself is worse than one that is merely out of date.
 */

export const POLICY_URL = 'https://eliesaide1.github.io/barber-shop-privacyandpolicy/';

export type PolicyBlock =
  | { kind: 'text'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'list'; items: string[] };

export interface PolicySection {
  number: number;
  title: string;
  blocks: PolicyBlock[];
}

const t = (text: string): PolicyBlock => ({ kind: 'text', text });
const sub = (text: string): PolicyBlock => ({ kind: 'subheading', text });
const ul = (items: string[]): PolicyBlock => ({ kind: 'list', items });

export const POLICY_SECTIONS: PolicySection[] = [
  {
    number: 1,
    title: 'Introduction',
    blocks: [
      t('Welcome to VIA Barber House.'),
      t(
        'This Privacy Policy explains how VIA Barber House (“we,” “us,” or “our”) collects, uses, stores, and protects information when you use our mobile application, website, and related services.',
      ),
      t(
        'By using our application or services, you acknowledge the practices described in this Privacy Policy.',
      ),
    ],
  },
  {
    number: 2,
    title: 'Information We Collect',
    blocks: [
      t('Depending on how you use our application, we may collect the following information:'),
      sub('Personal Information'),
      t(
        'When you create an account, book an appointment, or use our services, we may collect:',
      ),
      ul([
        'Full name',
        'Email address',
        'Phone number',
        'Profile information',
        'Account credentials',
        'Appointment and booking information',
        'Preferred barber or service',
        'Booking history',
        'Any information you voluntarily provide to us',
      ]),
      sub('Device and Technical Information'),
      t('We may automatically collect certain technical information, including:'),
      ul([
        'Device type',
        'Operating system',
        'App version',
        'IP address',
        'Device identifiers',
        'Application usage information',
        'Crash and diagnostic information',
      ]),
      t(
        'This information may be used to maintain, secure, troubleshoot, and improve the application.',
      ),
    ],
  },
  {
    number: 3,
    title: 'How We Use Your Information',
    blocks: [
      t('We may use the information we collect to:'),
      ul([
        'Create and manage your account',
        'Allow you to book, modify, or cancel appointments',
        'Manage barber availability and schedules',
        'Send appointment confirmations and reminders',
        'Provide customer support',
        'Communicate important information regarding your bookings',
        'Improve the performance and functionality of our application',
        'Maintain the security of our application',
        'Prevent fraud or misuse',
        'Comply with applicable legal requirements',
      ]),
      t(
        'Where permitted and with any consent required by applicable law, we may also send you promotional messages, special offers, discounts, or information about our services.',
      ),
      t('You may opt out of marketing communications at any time.'),
    ],
  },
  {
    number: 4,
    title: 'Appointment Information',
    blocks: [
      t(
        'When you book an appointment through the application, we may store information such as:',
      ),
      ul([
        'Selected barber',
        'Selected service',
        'Appointment date and time',
        'Appointment status',
        'Booking history',
        'Notes associated with the appointment, if applicable',
      ]),
      t(
        'This information is used to manage appointments and provide the requested barber shop services.',
      ),
    ],
  },
  {
    number: 5,
    title: 'Payment Information',
    blocks: [
      t(
        'All payments for services booked through the VIA Barber House mobile application are made in cash directly at the barber shop.',
      ),
      t('The application does not process online payments and does not collect or store:'),
      ul([
        'Credit card information',
        'Debit card information',
        'Bank account information',
        'Digital wallet information',
        'Other financial or payment credentials',
      ]),
      t(
        'The application may display the price of the selected service or appointment, but payment is completed in cash at the barber shop.',
      ),
      t(
        'If online payment options are introduced in the future, this Privacy Policy will be updated accordingly.',
      ),
    ],
  },
  {
    number: 6,
    title: 'Notifications',
    blocks: [
      t(
        'With your permission, the application may send push notifications regarding:',
      ),
      ul([
        'Appointment confirmations',
        'Appointment reminders',
        'Booking changes or cancellations',
        'Barber availability',
        'Promotions and special offers',
        'Important application updates',
      ]),
      t('You can disable push notifications through your device settings at any time.'),
    ],
  },
  {
    number: 7,
    title: 'Location Information',
    blocks: [
      t(
        'If the application includes location-based functionality, we may request permission to access your device’s location.',
      ),
      t('Location information may be used to help you:'),
      ul([
        'Find nearby barber shop branches',
        'View relevant branch information',
        'Access location-based services',
      ]),
      t(
        'We will only access location information according to the permissions you grant through your device.',
      ),
      t(
        'You may disable location access at any time through your device settings, although certain location-based features may then become unavailable.',
      ),
    ],
  },
  {
    number: 8,
    title: 'Camera and Photo Library',
    blocks: [
      t(
        'If the application provides features that require photos, such as uploading a profile picture or hairstyle reference, we may request permission to access your camera or photo library.',
      ),
      t('We will use this access only to provide the functionality requested by you.'),
      t('You may manage these permissions through your device settings.'),
    ],
  },
  {
    number: 9,
    title: 'How We Share Information',
    blocks: [
      t('We do not sell or rent your personal information.'),
      t('We may share information only when reasonably necessary with:'),
      ul([
        'Barbers or authorized staff who need the information to manage your appointment',
        'Service providers that help us operate our application or infrastructure',
        'Hosting and cloud service providers',
        'Notification providers',
        'Analytics and application monitoring providers',
        'Government authorities or other parties when required by applicable law',
      ]),
      t(
        'Third-party service providers are responsible for processing information according to their applicable contractual and legal obligations.',
      ),
    ],
  },
  {
    number: 10,
    title: 'Data Security',
    blocks: [
      t(
        'We take reasonable technical and organizational measures designed to protect personal information against:',
      ),
      ul([
        'Unauthorized access',
        'Unauthorized disclosure',
        'Loss',
        'Misuse',
        'Modification',
        'Destruction',
      ]),
      t(
        'However, no application, database, or internet transmission can be guaranteed to be completely secure.',
      ),
      t('Users are responsible for maintaining the confidentiality of their account credentials.'),
    ],
  },
  {
    number: 11,
    title: 'Data Retention',
    blocks: [
      t('We retain personal information only for as long as reasonably necessary to:'),
      ul([
        'Provide our services',
        'Maintain business and booking records',
        'Resolve disputes',
        'Prevent fraud or misuse',
        'Meet legal and regulatory requirements',
      ]),
      t(
        'When information is no longer required, we may delete or anonymize it in accordance with applicable requirements.',
      ),
    ],
  },
  {
    number: 12,
    title: 'Account and Data Deletion',
    blocks: [
      t('You may request the deletion of your account and associated personal information.'),
      t(
        'If account deletion is available directly within the application, you may follow the instructions provided in the account or settings section.',
      ),
      t('Alternatively, you may contact us at admin@apexlb.tech.'),
      t(
        'When an account is deleted, certain information may still be retained where required for legal, security, fraud-prevention, or legitimate business recordkeeping purposes.',
      ),
    ],
  },
  {
    number: 13,
    title: 'Your Privacy Rights',
    blocks: [
      t('Depending on the laws applicable to you, you may have the right to:'),
      ul([
        'Request access to your personal information',
        'Request correction of inaccurate information',
        'Request deletion of your personal information',
        'Withdraw consent where processing is based on consent',
        'Object to certain uses of your information',
        'Request information about how your data is processed',
      ]),
      t('To submit a privacy request, contact us using the information provided below.'),
    ],
  },
  {
    number: 14,
    title: 'Children’s Privacy',
    blocks: [
      t(
        'Our application is not intended for children who are not legally permitted to provide consent under applicable law.',
      ),
      t(
        'We do not knowingly collect personal information from children in violation of applicable legal requirements.',
      ),
      t(
        'If you believe that a child has provided personal information improperly, please contact us so that we can review and, where appropriate, delete the information.',
      ),
    ],
  },
  {
    number: 15,
    title: 'Third-Party Services',
    blocks: [
      t('Our application may use third-party services for functionality such as:'),
      ul([
        'Authentication',
        'Hosting',
        'Cloud storage',
        'Analytics',
        'Push notifications',
        'Maps and location services',
      ]),
      t(
        'These third parties may process information according to their own privacy policies. We encourage users to review the privacy practices of any relevant third-party services.',
      ),
    ],
  },
  {
    number: 16,
    title: 'Links to Other Websites',
    blocks: [
      t('Our application or website may contain links to third-party websites or services.'),
      t(
        'We are not responsible for the privacy practices, security, or content of third-party websites and services.',
      ),
    ],
  },
  {
    number: 17,
    title: 'Changes to This Privacy Policy',
    blocks: [
      t(
        'We may update this Privacy Policy periodically to reflect changes to our application, business practices, or legal obligations.',
      ),
      t(
        'When changes are made, the “Last Updated” date at the top of this Privacy Policy will be updated.',
      ),
      t(
        'Material changes may also be communicated through the application or other appropriate means.',
      ),
    ],
  },
];

/** The contact block, kept apart because it is rendered as rows rather than prose. */
export const POLICY_CONTACT: [string, string][] = [
  ['Barber shop', 'VIA Barber House'],
  ['Email', 'admin@apexlb.tech'],
  ['Phone', '+961 81 427 439'],
  ['Address', 'Qoubaiyat, Akkar'],
  ['Country', 'Lebanon'],
];

export const POLICY_COPYRIGHT = '© 2026 VIA Barber House. All rights reserved.';
