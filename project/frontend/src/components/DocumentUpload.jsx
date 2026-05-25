import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { db } from '../api/client';

const REQUIRED_DOCS = [
  { value: 'aadhaar_card', label: 'Aadhaar Card', icon: '🪪', hint: 'Upload front and back of your Aadhaar card' },
  { value: 'pan_card', label: 'PAN Card', icon: '💳', hint: 'Upload your PAN card' },
  { value: '10th_certificate', label: '10th Mark Sheet / Certificate', icon: '📄', hint: 'Upload your 10th class mark sheet or passing certificate' },
  { value: '12th_certificate', label: '12th Mark Sheet / Certificate', icon: '📄', hint: 'Upload your 12th class mark sheet or passing certificate' },
];

const STATUS_CONFIG = {
  pending: { label: 'Pending Upload', color: 'bg-gray-100 text-gray-600', icon: Clock },
  uploaded: { label: 'Uploaded', color: 'bg-blue-100 text-blue-700', icon: FileText },
  verified: { label: 'Verified', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  needs_resubmission: { label: 'Resubmit Required', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

export default function DocumentUpload({ existingDocs = [], onUploadComplete }) {
  const [uploading, setUploading] = useState(null);
  const fileRefs = useRef({});

  const docsByType = {};
  existingDocs.forEach(d => {
    if (!docsByType[d.doc_type] || d.status !== 'pending') {
      docsByType[d.doc_type] = d;
    }
  });

  const uploadedCount = REQUIRED_DOCS.filter(d => {
    const doc = docsByType[d.value];
    return doc && doc.status !== 'pending' && doc.original_filename;
  }).length;
  const allUploaded = uploadedCount === REQUIRED_DOCS.length;

  const handleUpload = async (docType) => {
    const input = fileRefs.current[docType];
    if (!input || !input.files?.[0]) return;

    setUploading(docType);

    try {
      const file = input.files[0];
      await db.uploadDocument(docType, file);
      
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Required Documents</h3>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          allUploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {uploadedCount}/{REQUIRED_DOCS.length} Uploaded
        </span>
      </div>

      {REQUIRED_DOCS.map(({ value, label, icon, hint }) => {
        const doc = docsByType[value];
        const isUploaded = doc && doc.original_filename && doc.status !== 'pending';
        const status = doc?.status || 'pending';
        const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        const StatusIcon = statusCfg.icon;
        const isUploading = uploading === value;

        return (
          <div key={value} className={`p-4 rounded-lg border transition-colors ${
            isUploaded ? 'bg-white border-gray-200' :
            status === 'needs_resubmission' ? 'bg-orange-50 border-orange-200' :
            'bg-gray-50 border-gray-100'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg">{icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  {isUploaded && doc.original_filename && (
                    <p className="text-xs text-gray-500 truncate">{doc.original_filename}</p>
                  )}
                  {!isUploaded && hint && (
                    <p className="text-xs text-gray-400">{hint}</p>
                  )}
                </div>
              </div>

              {isUploaded ? (
                <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusCfg.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusCfg.label}
                </span>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="file"
                    ref={el => fileRefs.current[value] = el}
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={() => handleUpload(value)}
                  />
                  <button
                    onClick={() => fileRefs.current[value]?.click()}
                    disabled={!!uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {allUploaded && (
        <div className="mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          All required documents have been uploaded. They will be reviewed by HR.
        </div>
      )}
    </div>
  );
}
