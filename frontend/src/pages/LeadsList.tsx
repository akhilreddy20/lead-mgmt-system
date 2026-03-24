import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Lead } from '../types';
import { format } from 'date-fns';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700', contacted: 'bg-yellow-100 text-yellow-700', interested: 'bg-purple-100 text-purple-700',
  follow_up: 'bg-orange-100 text-orange-700', qualified: 'bg-cyan-100 text-cyan-700', counsellor_assigned: 'bg-indigo-100 text-indigo-700',
  converted: 'bg-green-100 text-green-700', lost: 'bg-red-100 text-red-700', escalated: 'bg-rose-100 text-rose-700',
};

export default function LeadsList() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', source: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['leads', page, filters],
    queryFn: () => api.get('/leads', { params: { page, ...filters } }).then(r => r.data),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        <Link to="/leads/new" className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">+ Add Lead</Link>
      </div>
      <div className="flex gap-3 mb-4">
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filters.status} onChange={e => { setFilters({...filters, status: e.target.value}); setPage(1); }}>
          <option value="">All Statuses</option>
          {['new','contacted','interested','follow_up','qualified','counsellor_assigned','converted','lost','escalated'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filters.source} onChange={e => { setFilters({...filters, source: e.target.value}); setPage(1); }}>
          <option value="">All Sources</option>
          {['ads','api','manual','website','referral'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            {['Name','Phone','Source','Status','Assigned To','Created',''].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-500">{h}</th>)}
          </tr></thead>
          <tbody>{isLoading ? <tr><td colSpan={7} className="text-center py-8">Loading...</td></tr> :
            data?.leads.map((l: Lead) => (
              <tr key={l._id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{l.name}</td>
                <td className="px-4 py-3">{l.phone}</td>
                <td className="px-4 py-3 capitalize">{l.source}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColors[l.status] || 'bg-gray-100'}`}>{l.status.replace('_',' ')}</span></td>
                <td className="px-4 py-3">{l.assignedTo?.name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{format(new Date(l.createdAt), 'MMM d, yyyy')}</td>
                <td className="px-4 py-3"><Link to={`/leads/${l._id}`} className="text-brand-600 hover:text-brand-700"><Eye size={16} /></Link></td>
              </tr>
            ))
          }</tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="p-1 disabled:opacity-30"><ChevronLeft size={20} /></button>
          <span className="text-sm">Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(p => p+1)} className="p-1 disabled:opacity-30"><ChevronRight size={20} /></button>
        </div>
      )}
    </div>
  );
}
