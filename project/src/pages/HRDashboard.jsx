import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, supabase } from '../api/client';
import ApprovalCard from '../components/ApprovalCard';
import TaskStatusBadge from '../components/TaskStatusBadge';
import { Users, FileCheck, AlertCircle, Loader2, RefreshCw, Play, UserPlus, X, Mail, FileText, Copy, CheckCircle2, Eye, CheckCircle, XCircle, Bell, ChevronDown, ChevronUp } from 'lucide-react';

const REQUIRED_DOCS = ['aadhaar_card', 'pan_card', 'bank_passbook'];

const DOC_LABELS = {
  aadhaar_card: 'Aadhaar Card',
  pan_card: 'PAN Card',
  bank_passbook: 'Bank Passbook',
};

const DOC_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600',
  uploaded: 'bg-blue-100 text-blue-700',
  needs_review: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
  needs_resubmission: 'bg-orange-100 text-orange-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function HRDashboard() {
  const { user, logout } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [candidateDocs, setCandidateDocs] = useState([]);
  const [newHire, setNewHire] = useState({
    name: '',
    email: '',
    department: 'Engineering',
    job_title: '',
    start_date: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cands, apps] = await Promise.all([
        db.getCandidates(statusFilter || null),
        db.getPendingApprovals('hr'),
      ]);
      setCandidates(cands);
      setApprovals(apps);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const fetchCandidateDocs = async (candidateId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('candidate_id', candidateId);
    if (!error) setCandidateDocs(data || []);
  };

  const openCandidateDocs = async (candidate) => {
    setSelectedCandidate(candidate);
    await fetchCandidateDocs(candidate.id);
  };

  const verifyDocument = async (docId) => {
    const { error } = await supabase
      .from('documents')
      .update({ status: 'verified', verified_at: new Date().toISOString() })
      .eq('id', docId);
    if (!error && selectedCandidate) {
      await fetchCandidateDocs(selectedCandidate.id);
    }
  };

  const rejectDocument = async (docId, reason) => {
    const { error } = await supabase
      .from('documents')
      .update({ status: 'needs_resubmission', rejection_reason: reason || 'Document unclear or invalid' })
      .eq('id', docId);
    if (!error && selectedCandidate) {
      await fetchCandidateDocs(selectedCandidate.id);
    }
  };

  const verifyAllDocuments = async (candidateId) => {
    // Mark all uploaded docs as verified
    const { error } = await supabase
      .from('documents')
      .update({ status: 'verified', verified_at: new Date().toISOString() })
      .eq('candidate_id', candidateId)
      .in('status', ['uploaded']);

    if (error) { alert('Failed: ' + error.message); return; }

    // Update candidate status to documents_verified
    await supabase
      .from('candidates')
      .update({ status: 'documents_verified', updated_at: new Date().toISOString() })
      .eq('id', candidateId);

    // Move directly to IT provisioning
    await moveToITProvisioning(candidateId);

    if (selectedCandidate) await fetchCandidateDocs(selectedCandidate.id);
    fetchData();
  };

  const moveToITProvisioning = async (candidateId) => {
    const cand = candidates.find(c => c.id === candidateId);
    const year = new Date().getFullYear();
    const empId = `EMP-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nameParts = (cand?.user?.name || 'employee').toLowerCase().split(' ');
    const emailPrefix = nameParts.length >= 2
      ? `${nameParts[0]}.${nameParts[nameParts.length - 1]}`
      : nameParts[0] || 'employee';
    const workEmail = `${emailPrefix}@company.com`;
    const laptop = `LAPTOP-${Math.floor(100000 + Math.random() * 900000)}`;
    const accessCard = `AC-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const software = cand?.department === 'Engineering'
      ? ['GitHub', 'Jira', 'Slack', 'VS Code License', 'AWS Console']
      : cand?.department === 'HR'
        ? ['Slack', 'BambooHR', 'Zoom', 'Office 365']
        : ['Slack', 'Zoom', 'Office 365'];

    // Update candidate
    await supabase
      .from('candidates')
      .update({ status: 'it_provisioning', updated_at: new Date().toISOString() })
      .eq('id', candidateId);

    // Create IT task
    const { data: itTask } = await supabase
      .from('onboarding_tasks')
      .insert({
        candidate_id: candidateId,
        agent_name: 'it_agent',
        task_type: 'provision_it_resources',
        status: 'waiting_approval',
        payload: {
          candidate_id: candidateId,
          candidate_name: cand?.user?.name || 'Unknown',
          employee_id: empId,
          work_email: workEmail,
          laptop_asset_tag: laptop,
          software_list: software,
          access_card: accessCard,
          department: cand?.department || 'General',
        },
      })
      .select()
      .maybeSingle();

    if (itTask) {
      await supabase.from('approvals').insert({
        task_id: itTask.id,
        action_type: `Provision IT resources for ${cand?.user?.name || 'candidate'}`,
        payload: {
          candidate_id: candidateId,
          candidate_name: cand?.user?.name || 'Unknown',
          employee_id: empId,
          work_email: workEmail,
          laptop_asset_tag: laptop,
          software_list: software,
          access_card: accessCard,
          department: cand?.department || 'General',
        },
        approver_role: 'it',
        status: 'pending',
      });
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'documents_verified_moved_to_it',
      entity_type: 'candidate',
      entity_id: candidateId,
      details: { employee_id: empId },
    });
  };

  const handleResolveApproval = async (approvalId, decision, notes) => {
    const { error } = await supabase
      .from('approvals')
      .update({
        status: decision,
        approver_id: user.id,
        notes: notes || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', approvalId);

    if (error) throw error;

    if (decision === 'approved') {
      const approval = approvals.find(a => a.id === approvalId);
      const payload = approval?.payload || {};
      const candidateId = payload.candidate_id;

      if (approval?.task_id) {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'completed' })
          .eq('id', approval.task_id);
      }

      if (candidateId) {
        await supabase
          .from('candidates')
          .update({ status: 'documents_pending', updated_at: new Date().toISOString() })
          .eq('id', candidateId);

        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'offer_approved',
          entity_type: 'candidate',
          entity_id: candidateId,
        });
      }
    } else {
      const approval = approvals.find(a => a.id === approvalId);
      if (approval?.task_id) {
        await supabase
          .from('onboarding_tasks')
          .update({ status: 'failed' })
          .eq('id', approval.task_id);
      }
      const candidateId = approval?.payload?.candidate_id;
      if (candidateId) {
        await supabase
          .from('candidates')
          .update({ status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', candidateId);
      }
    }

    fetchData();
  };

  const startOnboarding = async (candidateId) => {
    const cand = candidates.find(c => c.id === candidateId);
    const candName = cand?.user?.name || 'Candidate';
    const candEmail = cand?.user?.email || '';

    const { data: task, error: taskError } = await supabase
      .from('onboarding_tasks')
      .insert({
        candidate_id: candidateId,
        agent_name: 'orchestrator',
        task_type: 'full_onboarding',
        status: 'in_progress',
        payload: { initiated_by: user.id },
      })
      .select()
      .maybeSingle();

    if (taskError) { alert('Failed to start: ' + taskError.message); return; }

    const { error: appError } = await supabase
      .from('approvals')
      .insert({
        task_id: task.id,
        action_type: `Send offer letter email to ${candEmail}`,
        payload: {
          candidate_id: candidateId,
          candidate_name: candName,
          candidate_email: candEmail,
          job_title: cand?.job_title || 'Employee',
          department: cand?.department || 'General',
        },
        approver_role: 'hr',
        status: 'pending',
      });

    if (appError) { alert('Failed to create approval: ' + appError.message); return; }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'onboarding_started',
      entity_type: 'candidate',
      entity_id: candidateId,
      details: { candidate_name: candName },
    });

    fetchData();
  };

  const handleInviteNewHire = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteResult(null);
    try {
      const result = await db.inviteCandidate(newHire);
      setInviteResult({ success: true, ...result });
      setNewHire({ name: '', email: '', department: 'Engineering', job_title: '', start_date: '' });
      fetchData();
    } catch (err) {
      setInviteResult({ error: err.message });
    } finally {
      setInviteLoading(false);
    }
  };

  const sendDocsReminder = async (candidateId) => {
    try {
      alert('Document reminders are handled automatically by the Verification Agent.');
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const getDocsSummary = (docs) => {
    const uploaded = docs.filter(d => ['uploaded', 'verified', 'needs_review'].includes(d.status)).length;
    const verified = docs.filter(d => d.status === 'verified').length;
    return { uploaded, verified, total: REQUIRED_DOCS.length };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">HR Dashboard</h1>
            <p className="text-sm text-gray-500">{user.name} — Human Resources</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowInvite(true); setInviteResult(null); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add New Hire
            </button>
            <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pending Approvals */}
            <div className="lg:col-span-1 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {approvals.length}
                  </span>
                </div>
                {approvals.length === 0 ? (
                  <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
                    <FileCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {approvals.map(a => (
                      <ApprovalCard key={a.id} approval={a} onResolve={handleResolveApproval} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Candidates Table */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-gray-900">Candidates</h2>
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="applied">Applied</option>
                    <option value="documents_pending">Documents Pending</option>
                    <option value="documents_verified">Documents Verified</option>
                    <option value="it_provisioning">IT Provisioning</option>
                    <option value="training">Training</option>
                    <option value="onboarded">Onboarded</option>
                  </select>
                </div>

                <div className="divide-y divide-gray-50">
                  {candidates.map(c => {
                    const isSelected = selectedCandidate?.id === c.id;
                    return (
                      <div key={c.id}>
                        <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{c.user?.name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{c.user?.email} — {c.department}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <TaskStatusBadge status={c.status} />
                            {(c.status === 'documents_pending' || c.status === 'applied') && (
                              <button
                                onClick={() => openCandidateDocs(c)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                Docs
                              </button>
                            )}
                            {c.status === 'documents_pending' && (
                              <button
                                onClick={() => sendDocsReminder(c.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                                title="Send document upload reminder email"
                              >
                                <Bell className="w-3 h-3" />
                              </button>
                            )}
                            {c.status === 'applied' && (
                              <button
                                onClick={() => startOnboarding(c.id)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                <Play className="w-3 h-3" />
                                Start
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded Document View */}
                        {isSelected && (
                          <div className="px-4 pb-4 bg-gray-50/50">
                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-gray-700">Documents</h4>
                                {(() => {
                                  const summary = getDocsSummary(candidateDocs);
                                  const allUploaded = summary.uploaded === summary.total;
                                  const allVerified = summary.verified === summary.total;
                                  if (allVerified) {
                                    return <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">All Verified</span>;
                                  }
                                  if (allUploaded) {
                                    return (
                                      <button
                                        onClick={() => verifyAllDocuments(c.id)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                        Verify All & Proceed
                                      </button>
                                    );
                                  }
                                  return (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                                      {summary.uploaded}/{summary.total} Uploaded
                                    </span>
                                  );
                                })()}
                              </div>
                              <div className="space-y-2">
                                {REQUIRED_DOCS.map(docType => {
                                  const doc = candidateDocs.find(d => d.doc_type === docType);
                                  const status = doc?.status || 'pending';
                                  return (
                                    <div key={docType} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        <div>
                                          <p className="text-sm text-gray-700">{DOC_LABELS[docType]}</p>
                                          {doc?.original_filename && (
                                            <p className="text-xs text-gray-400">{doc.original_filename}</p>
                                          )}
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOC_STATUS_COLORS[status]}`}>
                                          {status === 'needs_resubmission' ? 'Resubmit' : status}
                                        </span>
                                      </div>
                                      {doc && (status === 'uploaded' || status === 'needs_resubmission') && (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => verifyDocument(doc.id)}
                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                            title="Verify"
                                          >
                                            <CheckCircle className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => rejectDocument(doc.id)}
                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Request Resubmission"
                                          >
                                            <XCircle className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {candidates.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">No candidates found</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Invite New Hire Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {inviteResult?.success ? (
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">New Hire Invited!</h2>
                      <p className="text-sm text-gray-500">
                        {inviteResult.email_sent
                          ? 'Account created and offer letter email sent'
                          : 'Account created (email delivery pending)'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Offer Letter Preview */}
                <div className="border border-gray-200 rounded-xl p-6 mb-6 bg-gray-50">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">OFFER LETTER</h3>
                    <p className="text-sm text-gray-500">Confidential</p>
                    <div className="w-16 h-0.5 bg-blue-600 mx-auto mt-2" />
                  </div>
                  <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>Date: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p>Dear {inviteResult.user.name},</p>
                    <p>We are delighted to extend an offer of employment for the position of <strong>{inviteResult.candidate.job_title}</strong> in the <strong>{inviteResult.candidate.department}</strong> department.</p>
                    {inviteResult.candidate.start_date && (
                      <p>Start date: <strong>{new Date(inviteResult.candidate.start_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
                    )}
                    <p>Please log in to the onboarding portal to upload your Aadhaar card, PAN card, and bank passbook PDFs to complete KYC verification.</p>
                    <p>We look forward to welcoming you aboard!</p>
                    <p>Best regards,<br />Human Resources Team</p>
                  </div>
                </div>

                {/* Login Credentials */}
                <div className="border border-amber-200 rounded-xl p-5 bg-amber-50 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-5 h-5 text-amber-600" />
                    <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider">Login Credentials</h3>
                  </div>
                  <p className="text-sm text-amber-700 mb-3">
                    These credentials were sent to {inviteResult.user.email}. Share them manually if the email was not received.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                      <div>
                        <span className="text-xs text-gray-500">Email</span>
                        <p className="text-sm font-mono font-medium text-gray-900">{inviteResult.user.email}</p>
                      </div>
                      <button onClick={() => copyToClipboard(inviteResult.user.email)} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                      <div>
                        <span className="text-xs text-gray-500">Temporary Password</span>
                        <p className="text-sm font-mono font-medium text-gray-900">{inviteResult.temp_password}</p>
                      </div>
                      <button onClick={() => copyToClipboard(inviteResult.temp_password)} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors">
                        {copiedPassword ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowInvite(false)}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Add New Hire</h2>
                      <p className="text-sm text-gray-500">Create account and send offer letter via email</p>
                    </div>
                  </div>
                  <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {inviteResult?.error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {inviteResult.error}
                  </div>
                )}

                <form onSubmit={handleInviteNewHire} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" value={newHire.name} onChange={(e) => setNewHire(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jane Smith" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input type="email" value={newHire.email} onChange={(e) => setNewHire(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="jane.smith@email.com" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                      <select value={newHire.department} onChange={(e) => setNewHire(p => ({ ...p, department: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Engineering">Engineering</option>
                        <option value="HR">HR</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Sales">Sales</option>
                        <option value="Finance">Finance</option>
                        <option value="Operations">Operations</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                      <input type="text" value={newHire.job_title} onChange={(e) => setNewHire(p => ({ ...p, job_title: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Software Engineer" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (Optional)</label>
                    <input type="date" value={newHire.start_date} onChange={(e) => setNewHire(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-gray-600" />
                      <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Offer Letter will include:</span>
                    </div>
                    <ul className="text-xs text-gray-600 space-y-1 ml-6 list-disc">
                      <li>Position: {newHire.job_title || '[Job Title]'} in {newHire.department}</li>
                      <li>Login credentials (email + temporary password)</li>
                      <li>Instructions to upload: Aadhaar, PAN, and bank passbook PDFs</li>
                    </ul>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowInvite(false)}
                      className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={inviteLoading}
                      className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                      {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      {inviteLoading ? 'Creating Account & Sending Email...' : 'Create Account & Send Offer Letter'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
