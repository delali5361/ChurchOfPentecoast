import type { ModuleFeature, ModuleSummary, PageId } from '../types';

export type ModuleDefinition = {
  eyebrow: string;
  title: string;
  description: string;
  summaries: ModuleSummary[];
  features: ModuleFeature[];
  nextStep: string;
};

export const moduleDefinitions: Partial<Record<PageId, ModuleDefinition>> = {
  people: {
    eyebrow: 'People & membership',
    title: 'People',
    description: 'A thoughtful home for every member, leader, and worker in your church.',
    summaries: [
      { label: 'Member profiles', value: 'Ready to organize', description: 'One complete record per person', icon: 'users', tone: 'mint' },
      { label: 'Membership journey', value: 'Easy to follow', description: 'Visitor to newcomer to member', icon: 'route', tone: 'blue' },
      { label: 'Member history', value: 'Built for context', description: 'Keep important changes together', icon: 'history', tone: 'sand' },
    ],
    features: [
      { title: 'People directory', description: 'Find members, leaders, and workers with a useful, searchable directory.', icon: 'users' },
      { title: 'Complete profiles', description: 'Keep contact, church, baptism, and membership information together.', icon: 'contact' },
      { title: 'Membership journeys', description: 'See the path from first visit through integration and membership.', icon: 'route' },
      { title: 'Member history', description: 'Preserve status changes, ministry moves, and service assignments.', icon: 'history' },
    ],
    nextStep: 'Next: member profiles, directory search, and membership history.',
  },
  visitors: {
    eyebrow: 'First impressions & belonging',
    title: 'Visitors',
    description: 'Give every first-time guest a warm welcome and a clear next step.',
    summaries: [
      { label: 'Guest journeys', value: 'Thoughtfully connected', description: 'First visit through membership', icon: 'route', tone: 'mint' },
      { label: 'Follow-up', value: 'Ready to coordinate', description: 'Keep each next step visible', icon: 'heart', tone: 'blue' },
      { label: 'Welcome messages', value: 'Personal by design', description: 'Connect visitors with your team', icon: 'messages', tone: 'sand' },
    ],
    features: [
      { title: 'First-time guest records', description: 'Remember the service, campus, and contact preferences a guest shares.', icon: 'user-plus' },
      { title: 'Follow-up journeys', description: 'Coordinate personal welcomes and next steps with the right team.', icon: 'route' },
      { title: 'Visit history', description: 'Keep return visits and introductions connected to the same person.', icon: 'history' },
    ],
    nextStep: 'Next: capture guest details, record visits, and assign welcome follow-ups.',
  },
  households: {
    eyebrow: 'Families & relationships',
    title: 'Households',
    description: 'See the family connections that help your church care for people well.',
    summaries: [
      { label: 'Family records', value: 'Connected by design', description: 'Keep family members together', icon: 'house', tone: 'mint' },
      { label: 'Relationships', value: 'Clear and considered', description: 'Record household relationships', icon: 'heart', tone: 'blue' },
      { label: 'Shared contact', value: 'Respectful by default', description: 'Support family communication', icon: 'messages', tone: 'sand' },
    ],
    features: [
      { title: 'Family profiles', description: 'Group people into a household without losing each individual member profile.', icon: 'house' },
      { title: 'Relationships', description: 'Record parent, spouse, child, guardian, and other family relationships.', icon: 'network' },
      { title: 'Household communication', description: 'Make it easier to coordinate family-friendly updates and care.', icon: 'messages' },
    ],
    nextStep: 'Next: create households and link people with clear relationship types.',
  },
  structure: {
    eyebrow: 'Branches & ministry teams',
    title: 'Church structure',
    description: 'Bring campuses, departments, ministries, groups, and serving teams into focus.',
    summaries: [
      { label: 'Branches & campuses', value: 'Built for many locations', description: 'Keep local teams connected', icon: 'house', tone: 'mint' },
      { label: 'Ministry teams', value: 'Clear responsibilities', description: 'Connect departments and ministries', icon: 'network', tone: 'blue' },
      { label: 'Groups & workers', value: 'Grounded in community', description: 'Show leaders and serving teams', icon: 'users', tone: 'sand' },
    ],
    features: [
      { title: 'Branches & campuses', description: 'Keep locations, local contacts, and branch leadership in one place.', icon: 'house' },
      { title: 'Departments & ministries', description: 'Make ministry responsibilities and leadership visible.', icon: 'network' },
      { title: 'Groups & cells', description: 'Connect small groups to their campus, ministry, and leaders.', icon: 'users' },
      { title: 'Workers & assignments', description: 'Understand who serves, where they serve, and in what capacity.', icon: 'badge' },
    ],
    nextStep: 'Next: add branches, departments, ministries, groups, and worker assignments.',
  },
  attendance: {
    eyebrow: 'Services & gathering well',
    title: 'Attendance',
    description: 'Give your team a calm, clear way to record who gathered together.',
    summaries: [
      { label: 'Service sessions', value: 'Across every gathering', description: 'Sunday, midweek, prayer, and more', icon: 'clipboard', tone: 'mint' },
      { label: 'Attendee types', value: 'People-first records', description: 'Members, guests, children, and teams', icon: 'users', tone: 'blue' },
      { label: 'Attendance insights', value: 'Patterns with purpose', description: 'See trends by date and location', icon: 'chart', tone: 'sand' },
    ],
    features: [
      { title: 'Service sessions', description: 'Plan check-in for worship, prayer, meetings, and special events.', icon: 'calendar' },
      { title: 'Guest-friendly check-in', description: 'Record members, guests, children, workers, and leaders separately.', icon: 'clipboard' },
      { title: 'Attendance trends', description: 'Build useful views by branch, service, group, and time period.', icon: 'chart' },
    ],
    nextStep: 'Next: create a service session, check people in, and build attendance reports.',
  },
  events: {
    eyebrow: 'Gather, serve & celebrate',
    title: 'Events',
    description: 'Bring worship services, ministry gatherings, and special moments together.',
    summaries: [
      { label: 'Church calendar', value: 'One shared view', description: 'See what is coming up', icon: 'calendar', tone: 'mint' },
      { label: 'Event registrations', value: 'Welcoming by design', description: 'Plan ahead for your guests', icon: 'users', tone: 'blue' },
      { label: 'Service attendance', value: 'Connected to events', description: 'Compare registrations and turnout', icon: 'clipboard', tone: 'sand' },
    ],
    features: [
      { title: 'Church calendar', description: 'Plan service dates, ministry gatherings, conferences, and outreach.', icon: 'calendar' },
      { title: 'Registration', description: 'Understand who is coming and accommodate the details they share.', icon: 'contact' },
      { title: 'Event attendance', description: 'Connect expected attendance with real check-ins and follow-up.', icon: 'clipboard' },
    ],
    nextStep: 'Next: publish event details, registration, and service reminders.',
  },
  finance: {
    eyebrow: 'Generosity & stewardship',
    title: 'Finance',
    description: 'Keep giving, expenses, and commitments organized with care and accountability.',
    summaries: [
      { label: 'Giving & offerings', value: 'Permission-aware', description: 'Keep financial access intentional', icon: 'wallet', tone: 'mint' },
      { label: 'Expenses & approvals', value: 'Accountable records', description: 'Keep decisions traceable', icon: 'receipt', tone: 'blue' },
      { label: 'Pledges & statements', value: 'Clear commitments', description: 'Track progress with context', icon: 'chart', tone: 'sand' },
    ],
    features: [
      { title: 'Giving & tithes', description: 'Record gifts by category, method, date, and campus.', icon: 'wallet' },
      { title: 'Pledges & progress', description: 'Track commitments, contributions made, and remaining balances.', icon: 'chart' },
      { title: 'Expenses & approvals', description: 'Document spending and preserve approval decisions.', icon: 'receipt' },
      { title: 'Financial reports', description: 'Review giving and expenses with appropriate role restrictions.', icon: 'file' },
    ],
    nextStep: 'Next: role-restricted giving, expense approvals, pledges, and reconciled reports.',
  },
  communications: {
    eyebrow: 'Stories, care & connection',
    title: 'Communications',
    description: 'Share thoughtful updates with the people and teams who need them.',
    summaries: [
      { label: 'Church-wide updates', value: 'Right message, right people', description: 'Target audiences thoughtfully', icon: 'messages', tone: 'mint' },
      { label: 'Templates', value: 'Warm, consistent writing', description: 'Make common messages easier', icon: 'file', tone: 'blue' },
      { label: 'Delivery history', value: 'Accountable communication', description: 'Keep track of outcomes', icon: 'history', tone: 'sand' },
    ],
    features: [
      { title: 'Audience-aware messages', description: 'Reach the whole church, a campus, ministry, group, or selected members.', icon: 'users' },
      { title: 'Reusable templates', description: 'Keep welcome notes, event reminders, and announcements consistent.', icon: 'file' },
      { title: 'Delivery history', description: 'Know when messages were created, delivered, or need another look.', icon: 'history' },
    ],
    nextStep: 'Next: approved templates, audience selection, provider connections, and delivery records.',
  },
  'pastoral-care': {
    eyebrow: 'A private space to care',
    title: 'Pastoral care',
    description: 'Coordinate visits, prayer requests, counselling, and follow-ups with appropriate care.',
    summaries: [
      { label: 'Pastoral records', value: 'Restricted access', description: 'Sensitive notes stay protected', icon: 'lock', tone: 'rose' },
      { label: 'Visits & counselling', value: 'Care with context', description: 'Keep visits and sessions organized', icon: 'heart', tone: 'mint' },
      { label: 'Follow-up', value: 'Every next step matters', description: 'Support accountable, timely care', icon: 'check', tone: 'blue' },
    ],
    features: [
      { title: 'Visits & counselling', description: 'Keep sensitive care notes available only to appropriately authorized users.', icon: 'heart' },
      { title: 'Prayer requests', description: 'Respect each person’s privacy and requested level of sharing.', icon: 'lock' },
      { title: 'Care follow-ups', description: 'Assign a next step and due date without losing the human context.', icon: 'check' },
    ],
    nextStep: 'Next: enforce least-privilege access for visits, counselling, and private prayer requests.',
  },
  reports: {
    eyebrow: 'Insights for faithful leadership',
    title: 'Reports',
    description: 'Make thoughtful decisions with clear, permission-aware views of church life.',
    summaries: [
      { label: 'People & membership', value: 'Growth and belonging', description: 'Understand membership journeys', icon: 'users', tone: 'mint' },
      { label: 'Attendance patterns', value: 'Connection over time', description: 'See services and campus trends', icon: 'chart', tone: 'blue' },
      { label: 'Stewardship insights', value: 'Clear and protected', description: 'Respect financial permissions', icon: 'wallet', tone: 'sand' },
    ],
    features: [
      { title: 'Membership & visitors', description: 'Understand membership, newcomer follow-up, and branch distribution.', icon: 'users' },
      { title: 'Attendance & ministry', description: 'Explore service, campus, department, and small-group participation.', icon: 'chart' },
      { title: 'Giving & pledges', description: 'Review financial summaries only when your role allows access.', icon: 'wallet' },
      { title: 'Privacy-aware exports', description: 'Keep exported information within your authorized responsibilities.', icon: 'file' },
    ],
    nextStep: 'Next: connect report filters and exports to verified live data and permissions.',
  },
  administration: {
    eyebrow: 'Church workspace settings',
    title: 'Administration',
    description: 'Manage access, branches, preferences, and the operational health of your workspace.',
    summaries: [
      { label: 'Roles & permissions', value: 'Responsibility-led', description: 'Assign only the access teams need', icon: 'lock', tone: 'mint' },
      { label: 'Organization setup', value: 'Multi-campus ready', description: 'Keep church structure consistent', icon: 'network', tone: 'blue' },
      { label: 'Audit & data controls', value: 'Accountable by design', description: 'Preserve important activity', icon: 'history', tone: 'sand' },
    ],
    features: [
      { title: 'Users, roles & permissions', description: 'Assign role-specific access and protect pastoral and financial records.', icon: 'lock' },
      { title: 'Church configuration', description: 'Manage campuses, statuses, categories, and ministry structure.', icon: 'settings' },
      { title: 'Audit trail', description: 'Understand important changes to people and financial records.', icon: 'history' },
      { title: 'Privacy & retention', description: 'Keep data access, record retention, and operational controls visible.', icon: 'shield' },
    ],
    nextStep: 'Next: complete secure organization setup, admin controls, and audit review workflows.',
  },
};
