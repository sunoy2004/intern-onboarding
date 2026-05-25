import { useState } from 'react';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

export default function ApprovalCard({ approval, onResolve }) {
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResolve = async (decision) => {
    setLoading(true);
    try {
      await onResolve(approval.id, decision, notes);
      setNotes('');
    } catch (err) {
      console.error('Failed to resolve approval:', err);
    } finally {
      setLoading(false);
    }
  };

  const payload = approval.payload || {};
  const candidateName = approval.candidate?.user?.name || payload.candidate_name || 'Unknown';
  const candidateEmail = approval.candidate?.user?.email || payload.candidate_email || '';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Pending Approval
            </span>
          </div>
          <h3 className="text-base font-semibold text-gray-900">{approval.action_type}</h3>
          {candidateName && (
            <p className="text-sm text-gray-500 mt-0.5">
              Candidate: {candidateName} ({candidateEmail})
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Created: {new Date(approval.created_at).toLocaleString()}
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
          {approval.approver_role.toUpperCase()}
        </span>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {expanded ? 'Hide' : 'Show'} Details
      </button>

      {expanded && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm space-y-1">
          {Object.entries(payload).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="font-medium text-gray-600 min-w-[120px]">{key.replace(/_/g, ' ')}:</span>
              <span className="text-gray-800">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes (optional)..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={2}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleResolve('approved')}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Approve
        </button>
        <button
          onClick={() => handleResolve('rejected')}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          <XCircle className="w-4 h-4" />
          Reject
        </button>
      </div>
    </div>
  );
}
