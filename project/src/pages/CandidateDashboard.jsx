import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../api/client';
import DocumentUpload from '../components/DocumentUpload';
import SupportChat from '../components/SupportChat';
import { User, FileText, GraduationCap, BarChart3, Loader2, CheckCircle2, Mail, Award, Lock, Activity, Laptop, PackageCheck } from 'lucide-react';

const STATUS_STEPS = [
  { key: 'applied', label: 'Applied', icon: User },
  { key: 'documents_pending', label: 'Documents', icon: FileText },
  { key: 'documents_verified', label: 'Verified', icon: FileText },
  { key: 'it_provisioning', label: 'IT Setup', icon: User },
  { key: 'training', label: 'Training', icon: GraduationCap },
  { key: 'onboarded', label: 'Onboarded', icon: BarChart3 },
];

export default function CandidateDashboard() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Password reset states
  const [resetRequired, setResetRequired] = useState(user?.reset_required);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // E-Sign states
  const [isSigned, setIsSigned] = useState(false);
  const [signingMode, setSigningMode] = useState('typed'); // 'typed' or 'drawn'
  const [typedName, setTypedName] = useState('');
  const [canvasSign, setCanvasSign] = useState('');
  const [ipAddress, setIpAddress] = useState('127.0.0.1');
  const [isSigning, setIsSigning] = useState(false);
  
  const [documentData, setDocumentData] = useState(null);
  const [ocrActivity, setOcrActivity] = useState([]);
  const [assignedAssets, setAssignedAssets] = useState([]);
  const [companyAccount, setCompanyAccount] = useState(null);

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const fetchProfile = async () => {
    try {
      const data = await db.getCandidateForUser(user.id);
      setProfile(data);
      
      const docs = await db.getDocuments(user.id).catch(() => []);
      setDocuments(docs);
      
      const candidateInfo = await db.getCandidateProfile(user.id).catch(() => null);
      if (candidateInfo) {
        setIsSigned(candidateInfo.documents?.signed_offer_letter || false);
        setDocumentData(candidateInfo.documents || null);
        setOcrActivity(candidateInfo.verification_records || []);
        setAssignedAssets(candidateInfo.assets || []);
        setCompanyAccount(candidateInfo.company_account || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // Fetch mock/real client IP address
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setIpAddress(data.ip))
      .catch(() => setIpAddress('192.168.1.1'));
  }, []);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters long');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      await db.resetPassword(newPassword);
      setResetRequired(false);
      const userSession = JSON.parse(localStorage.getItem('user') || '{}');
      userSession.reset_required = false;
      localStorage.setItem('user', JSON.stringify(userSession));
      alert('Password reset completed successfully!');
    } catch (err) {
      setResetError(err.message || 'Password reset failed.');
    } finally {
      setResetLoading(false);
    }
  };

  // E-Sign functions
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a';
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setCanvasSign(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setCanvasSign('');
    }
  };

  const handleESign = async (e) => {
    e.preventDefault();
    const sig = signingMode === 'typed' ? typedName : canvasSign;
    if (!sig) {
      alert('Please provide a signature.');
      return;
    }
    setIsSigning(true);
    try {
      await db.esignOfferLetter(sig, ipAddress);
      setIsSigned(true);
      alert('Offer letter e-signed successfully!');
      fetchProfile();
    } catch (err) {
      alert('Signing failed: ' + err.message);
    } finally {
      setIsSigning(false);
    }
  };

  const parseVerificationOutput = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Mandatory password reset check
  if (resetRequired) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl border border-gray-100">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Reset Your Password</h2>
            <p className="text-sm text-gray-500 mt-1">First-time login setup required.</p>
          </div>
          {resetError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {resetError}
            </div>
          )}
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter new password"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Confirm password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Password
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentStepIdx = profile ? STATUS_STEPS.findIndex(s => s.key === profile.status) : 0;
  const progressPct = profile?.status === 'onboarded' ? 100 : Math.round((Math.max(currentStepIdx, 0) / (STATUS_STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">My AI-Driven Onboarding</h1>
            <p className="text-sm text-slate-400">Welcome, {user.name} — Candidate Portal</p>
          </div>
          <button onClick={logout} className="text-sm text-slate-400 hover:text-white transition-colors">
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Onboarding Completed Banner */}
        {profile?.status === 'onboarded' && (
          <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-6 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <div>
              <h2 className="text-lg font-bold text-emerald-200">Onboarding Complete!</h2>
              <p className="text-sm text-emerald-400">All agent workflows validated successfully. Welcome to the company workspace!</p>
            </div>
          </div>
        )}

        {/* Progress Timeline */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <h2 className="text-lg font-semibold mb-4">Onboarding Flow Progression</h2>
          <div className="w-full bg-slate-700 rounded-full h-3 mb-6">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${profile?.status === 'onboarded' ? 'bg-emerald-500' : 'bg-blue-600'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-6 gap-2">
            {STATUS_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i <= currentStepIdx;
              const isCurrent = i === currentStepIdx;
              return (
                <div key={step.key} className="text-center">
                  <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1 ${
                    isActive && profile?.status === 'onboarded' ? 'bg-emerald-500 text-white' :
                    isActive ? 'bg-blue-600 text-white' :
                    isCurrent ? 'bg-blue-900 text-blue-300 ring-2 ring-blue-500' :
                    'bg-slate-700 text-slate-500'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className={`text-xs ${isActive ? 'text-white font-medium' : 'text-slate-500'}`}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Offer Letter & E-Sign Requirements */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Your Official Offer Letter</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Offer content preview */}
            <div className="border border-slate-700 rounded-xl p-6 bg-slate-900 max-h-[300px] overflow-y-auto">
              <div className="text-center mb-4">
                <h3 className="text-md font-bold text-slate-200">LETTER OF EMPLOYMENT</h3>
                <p className="text-xs text-slate-500">Confidential</p>
              </div>
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>Dear {user.name},</p>
                <p>We are delighted to extend this offer of employment for the position of <strong>{profile?.job_title || 'Software Engineer'}</strong> in the <strong>{profile?.department || 'Engineering'}</strong> department.</p>
                <p><strong>Department:</strong> {profile?.department || 'Engineering'}</p>
                <p>Your employment is contingent upon passing background OCR validation, Aadhaar validation, and submitting digital e-signatures on this portal.</p>
                <p>Kindly stamp your consent below.</p>
              </div>
            </div>

            {/* E-sign forms */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 flex flex-col justify-between">
              {isSigned ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 bg-emerald-900 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Award className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h3 className="text-md font-semibold text-emerald-200">Offer Letter E-Signed</h3>
                  <p className="text-xs text-slate-500 mt-1">Logged IP: {ipAddress}</p>
                  <p className="text-xs text-slate-500">Document integrity verified.</p>
                </div>
              ) : (
                <form onSubmit={handleESign} className="space-y-4">
                  <div className="flex gap-4 border-b border-slate-700 pb-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setSigningMode('typed')}
                      className={`text-xs font-semibold ${signingMode === 'typed' ? 'text-blue-400' : 'text-slate-400'}`}
                    >
                      Type Signature
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigningMode('drawn')}
                      className={`text-xs font-semibold ${signingMode === 'drawn' ? 'text-blue-400' : 'text-slate-400'}`}
                    >
                      Draw Signature
                    </button>
                  </div>

                  {signingMode === 'typed' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Type Legal Full Name</label>
                      <input
                        type="text"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        className="w-full px-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white"
                        placeholder="e.g. Jane Doe"
                        required={signingMode === 'typed'}
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-slate-400">Sign with mouse/finger</label>
                        <button type="button" onClick={clearCanvas} className="text-[10px] text-red-400 hover:underline">Clear</button>
                      </div>
                      <canvas
                        ref={canvasRef}
                        width={300}
                        height={100}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className="bg-white rounded-lg border border-slate-700 cursor-crosshair block mx-auto"
                      />
                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 space-y-1">
                    <p>Signature Stamp Details:</p>
                    <p>IP Address: {ipAddress}</p>
                    <p>Date/Time: {new Date().toISOString()}</p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigning}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    {isSigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm E-Sign Consent
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ephemeral Document Upload dropzone */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Verification Documents (In-Memory Processing Only)</h2>
            </div>
            <DocumentUpload existingDocs={documents} onUploadComplete={fetchProfile} />
          </div>

          {/* Extracted verification data */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold">Extracted Verification Details</h2>
              </div>

              <div className="space-y-3">
                {[
                  ['Aadhaar Number', documentData?.aadhaar_number],
                  ['PAN Number', documentData?.pan_number],
                  ['Bank Account', documentData?.bank_account_number],
                  ['IFSC Code', documentData?.ifsc_code],
                  ['Account Holder', documentData?.full_name],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
                    <span className="text-xs text-slate-400">{label}</span>
                    <span className={`text-xs font-mono ${value ? 'text-emerald-300' : 'text-slate-500'}`}>
                      {value || 'Pending OCR'}
                    </span>
                  </div>
                ))}
              </div>

              {documentData?.pan_number && documentData?.aadhaar_number && documentData?.bank_account_number && documentData?.ifsc_code ? (
                <div className="mt-4 bg-emerald-950/50 border border-emerald-900/50 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-200">KYC documents verified by OCR</p>
                </div>
              ) : (
                <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs text-slate-400">
                  Upload Aadhaar, PAN, and bank passbook PDFs. Bank details are extracted from the passbook document.
                </div>
              )}

              {ocrActivity.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Activity className="w-4 h-4 text-blue-400" />
                    OCR Activity
                  </div>
                  {ocrActivity.map((record) => {
                    const output = parseVerificationOutput(record.verification_output);
                    const ocr = output.ocr || {};
                    return (
                      <div key={record.document_type} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-200">
                            {record.document_type.replaceAll('_', ' ').toUpperCase()}
                          </span>
                          <span className={`text-xs font-semibold ${record.status === 'verified' ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {record.status === 'verified' ? 'Verified' : 'Needs Review'}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
                          <span>Engine: <strong className="text-slate-200">{ocr.engine || 'unknown'}</strong></span>
                          <span>Model: <strong className="text-slate-200">{ocr.model || 'unknown'}</strong></span>
                          <span>Confidence: <strong className="text-slate-200">{Math.round(record.ocr_confidence || 0)}%</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {(companyAccount?.work_email || assignedAssets.length > 0) && (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <PackageCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Company Account & Inventory</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
                <p className="text-xs text-slate-400">Company Email</p>
                <p className="mt-1 text-sm font-mono text-emerald-300 break-all">
                  {companyAccount?.work_email || profile?.work_email || 'Pending IT setup'}
                </p>
              </div>
              {assignedAssets.length > 0 ? assignedAssets.map((asset) => (
                <div key={asset.asset_tag} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-blue-400" />
                    <p className="text-sm font-semibold text-slate-100">{asset.asset_tag}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{asset.asset_type} - {asset.model}</p>
                  {asset.serial_number && (
                    <p className="mt-1 text-[11px] font-mono text-slate-500">{asset.serial_number}</p>
                  )}
                </div>
              )) : (
                <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
                  <p className="text-xs text-slate-400">Inventory</p>
                  <p className="mt-1 text-sm text-slate-300">Pending assignment</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <SupportChat />
    </div>
  );
}
