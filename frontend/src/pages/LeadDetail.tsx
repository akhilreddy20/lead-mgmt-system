import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Lead, ActivityLogEntry } from '../types';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700', contacted: 'bg-yellow-100 text-yellow-700', interested: 'bg-purple-100 text-purple-700',
  follow_up: 'bg-orange-100 text-orange-700', qualified: 'bg-cyan-100 text-cyan-700', counsellor_assigned: 'bg-indigo-100 text-indigo-700',
  converted: 'bg-green-100 text-green-700', lost: 'bg-red-100 text-red-700', escalated: 'bg-rose-100 text-rose-700',
};

const TRANSITIONS: Record<string, string[]> = {
  new: ['contacted', 'lost'], contacted: ['interested', 'follow_up', 'lost'], interested: ['qualified', 'follow_up', 'lost'],
  follow_up: ['contacted', 'interested', 'qualified', 'lost'], qualified: ['counsellor_assigned', 'lost'],
  counsellor_assigned: ['converted', 'lost', 'follow_up'], escalated: ['counsellor_assigned', 'lost'],
};

export default function LeadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [escalateForm, setEscalateForm] = useState({ counsellorId: '', reason: '' });
  const [reassignForm, setReassignForm] = useState({ assignTo: '', reason: '' });
  const [followUpDate, setFollowUpDate] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', file: null as File | null });

  const { data: lead, isLoading } = useQuery<Lead>({ queryKey: ['lead', id], queryFn: () => api.get(`/leads/${id}`).then(r => r.data) });
  const { data: activity } = useQuery<ActivityLogEntry[]>({ queryKey: ['activity', id], queryFn: () => api.get(`/leads/${id}/activity`).then(r => r.data) });
  const { data: payments } = useQuery({ queryKey: ['payments', id], queryFn: () => api.get(`/payments/lead/${id}`).then(r => r.data) });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data), enabled: user?.role === 'admin' || user?.role === 'counsellor' });
  const counsellors = users?.filter((u: any) => u.role === 'counsellor') || [];
  const allUsers = users || [];

  const refresh = () => { qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['activity', id] }); qc.invalidateQueries({ queryKey: ['payments', id] }); };

  const updateStatus = async (status: string) => {
    try { await api.patch(`/leads/${id}/status`, { status, version: lead!.version }); toast.success('Status updated'); refresh(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await api.post(`/leads/${id}/notes`, { text: note }); setNote(''); toast.success('Note added'); refresh();
  };

  const escalate = async () => {
    if (!escalateForm.counsellorId || !escalateForm.reason) return toast.error('Fill all fields');
    await api.patch(`/leads/${id}/escalate`, escalateForm); toast.success('Escalated'); setEscalateForm({ counsellorId: '', reason: '' }); refresh();
  };

  const reassign = async () => {
    if (!reassignForm.assignTo) return toast.error('Select user');
    await api.patch(`/leads/${id}/assign`, reassignForm); toast.success('Reassigned'); setReassignForm({ assignTo: '', reason: '' }); refresh();
  };

  const scheduleFollowUp = async () => {
    if (!followUpDate) return;
    await api.post('/follow-ups', { leadId: id, scheduledDate: followUpDate }); toast.success('Follow-up scheduled'); setFollowUpDate(''); refresh();
  };

  const submitPayment = async () => {
    const fd = new FormData();
    fd.append('leadId', id!); fd.append('amount', paymentForm.amount);
    if (paymentForm.file) fd.append('proof', paymentForm.file);
    await api.post('/payments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    toast.success('Payment added'); setPaymentForm({ amount: '', file: null }); refresh();
  };

  const verifyPayment = async (paymentId: string, status: string) => {
    await api.patch(`/payments/${paymentId}/verify`, { status });
    toast.success(`Payment ${status}`); refresh();
  };

  const convertToStudent = async () => {
    const verifiedPayment = payments?.find((p: any) => p.verificationStatus === 'verified');
    await api.post(`/leads/${id}/convert`, { paymentId: verifiedPayment?._id });
    toast.success('Converted to student!'); refresh();
  };

  if (isLoading || !lead) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            <div className="text-gray-500 text-sm mt-1">{lead.phone} · {lead.email || 'No email'} · {lead.course || 'No course'} · {lead.city || 'No city'}</div>
          </div>
          <span className={`px-3 py-1 rounded-lg text-sm font-medium capitalize ${statusColors[lead.status]}`}>{lead.status.replace('_', ' ')}</span>
        </div>
        <div className="flex gap-4 mt-4 text-xs text-gray-400">
          <span>Source: <strong className="capitalize">{lead.source}</strong></span>
          <span>Assigned: <strong>{lead.assignedTo?.name || 'Unassigned'}</strong></span>
          <span>Created: {format(new Date(lead.createdAt), 'MMM d, yyyy HH:mm')}</span>
          {lead.isLocked && <span className="text-red-500 font-bold">🔒 LOCKED</span>}
        </div>

        {/* Status transitions */}
        {!lead.isLocked && TRANSITIONS[lead.status]?.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            <span className="text-xs text-gray-400 self-center">Move to:</span>
            {TRANSITIONS[lead.status].map(s => (
              <button key={s} onClick={() => updateStatus(s)} className="px-3 py-1 text-xs rounded-lg border hover:bg-gray-50 capitalize">{s.replace('_', ' ')}</button>
            ))}
          </div>
        )}

        {/* Convert button */}
        {lead.status === 'counsellor_assigned' && !lead.isConverted && payments?.some((p: any) => p.verificationStatus === 'verified') && (
          <button onClick={convertToStudent} className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg text-sm">Convert to Student</button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notes */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">Notes</h2>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
            {lead.notes.map((n: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg p-2 text-sm">
                <div className="text-gray-500 text-xs">{n.addedBy?.name || 'System'} · {format(new Date(n.addedAt), 'MMM d HH:mm')}</div>
                <div>{n.text}</div>
              </div>
            ))}
            {!lead.notes.length && <div className="text-gray-400 text-sm">No notes yet</div>}
          </div>
          {!lead.isLocked && <div className="flex gap-2">
            <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm" placeholder="Add a note..." value={note} onChange={e => setNote(e.target.value)} />
            <button onClick={addNote} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm">Add</button>
          </div>}
        </div>

        {/* Follow-up */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">Schedule Follow-up</h2>
          {lead.nextFollowUp && <div className="text-sm mb-2">Next: <strong>{format(new Date(lead.nextFollowUp), 'MMM d, yyyy')}</strong></div>}
          {!lead.isLocked && <div className="flex gap-2">
            <input type="datetime-local" className="flex-1 border rounded-lg px-3 py-1.5 text-sm" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
            <button onClick={scheduleFollowUp} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm">Set</button>
          </div>}
        </div>

        {/* Escalate (telecaller only) */}
        {user?.role === 'telecaller' && !lead.isLocked && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold mb-3">Escalate to Counsellor</h2>
            <select className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" value={escalateForm.counsellorId} onChange={e => setEscalateForm({...escalateForm, counsellorId: e.target.value})}>
              <option value="">Select Counsellor</option>
              {counsellors.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" placeholder="Reason" value={escalateForm.reason} onChange={e => setEscalateForm({...escalateForm, reason: e.target.value})} />
            <button onClick={escalate} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-sm w-full">Escalate</button>
          </div>
        )}

        {/* Reassign (admin/counsellor) */}
        {(user?.role === 'admin' || user?.role === 'counsellor') && !lead.isLocked && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold mb-3">Reassign Lead</h2>
            <select className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" value={reassignForm.assignTo} onChange={e => setReassignForm({...reassignForm, assignTo: e.target.value})}>
              <option value="">Select User</option>
              {allUsers.map((u: any) => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
            </select>
            <input className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" placeholder="Reason" value={reassignForm.reason} onChange={e => setReassignForm({...reassignForm, reason: e.target.value})} />
            <button onClick={reassign} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm w-full">Reassign</button>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold mb-3">Payments</h2>
        {payments?.map((p: any) => (
          <div key={p._id} className="border rounded-lg p-3 mb-2">
            <div className="flex justify-between items-center">
              <div><strong>₹{p.amount}</strong> — <span className={`text-xs px-2 py-0.5 rounded ${p.verificationStatus === 'verified' ? 'bg-green-100 text-green-700' : p.verificationStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.verificationStatus}</span> (v{p.currentVersion})</div>
              {(user?.role === 'admin' || user?.role === 'counsellor') && p.verificationStatus === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => verifyPayment(p._id, 'verified')} className="text-green-600 text-xs font-medium">✓ Verify</button>
                  <button onClick={() => verifyPayment(p._id, 'rejected')} className="text-red-600 text-xs font-medium">✗ Reject</button>
                </div>
              )}
            </div>
            {p.proofUrl && <a href={p.proofUrl} target="_blank" className="text-brand-600 text-xs mt-1 inline-block">View Proof</a>}
          </div>
        ))}
        {!lead.isLocked && (
          <div className="flex gap-2 mt-3">
            <input type="number" className="border rounded-lg px-3 py-1.5 text-sm w-32" placeholder="Amount" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
            <input type="file" className="border rounded-lg px-3 py-1.5 text-sm" onChange={e => setPaymentForm({...paymentForm, file: e.target.files?.[0] || null})} />
            <button onClick={submitPayment} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm">Add Payment</button>
          </div>
        )}
      </div>

      {/* Assignment History */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold mb-3">Assignment History</h2>
        <div className="space-y-2">
          {lead.assignmentHistory.map((h: any, i: number) => (
            <div key={i} className="flex justify-between text-sm border-b pb-2">
              <span>→ {h.assignedTo?.name || 'Unknown'} {h.reason && <span className="text-gray-400">({h.reason})</span>}</span>
              <span className="text-gray-400">{format(new Date(h.assignedAt), 'MMM d HH:mm')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold mb-3">Activity Timeline</h2>
        <div className="space-y-3">
          {activity?.map(a => (
            <div key={a._id} className="flex gap-3 text-sm">
              <div className="w-2 h-2 bg-brand-500 rounded-full mt-1.5 shrink-0" />
              <div>
                <div><strong>{a.performedBy?.name}</strong> <span className="text-gray-500">{a.action.replace(/_/g, ' ')}</span></div>
                {a.previousValue && <div className="text-xs text-gray-400">From: {String(a.previousValue)} → To: {String(a.newValue)}</div>}
                {a.details && <div className="text-xs text-gray-400">{JSON.stringify(a.details)}</div>}
                <div className="text-xs text-gray-300">{format(new Date(a.createdAt), 'MMM d, yyyy HH:mm:ss')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
