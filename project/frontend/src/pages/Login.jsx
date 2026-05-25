import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Mail, Lock, Loader2, Building2 } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (email, password) => {
    setEmail(email);
    setPassword(password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">AI Onboarding System</h1>
          <p className="text-slate-400 mt-1">Multi-agent employee onboarding platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Sign In</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Quick Login (Demo)</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Admin', email: 'admin@company.com', pwd: 'Admin@123', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
                { label: 'HR', email: 'hr1@company.com', pwd: 'Hr@12345', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'IT', email: 'it1@company.com', pwd: 'It@12345', color: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
                { label: 'Manager', email: 'manager1@company.com', pwd: 'Manager@123', color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
              ].map(({ label, email: e, pwd, color }) => (
                <button
                  key={label}
                  onClick={() => quickLogin(e, pwd)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${color}`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => quickLogin('candidate1@company.com', 'Candidate@123')}
                className="col-span-2 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                Candidate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
