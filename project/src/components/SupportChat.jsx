import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Loader2 } from 'lucide-react';

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Try backend API first, fall back to local response
      const response = await fetch('/api/support/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage.content }),
      }).catch(() => null);

      let answer;
      if (response?.ok) {
        const data = await response.json();
        answer = data.answer;
      } else {
        // Fallback: simple local response
        answer = generateLocalResponse(userMessage.content);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer,
        sources: [],
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your question. Please try again or contact HR directly.',
        sources: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const generateLocalResponse = (question) => {
    const q = question.toLowerCase();
    if (q.includes('holiday') || q.includes('leave') || q.includes('vacation')) {
      return 'Employees are entitled to 20 paid leave days per year, plus 10 public holidays. Leave requests should be submitted through the HR portal at least 5 days in advance.';
    }
    if (q.includes('insurance') || q.includes('health') || q.includes('medical')) {
      return 'The company provides comprehensive health insurance covering medical, dental, and vision. Coverage begins on your start date. Visit the HR portal for plan details.';
    }
    if (q.includes('salary') || q.includes('pay') || q.includes('compensation')) {
      return 'This information is restricted for your access level. Please contact HR directly for compensation-related queries.';
    }
    if (q.includes('training') || q.includes('onboarding')) {
      return 'All new hires complete mandatory training modules including Company Orientation and Security & Compliance Training. Department-specific training is also assigned based on your role.';
    }
    if (q.includes('policy') || q.includes('handbook')) {
      return 'The employee handbook covers all company policies including code of conduct, dress code, remote work policy, and more. It is available in the company knowledge base.';
    }
    return 'Thank you for your question. For specific inquiries, please contact HR at hr@company.com or visit the employee portal. I can help with general questions about leave policies, benefits, training, and company policies.';
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-sm font-medium">Support</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col" style={{ maxHeight: '500px' }}>
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Support Assistant</h3>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '340px' }}>
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Ask me anything about company policies, benefits, or onboarding.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources?.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-200 text-xs text-gray-500">
                      Sources: {msg.sources.map((s, j) => (
                        <span key={j}>{s.filename} p.{s.page}{j < msg.sources.length - 1 ? ', ' : ''}</span>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                </div>
                <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask a question..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
