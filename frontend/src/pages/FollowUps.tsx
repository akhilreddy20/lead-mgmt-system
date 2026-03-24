import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function FollowUps() {
  const qc = useQueryClient();
  const { data: followUps, isLoading } = useQuery({ queryKey: ['followUps'], queryFn: () => api.get('/follow-ups').then(r => r.data) });

  const complete = async (id: string) => {
    await api.patch(`/follow-ups/${id}/complete`, { notes: 'Completed' });
    toast.success('Marked complete'); qc.invalidateQueries({ queryKey: ['followUps'] });
  };

  const statusColor = (s: string) => s === 'overdue' ? 'bg-red-100 text-red-700' : s === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Follow-ups</h1>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            {['Lead', 'Scheduled', 'Status', 'Created By', ''].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-500">{h}</th>)}
          </tr></thead>
          <tbody>{isLoading ? <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr> :
            followUps?.map((f: any) => (
              <tr key={f._id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3"><Link to={`/leads/${f.leadId?._id}`} className="text-brand-600 font-medium">{f.leadId?.name || '—'}</Link></td>
                <td className="px-4 py-3">{format(new Date(f.scheduledDate), 'MMM d, yyyy HH:mm')}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColor(f.status)}`}>{f.status}</span></td>
                <td className="px-4 py-3">{f.createdBy?.name}</td>
                <td className="px-4 py-3">{f.status !== 'completed' && <button onClick={() => complete(f._id)} className="text-green-600 text-xs font-medium">✓ Complete</button>}</td>
              </tr>
            ))
          }</tbody>
        </table>
      </div>
    </div>
  );
}
