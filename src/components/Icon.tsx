import type { ReactNode } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronRight, Church, CircleDollarSign, ClipboardCheck, Clock3, Command,
  BarChart3, Database, Download, FileText, Filter, HandCoins, Heart, HeartHandshake, House, Info, LayoutDashboard,
  LockKeyhole, LogOut, Menu, MessageSquareText, MoreHorizontal, Network, Pencil, Plus, Receipt, Route,
  Search, Send, Settings, ShieldCheck, Sparkles, Trash2, UserPlus, UserRound, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  activity: Activity, arrow: ArrowRight, 'arrow-down': ArrowDownRight, 'arrow-up': ArrowUpRight,
  bell: Bell, briefcase: BriefcaseBusiness, calendar: CalendarDays, chart: BarChart3, check: Check, 'check-circle': CheckCircle2,
  church: Church, chevron: ChevronDown, 'chevron-right': ChevronRight, 'circle-dollar': CircleDollarSign,
  clipboard: ClipboardCheck, clock: Clock3, command: Command, dashboard: LayoutDashboard, database: Database, download: Download, edit: Pencil, file: FileText,
  filter: Filter, giving: HandCoins, heart: Heart, 'heart-handshake': HeartHandshake, house: House, info: Info,
  layout: LayoutDashboard, lock: LockKeyhole, logout: LogOut, menu: Menu, messages: MessageSquareText,
  more: MoreHorizontal, network: Network, plus: Plus, receipt: Receipt, route: Route, search: Search,
  send: Send, settings: Settings, shield: ShieldCheck, sparkle: Sparkles, trash: Trash2, 'user-plus': UserPlus,
  user: UserRound, users: Users, wallet: Wallet, close: X,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, className }: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Component = icons[name] ?? Church;
  return <Component size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}

export function BrandMark({ children }: { children?: ReactNode }) {
  return <span className="brand-mark"><Icon name="sparkle" size={18} strokeWidth={2.2} />{children}</span>;
}
