import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../api/client';
import TaskStatusBadge from '../components/TaskStatusBadge';
import { Users, Loader2, RefreshCw, GraduationCap, ChevronRight } from 'lucide-react';

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberProgress, setMemberProgress] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const cands = await db.getCandidates();
      setCandidates(cands);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const viewProgress = async (candidate) => {
    setSelectedMember(candidate);
    try {
      const [docs, training] = await Promise.all([
        db.getDocuments(candidate.id),
        db.getTrainingProgress(candidate.id),
      ]);
      const total = training.length;
      const completed = training.filter(t => t.status === 'completed').length;
      setMemberProgress({
        documents: docs,
        training,
        trainingTotal: total,
        trainingCompleted: completed,
        trainingPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Manager Dashboard</h1>
            <p className="text-sm text-gray-500">{user.name} — Team Manager</p>
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
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Team Members */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {candidates.map(c => (
                    <div
                      key={c.id}
                      className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => viewProgress(c)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium text-sm">
                          {(c.user?.name || '??').split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{c.user?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{c.department} — {c.job_title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <TaskStatusBadge status={c.status} />
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                  {candidates.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">No team members found</div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Detail Panel */}
            <div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Member Progress</h2>
                </div>
                {!selectedMember ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Select a team member to view progress</div>
                ) : (
                  <div className="p-4 space-y-4">
                    <div>
                      <p className="font-medium text-gray-900">{selectedMember.user?.name}</p>
                      <p className="text-xs text-gray-500">{selectedMember.department} — {selectedMember.job_title}</p>
                      <div className="mt-2"><TaskStatusBadge status={selectedMember.status} /></div>
                    </div>

                    {memberProgress && (
                      <>
                        {/* Training Progress */}
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Training Progress</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${memberProgress.trainingPct}%` }} />
                            </div>
                            <span className="text-xs font-medium text-gray-600">{memberProgress.trainingPct}%</span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {memberProgress.trainingCompleted} of {memberProgress.trainingTotal} modules completed
                          </p>
                        </div>

                        {/* Documents */}
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Documents</p>
                          <div className="space-y-1">
                            {memberProgress.documents.map(d => (
                              <div key={d.id} className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 capitalize">{(d.doc_type || '').replace(/_/g, ' ')}</span>
                                <TaskStatusBadge status={d.status} />
                              </div>
                            ))}
                            {memberProgress.documents.length === 0 && (
                              <p className="text-xs text-gray-400">No documents uploaded</p>
                            )}
                          </div>
                        </div>

                        {/* Employee Details */}
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Employee Details</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Employee ID</span>
                              <span className="text-gray-900">{selectedMember.employee_id || 'Pending'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Work Email</span>
                              <span className="text-gray-900">{selectedMember.work_email || 'Pending'}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
