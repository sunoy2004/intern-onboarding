import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../api/client';
import TaskStatusBadge from '../components/TaskStatusBadge';
import { Monitor, RefreshCw, HardDrive, Mail, Key, Shield, UserCheck, Eye, EyeOff } from 'lucide-react';

export default function ITDashboard() {
  const { user, logout } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSensitiveId, setShowSensitiveId] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await db.getITCandidates();
      setCandidates(data);
    } catch (err) {
      console.error('Failed to fetch IT data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSensitive = (id) => {
    setShowSensitiveId(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-500" />
              IT & Assets Dashboard
            </h1>
            <p className="text-sm text-slate-400">{user.name} — IT Service Desk Operations</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-white transition-colors">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={logout} className="text-sm text-slate-400 hover:text-white transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-400" />
                Active Intern Provisioning & Asset Catalog
              </h2>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                Total Records: {candidates.length}
              </span>
            </div>

            {candidates.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <Monitor className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-sm">No employee onboarding workflow files present.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {candidates.map((c) => {
                  const hasSecrets = showSensitiveId[c.candidate_id];
                  return (
                    <div key={c.candidate_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 hover:border-slate-700 transition-colors">
                      {/* Top profile banner */}
                      <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="text-md font-bold text-white">{c.name}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Role: {c.job_title} | Department: {c.department}</p>
                          <p className="text-xs text-slate-500">Personal Email: {c.personal_email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <TaskStatusBadge status={c.onboarding_status} />
                          <button
                            onClick={() => toggleSensitive(c.candidate_id)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="Toggle sensitive details"
                          >
                            {hasSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Content grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                        {/* 1. KYC Details */}
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">KYC Verification Data</h4>
                          <div className="space-y-1.5 text-xs text-slate-300">
                            <p><strong>Aadhaar:</strong> {hasSecrets ? c.aadhaar_number || 'Not Submitted' : '•••• •••• ••••'}</p>
                            <p><strong>PAN Card:</strong> {hasSecrets ? c.pan_number || 'Not Submitted' : '••••••••••'}</p>
                            <p><strong>Verification:</strong> <span className={c.pan_number ? "text-emerald-400" : "text-amber-400"}>{c.pan_number ? "Verified by Agent" : "Awaiting Submissions"}</span></p>
                          </div>
                        </div>

                        {/* 2. Bank Details */}
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bank Accounts & Payments</h4>
                          <div className="space-y-1.5 text-xs text-slate-300">
                            <p><strong>Account Name:</strong> {c.bank_account_name || 'N/A'}</p>
                            <p><strong>Account No:</strong> {hasSecrets ? c.bank_account_number || 'N/A' : '••••••••••••'}</p>
                            <p><strong>IFSC Code:</strong> {c.ifsc_code || 'N/A'}</p>
                          </div>
                        </div>

                        {/* 3. IT Credentials & Assets */}
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">IT Provisioning & Laptops</h4>
                          <div className="space-y-1.5 text-xs text-slate-300">
                            <p className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-blue-400" />
                              <strong>Work Email:</strong> {c.corporate_email || 'Awaiting verification'}
                            </p>
                            {c.email_temp_password && hasSecrets && (
                              <p className="flex items-center gap-1.5 font-mono text-[10px]">
                                <Key className="w-3.5 h-3.5 text-amber-400" />
                                <strong>Temp Pass:</strong> {c.email_temp_password}
                              </p>
                            )}
                            <div className="pt-1 border-t border-slate-900 mt-1 space-y-1">
                              <strong>Assigned Gear:</strong>
                              {c.assets && c.assets.length > 0 ? (
                                c.assets.map(a => (
                                  <p key={a.asset_tag} className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <HardDrive className="w-3 h-3 text-emerald-400" />
                                    {a.model} ({a.asset_tag})
                                  </p>
                                ))
                              ) : (
                                <p className="text-[10px] text-slate-500">No assets allocated yet.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
