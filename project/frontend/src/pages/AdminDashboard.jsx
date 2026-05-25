import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, supabase } from '../api/client';
import TaskStatusBadge from '../components/TaskStatusBadge';
import {
  Users, Shield, BookOpen, BarChart3, FileText, Loader2,
  RefreshCw, Plus, UserPlus, Activity,
} from 'lucide-react';

const TABS = [
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'audit', label: 'Audit Log', icon: FileText },
  { key: 'training', label: 'Training', icon: BookOpen },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'candidate' });
  const [newModule, setNewModule] = useState({ name: '', description: '', department: '', duration_hours: 1, is_mandatory: true });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, u, a, m] = await Promise.all([
        db.getStats(),
        db.getUsers(),
        db.getAuditLogs(),
        db.getTrainingModules(),
      ]);
      setStats(s);
      setUsers(u);
      setAuditLogs(a);
      setModules(m);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateUser = async () => {
    // In production, password hashing happens on the backend
    const { error } = await supabase.from('users').insert({
      name: newUser.name,
      email: newUser.email,
      hashed_password: 'pending_backend_hash',
      role: newUser.role,
    });
    if (error) { alert('Failed: ' + error.message); return; }
    setShowCreateUser(false);
    setNewUser({ name: '', email: '', password: '', role: 'candidate' });
    fetchData();
  };

  const handleCreateModule = async () => {
    const { error } = await supabase.from('training_modules').insert({
      name: newModule.name,
      description: newModule.description,
      department: newModule.department || null,
      duration_hours: parseFloat(newModule.duration_hours),
      is_mandatory: newModule.is_mandatory,
    });
    if (error) { alert('Failed: ' + error.message); return; }
    setShowCreateModule(false);
    setNewModule({ name: '', description: '', department: '', duration_hours: 1, is_mandatory: true });
    fetchData();
  };

  const handleDeactivate = async (userId) => {
    if (!confirm('Deactivate this user?')) return;
    await supabase.from('users').update({ is_active: false }).eq('id', userId);
    fetchData();
  };

  const statCards = stats ? [
    { label: 'Total Candidates', value: stats.total_candidates, color: 'bg-blue-50 text-blue-700', icon: Users },
    { label: 'Pending Approvals', value: stats.pending_approvals, color: 'bg-amber-50 text-amber-700', icon: Shield },
    { label: 'Total Users', value: stats.total_users, color: 'bg-emerald-50 text-emerald-700', icon: UserPlus },
    { label: 'Onboarded', value: stats.candidates_by_status?.onboarded || 0, color: 'bg-green-50 text-green-700', icon: Activity },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-sm text-gray-500">{user.name} — System Administrator</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Sign Out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
        ) : (
          <>
            {/* Stats Tab */}
            {activeTab === 'stats' && stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {statCards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                      <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-2xl font-bold text-gray-900">{card.value}</span>
                        </div>
                        <p className="text-sm text-gray-500">{card.label}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Candidates by Status</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(stats.candidates_by_status || {}).map(([status, count]) => (
                      <div key={status} className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500 capitalize mb-0.5">{status.replace(/_/g, ' ')}</p>
                        <p className="text-lg font-bold text-gray-900">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Users</h2>
                  <button
                    onClick={() => setShowCreateUser(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add User
                  </button>
                </div>

                {showCreateUser && (
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4">Create User</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" value={newUser.name} onChange={e => setNewUser(p => ({...p, name: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" value={newUser.email} onChange={e => setNewUser(p => ({...p, email: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select value={newUser.role} onChange={e => setNewUser(p => ({...p, role: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="candidate">Candidate</option>
                          <option value="hr">HR</option>
                          <option value="it">IT</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleCreateUser} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Create</button>
                      <button onClick={() => setShowCreateUser(false)} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">Cancel</button>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left p-3 font-medium text-gray-600">Name</th>
                        <th className="text-left p-3 font-medium text-gray-600">Email</th>
                        <th className="text-left p-3 font-medium text-gray-600">Role</th>
                        <th className="text-left p-3 font-medium text-gray-600">Status</th>
                        <th className="text-left p-3 font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="p-3 font-medium text-gray-900">{u.name}</td>
                          <td className="p-3 text-gray-600">{u.email}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">{u.role}</span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3">
                            {u.is_active && u.id !== user.id && (
                              <button onClick={() => handleDeactivate(u.id)} className="text-xs text-red-600 hover:text-red-800">Deactivate</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audit Tab */}
            {activeTab === 'audit' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left p-3 font-medium text-gray-600">Time</th>
                      <th className="text-left p-3 font-medium text-gray-600">User ID</th>
                      <th className="text-left p-3 font-medium text-gray-600">Action</th>
                      <th className="text-left p-3 font-medium text-gray-600">Entity</th>
                      <th className="text-left p-3 font-medium text-gray-600">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="p-3 text-gray-500 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="p-3 text-gray-600">{log.user_id || 'System'}</td>
                        <td className="p-3 text-gray-900 font-medium">{log.action}</td>
                        <td className="p-3 text-gray-600">{log.entity_type} #{log.entity_id}</td>
                        <td className="p-3 text-gray-500 text-xs max-w-xs truncate">
                          {log.details ? JSON.stringify(log.details).slice(0, 80) : '-'}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No audit entries</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Training Tab */}
            {activeTab === 'training' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Training Modules</h2>
                  <button
                    onClick={() => setShowCreateModule(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Module
                  </button>
                </div>

                {showCreateModule && (
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4">Create Training Module</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" value={newModule.name} onChange={e => setNewModule(p => ({...p, name: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department (empty = all)</label>
                        <input type="text" value={newModule.department} onChange={e => setNewModule(p => ({...p, department: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input type="text" value={newModule.description} onChange={e => setNewModule(p => ({...p, description: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Duration (hours)</label>
                        <input type="number" value={newModule.duration_hours} onChange={e => setNewModule(p => ({...p, duration_hours: e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <input type="checkbox" checked={newModule.is_mandatory} onChange={e => setNewModule(p => ({...p, is_mandatory: e.target.checked}))}
                        className="rounded border-gray-300" />
                      <label className="text-sm text-gray-700">Mandatory</label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleCreateModule} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Create</button>
                      <button onClick={() => setShowCreateModule(false)} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">Cancel</button>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left p-3 font-medium text-gray-600">Name</th>
                        <th className="text-left p-3 font-medium text-gray-600">Department</th>
                        <th className="text-left p-3 font-medium text-gray-600">Hours</th>
                        <th className="text-left p-3 font-medium text-gray-600">Mandatory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modules.map(m => (
                        <tr key={m.id} className="border-b border-gray-50">
                          <td className="p-3">
                            <p className="font-medium text-gray-900">{m.name}</p>
                            <p className="text-xs text-gray-500">{m.description}</p>
                          </td>
                          <td className="p-3 text-gray-600">{m.department || 'All'}</td>
                          <td className="p-3 text-gray-600">{m.duration_hours}h</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.is_mandatory ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                              {m.is_mandatory ? 'Required' : 'Optional'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
