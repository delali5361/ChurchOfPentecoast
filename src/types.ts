export type PageId =
  | 'overview'
  | 'people'
  | 'visitors'
  | 'households'
  | 'structure'
  | 'attendance'
  | 'events'
  | 'finance'
  | 'communications'
  | 'pastoral-care'
  | 'reports'
  | 'administration'
  | 'member-giving'
  | 'member-updates'
  | 'member-profile'
  | 'member-attendance'
  | 'member-ministries'
  | 'member-care'
  | 'member-notifications'
  | 'media-library'
  | 'media-team'
  | 'media-equipment'
  | 'media-run-sheet';

export type PageSection = {
  label: string;
  items: {
    id: PageId;
    label: string;
    description: string;
    icon: string;
  }[];
};

export type ModuleSummary = {
  label: string;
  value: string;
  description: string;
  icon: string;
  tone: 'mint' | 'blue' | 'sand' | 'rose';
};

export type ModuleFeature = {
  title: string;
  description: string;
  icon: string;
};
