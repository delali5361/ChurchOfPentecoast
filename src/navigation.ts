import type { PageSection } from './types';

export const pageSections: PageSection[] = [
  {
    label: 'Church life',
    items: [
      { id: 'overview', label: 'Overview', description: 'Your church at a glance', icon: 'layout' },
      { id: 'people', label: 'People', description: 'Members and their profiles', icon: 'users' },
      { id: 'visitors', label: 'Visitors', description: 'Welcome and follow-up journeys', icon: 'user-plus' },
      { id: 'households', label: 'Households', description: 'Families and relationships', icon: 'house' },
      { id: 'structure', label: 'Church structure', description: 'Branches and ministry teams', icon: 'network' },
    ],
  },
  {
    label: 'Ministry',
    items: [
      { id: 'attendance', label: 'Attendance', description: 'Services and check-in', icon: 'clipboard' },
      { id: 'events', label: 'Events', description: 'Services and gatherings', icon: 'calendar' },
      { id: 'communications', label: 'Communications', description: 'Messages and announcements', icon: 'messages' },
      { id: 'pastoral-care', label: 'Pastoral care', description: 'Private care and follow-ups', icon: 'heart' },
    ],
  },
  {
    label: 'Stewardship',
    items: [
      { id: 'finance', label: 'Finance', description: 'Giving, pledges, and expenses', icon: 'wallet' },
      { id: 'reports', label: 'Reports', description: 'Church insights and exports', icon: 'chart' },
      { id: 'administration', label: 'Administration', description: 'Settings and access control', icon: 'settings' },
    ],
  },
];
