import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data) });

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/users/${id}/active`, { isActive: !isActive });
    toast.success('Updated'); qc.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b"><tr>
            {['Name', 'Email', 'Role', 'Active Leads', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-500">{h}</th>)}
          </tr></thead>
          <tbody>{isLoading ? <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr> :
            users?.map((u: any) => (
              <tr key={u._id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3">{u.currentLeadCount}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                <td className="px-4 py-3"><button onClick={() => toggleActive(u._id, u.isActive)} className="text-brand-600 text-xs font-medium">{u.isActive ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))
          }</tbody>
        </table>
      </div>
    </div>
  );
}
