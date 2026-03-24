import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ClipboardList, UserCheck, XCircle, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const { data } = useQuery({ queryKey: ['stats'], queryFn: () => api.get('/dashboard/stats').then(r => r.data) });
  if (!data) return <div>Loading...</div>;

  const cards = [
    { label: 'Total Leads', value: data.total, icon: ClipboardList, color: 'bg-blue-500' },
    { label: 'New Leads', value: data.newLeads, icon: ClipboardList, color: 'bg-emerald-500' },
    { label: 'Converted', value: data.converted, icon: UserCheck, color: 'bg-green-600' },
    { label: 'Lost', value: data.lost, icon: XCircle, color: 'bg-red-500' },
    { label: 'Overdue Follow-ups', value: data.overdueFollowUps, icon: AlertTriangle, color: 'bg-amber-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className={`${c.color} text-white p-2 rounded-lg`}><c.icon size={20} /></div>
              <div><div className="text-2xl font-bold">{c.value}</div><div className="text-xs text-gray-500">{c.label}</div></div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">By Source</h2>
          <div className="space-y-2">{data.bySource.map((s: any) => (
            <div key={s._id} className="flex justify-between items-center"><span className="capitalize">{s._id || 'Unknown'}</span><span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-sm font-medium">{s.count}</span></div>
          ))}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">By Status</h2>
          <div className="space-y-2">{data.byStatus.map((s: any) => (
            <div key={s._id} className="flex justify-between items-center"><span className="capitalize">{s._id?.replace('_', ' ')}</span><span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm font-medium">{s.count}</span></div>
          ))}</div>
        </div>
      </div>
    </div>
  );
}
