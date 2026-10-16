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
  {
    label: 'Member portal',
    items: [
      { id: 'member-giving', label: 'Giving', description: 'Tithes, offerings, and giving history', icon: 'giving' },
      { id: 'member-updates', label: 'Church updates', description: 'Targeted announcements and messages', icon: 'messages' },
      { id: 'member-profile', label: 'My profile & household', description: 'Contact details and household information', icon: 'user' },
      { id: 'member-attendance', label: 'My attendance', description: 'Check-in history and service reminders', icon: 'clipboard' },
      { id: 'member-ministries', label: 'Ministries & serving', description: 'Discover groups and volunteer', icon: 'network' },
      { id: 'member-care', label: 'Prayer & care request', description: 'Privately request pastoral support', icon: 'heart' },
      { id: 'member-notifications', label: 'Notification preferences', description: 'Manage announcements and reminders', icon: 'bell' },
    ],
  },
  {
    label: 'Media team',
    items: [
      { id: 'media-library', label: 'Media library', description: 'Organize media assets and coverage', icon: 'file' },
      { id: 'media-team', label: 'Team assignments', description: 'Coordinate media volunteers', icon: 'users' },
      { id: 'media-equipment', label: 'Equipment', description: 'Track media equipment and readiness', icon: 'settings' },
      { id: 'media-run-sheet', label: 'Service run sheet', description: 'Plan service production cues', icon: 'clipboard' },
    ],
  },
];
