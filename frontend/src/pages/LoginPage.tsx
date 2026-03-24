import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'telecaller' });
  const { login, register } = useAuth();
  const nav = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegister) await register(form.name, form.email, form.password, form.role);
      else await login(form.email, form.password);
      nav('/');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-brand-900 mb-6">{isRegister ? 'Create Account' : 'Sign In'}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && <input className="w-full border rounded-lg px-4 py-2" placeholder="Full Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />}
          <input className="w-full border rounded-lg px-4 py-2" placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          <input className="w-full border rounded-lg px-4 py-2" placeholder="Password" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          {isRegister && (
            <select className="w-full border rounded-lg px-4 py-2" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              <option value="telecaller">Telecaller</option>
              <option value="counsellor">Counsellor</option>
              <option value="admin">Admin</option>
            </select>
          )}
          <button className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 transition">{isRegister ? 'Register' : 'Login'}</button>
        </form>
        <p className="mt-4 text-sm text-center text-gray-500">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => setIsRegister(!isRegister)} className="text-brand-600 font-medium">{isRegister ? 'Sign In' : 'Register'}</button>
        </p>
      </div>
    </div>
  );
}
