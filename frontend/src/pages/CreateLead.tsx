import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function CreateLead() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: 'manual', course: '', city: '' });
  const nav = useNavigate();
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post('/leads', form); toast.success('Lead created'); nav('/leads'); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Add New Lead</h1>
      <form onSubmit={submit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <input className="w-full border rounded-lg px-4 py-2" placeholder="Full Name *" value={form.name} onChange={e => set('name', e.target.value)} required />
        <input className="w-full border rounded-lg px-4 py-2" placeholder="Phone *" value={form.phone} onChange={e => set('phone', e.target.value)} required />
        <input className="w-full border rounded-lg px-4 py-2" placeholder="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        <select className="w-full border rounded-lg px-4 py-2" value={form.source} onChange={e => set('source', e.target.value)}>
          <option value="manual">Manual</option><option value="ads">Ads</option><option value="website">Website</option><option value="referral">Referral</option>
        </select>
        <input className="w-full border rounded-lg px-4 py-2" placeholder="Course" value={form.course} onChange={e => set('course', e.target.value)} />
        <input className="w-full border rounded-lg px-4 py-2" placeholder="City" value={form.city} onChange={e => set('city', e.target.value)} />
        <button className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Create Lead</button>
      </form>
    </div>
  );
}
