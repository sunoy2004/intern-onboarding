const STATUS_CONFIG = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
  waiting_approval: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Awaiting Approval' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  uploaded: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Uploaded' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  verified: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Verified' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  needs_resubmission: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Resubmit' },
  applied: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Applied' },
  documents_pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Documents Pending' },
  documents_submitted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Docs Submitted' },
  documents_verified: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Docs Verified' },
  it_provisioning: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'IT Provisioning' },
  training: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Training' },
  onboarded: { bg: 'bg-green-100', text: 'text-green-700', label: 'Onboarded' },
  not_started: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not Started' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
};

export default function TaskStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
