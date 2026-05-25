const GATEWAY_URL = 'http://localhost:8000';

async function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Try local gateway token first
  const userStr = localStorage.getItem('user');
  if (userStr) {
    const user = JSON.parse(userStr);
    if (user.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
      return headers;
    }
  }

  // Fallback: check Supabase session token
  const keys = Object.keys(localStorage);
  const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  if (sbKey) {
    const sbData = JSON.parse(localStorage.getItem(sbKey) || '{}');
    if (sbData.access_token) {
      headers['Authorization'] = `Bearer ${sbData.access_token}`;
    }
  }
  return headers;
}

export const db = {
  async login(email, password) {
    const response = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Incorrect email or password');
    }
    
    const data = await response.json();
    const userProfile = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      reset_required: data.user.reset_required,
      token: data.access_token
    };
    
    localStorage.setItem('user', JSON.stringify(userProfile));
    return userProfile;
  },

  async resetPassword(newPassword) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/auth/reset-password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ new_password: newPassword }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Password reset failed');
    }
    return await response.json();
  },

  async getCandidateForUser(userId) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/candidates/me`, { headers });
    if (!response.ok) throw new Error('Failed to fetch candidate profile');
    const data = await response.json();
    return data.candidate;
  },

  async getDocuments(candidateId) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/candidates/me`, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    
    const docs = [];
    
    // 1. Process verification_records
    const vRecs = data.verification_records || [];
    vRecs.forEach(v => {
      docs.push({
        doc_type: v.document_type,
        original_filename: `${v.document_type.replace('_', ' ').toUpperCase()} Uploaded`,
        status: v.status
      });
    });

    // 2. Add fallbacks from extracted document details if records didn't capture them
    const docData = data.documents;
    if (docData) {
      if (docData.pan_number && !docs.some(d => d.doc_type === 'pan_card')) {
        docs.push({ doc_type: 'pan_card', original_filename: 'PAN Card Verified', status: docData.verification_status });
      }
      if (docData.aadhaar_number && !docs.some(d => d.doc_type === 'aadhaar_card')) {
        docs.push({ doc_type: 'aadhaar_card', original_filename: 'Aadhaar Card Verified', status: docData.verification_status });
      }
      if (docData.bank_account_number && !docs.some(d => d.doc_type === 'bank_document')) {
        docs.push({ doc_type: 'bank_document', original_filename: 'Bank Verification Done', status: docData.verification_status });
      }
    }
    
    return docs;
  },

  async uploadDocument(docType, file) {
    const headers = await getHeaders();
    
    const toBase64 = file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
    
    const base64Data = await toBase64(file);

    const response = await fetch(`${GATEWAY_URL}/candidates/documents/upload`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        doc_type: docType,
        file_name: file.name,
        file_base64: base64Data,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to upload document');
    }
    return await response.json();
  },

  async verifyBank(accountNumber, ifsc, fullName) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/candidates/bank/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bank_account_number: accountNumber,
        ifsc_code: ifsc,
        full_name: fullName,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to verify bank details');
    }
    return await response.json();
  },

  async esignOfferLetter(signatureData, ipAddress) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/candidates/sign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        signature_data: signatureData,
        ip_address: ipAddress,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to sign offer letter');
    }
    return await response.json();
  },

  async getCandidates() {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/hr/candidates`, { headers });
    if (!response.ok) throw new Error('Failed to fetch candidates');
    const list = await response.json();
    return list.map(c => ({
      ...c,
      user: { name: c.name, email: c.email }
    }));
  },

  async getOnboardingTasks(candidateId) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/hr/candidates/${candidate_id}/session`, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    const events = data.events || [];
    return events.map(e => ({
      id: e.id,
      task_type: e.event_type,
      agent_name: e.processed_by || 'orchestrator',
      status: 'completed',
      updated_at: e.created_at
    }));
  },

  async inviteCandidate(newHire) {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/hr/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: newHire.name,
        email: newHire.email,
        department: newHire.department,
        job_title: newHire.job_title,
        start_date: newHire.start_date
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to invite candidate');
    }
    const data = await response.json();
    return {
      success: true,
      user: { email: newHire.email, name: newHire.name },
      candidate: { job_title: newHire.job_title, department: newHire.department, start_date: newHire.start_date },
      temp_password: data.temp_password,
      email_sent: true
    };
  },

  async getPendingApprovals(role) {
    // approvals handled automatically in background now
    return [];
  },

  async getITCandidates() {
    const headers = await getHeaders();
    const response = await fetch(`${GATEWAY_URL}/it/candidates`, { headers });
    if (!response.ok) throw new Error('Failed to fetch IT profiles');
    return await response.json();
  },

  async getStats() {
    const list = await this.getCandidates();
    const statusCounts = {};
    list.forEach(c => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    });
    return {
      total_candidates: list.length,
      candidates_by_status: statusCounts,
      pending_approvals: 0,
      total_users: list.length + 3
    };
  }
};
export const supabase = {
  auth: {
    async getSession() {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        return { data: { session: { access_token: JSON.parse(userStr).token } } };
      }
      return { data: { session: null } };
    },
    onAuthStateChange(cb) {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signOut() {
      localStorage.removeItem('user');
    }
  }
};
