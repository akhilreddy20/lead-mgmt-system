import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, UserPlus, CalendarClock, LogOut, ClipboardList } from 'lucide-react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: ClipboardList },
  { to: '/leads/new', label: 'Add Lead', icon: UserPlus },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/users', label: 'Users', icon: Users, adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-brand-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-brand-700">Lead Manager</div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.filter(n => !n.adminOnly || user?.role === 'admin').map(n => (
            <Link key={n.to} to={n.to} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${loc.pathname === n.to ? 'bg-brand-700' : 'hover:bg-brand-700/50'}`}>
              <n.icon size={18} />{n.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-brand-700">
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-brand-100 capitalize">{user?.role}</div>
          <button onClick={logout} className="mt-2 flex items-center gap-2 text-sm text-brand-100 hover:text-white"><LogOut size={14} />Logout</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-surface-alt p-6"><Outlet /></main>
    </div>
  );
}
