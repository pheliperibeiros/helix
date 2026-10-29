import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, X, Send, Paperclip, Loader2, ArrowRight, User, 
  Bot, Trash2, RefreshCw, FileText, Image as ImageIcon, AlertCircle, Play
} from 'lucide-react';
import { sendChatMessage, ChatMessage } from '../services/geminiService';
import { GraphState, NodeType, NodeData, EdgeData } from '../types';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentGraph: GraphState;
  onApplyToolCalls: (calls: any[]) => void;
  onClearGraph: () => void;
}

export const AIPanel: React.FC<AIPanelProps> = ({ 
  isOpen, 
  onClose, 
  currentGraph, 
  onApplyToolCalls,
  onClearGraph
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Olá! Sou o **Hélix**, seu assistente de inteligência de grafos. \n\nVocê pode colar textos de investigações, denúncias ou anexar arquivos (.txt, .csv, .json ou imagens) e eu irei extrair e modelar os relacionamentos para você de forma agentica. \n\nComo posso ajudar hoje?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen) return null;

  // --- Handlers: File Attachments ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(files);
  };

  const processFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      const isImage = file.type.startsWith('image/');

      reader.onload = (e) => {
        const content = e.target?.result as string;
        const newAttachment = {
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type,
          content: content, // base64 or text data
          text: isImage ? undefined : content // Store raw text for document extraction
        };

        setAttachments(prev => [...prev, newAttachment]);
      };

      if (isImage) {
        reader.readAsDataURL(file); // Reads image as Base64 Data URL
      } else {
        reader.readAsText(file); // Reads txt, csv, json, etc. as plain text
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // --- Handlers: Drag & Drop ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  // --- Send Message and Call API ---
  const handleSend = async () => {
    const textToSend = inputValue.trim();
    if (!textToSend && attachments.length === 0) return;

    setError(null);
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachments.length > 0 ? [...attachments] : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setAttachments([]);
    setLoading(true);

    try {
      // Send chat history and current graph state to the server-side API
      const result = await sendChatMessage([...messages, userMessage], currentGraph);

      const modelMessage: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: result.text || 'Processamento concluído.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, modelMessage]);

      // Apply the agentic tool calls immediately to the main graph state
      if (result.functionCalls && result.functionCalls.length > 0) {
        onApplyToolCalls(result.functionCalls);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Houve um erro ao processar sua requisição.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Suggestion Chips ---
  const handleSuggestionClick = (prompt: string) => {
    setInputValue(prompt);
  };

  const suggestions = [
    "Crie um grafo com João (Pessoa) sócio da TechCorp (Empresa)",
    "Identifique os vínculos e organize em círculo",
    "Limpe o canvas para iniciar um novo caso"
  ];

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="absolute top-20 left-4 w-96 max-w-[calc(100vw-2rem)] h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden animation-fade-in"
      id="helix-chat-panel"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 p-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2.5 text-white">
          <div className="bg-white/10 p-1.5 rounded-lg">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight">Hélix AI</h3>
            <span className="text-[10px] text-indigo-200">Assistente Agentico de Grafos</span>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors"
          title="Fechar Assistente"
        >
          <X size={20} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map((msg) => {
          const isModel = msg.role === 'model';
          return (
            <div key={msg.id} className={`flex gap-3 ${isModel ? '' : 'flex-row-reverse'}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                isModel ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
              }`}>
                {isModel ? <Bot size={16} /> : <User size={16} />}
              </div>

              {/* Bubble */}
              <div className="max-w-[75%] flex flex-col gap-1">
                <div className={`p-3 rounded-2xl text-sm ${
                  isModel 
                    ? 'bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-sm' 
                    : 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10'
                }`}>
                  {/* Handle Markdown-like line breaks and bold */}
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.text.split('\n').map((line, idx) => {
                      // Simple regex for **bold** text replacement
                      const parts = line.split(/(\*\*.*?\*\*)/g);
                      return (
                        <p key={idx} className="mb-1 last:mb-0">
                          {parts.map((part, pIdx) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={pIdx} className={isModel ? 'text-slate-950 font-bold' : 'text-white font-bold'}>{part.slice(2, -2)}</strong>;
                            }
                            return part;
                          })}
                        </p>
                      );
                    })}
                  </div>

                  {/* Render Attachments inside the Bubble if user sent any */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-indigo-500/30 space-y-1.5">
                      {msg.attachments.map((att, attIdx) => {
                        const isAttImage = att.type?.startsWith('image/');
                        return (
                          <div 
                            key={attIdx} 
                            className={`flex items-center gap-2 p-1.5 rounded-lg text-xs ${
                              isModel ? 'bg-slate-50 text-slate-700 border border-slate-200' : 'bg-indigo-700/50 text-indigo-100'
                            }`}
                          >
                            {isAttImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                            <span className="truncate flex-1 font-medium">{att.name}</span>
                            <span className="opacity-70 text-[10px] shrink-0">{att.size}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] text-slate-400 px-1 ${!isModel ? 'text-right' : ''}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
              <Loader2 className="animate-spin text-indigo-600 shrink-0" size={18} />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800">Hélix está pensando...</p>
                <p className="text-[10px] text-slate-500 animate-pulse">Analisando dados e gerando modificações no grafo</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-start gap-2.5 text-red-700 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Erro de comunicação</p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Preview Area (Before Sending) */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2 shrink-0 max-h-24 overflow-y-auto">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs px-2.5 py-1 rounded-full shadow-sm max-w-[180px]">
              {att.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
              <span className="truncate flex-1 font-medium text-[11px]">{att.name}</span>
              <button 
                onClick={() => handleRemoveAttachment(idx)} 
                className="hover:bg-indigo-100 p-0.5 rounded-full text-indigo-500 hover:text-indigo-700"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Form & Action Bar */}
      <div className="p-3 border-t border-slate-200 bg-white shrink-0">
        {/* Suggestion Chips */}
        {messages.length === 1 && !loading && (
          <div className="mb-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sugestões rápidas</p>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(sug)}
                  className="text-left text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-between group"
                >
                  <span className="truncate mr-2">{sug}</span>
                  <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 text-indigo-600 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text Input Area */}
        <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            multiple
            accept=".txt,.csv,.json,.xml,.md,image/*"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition-colors shrink-0 disabled:opacity-50"
            title="Anexar documento ou imagem"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={loading}
            placeholder="Descreva modificações, anexe relatórios..."
            className="flex-1 bg-transparent border-0 focus:ring-0 text-sm text-slate-800 resize-none max-h-24 min-h-[38px] py-2 px-1 focus:outline-none"
            rows={1}
          />

          <button
            onClick={handleSend}
            disabled={loading || (!inputValue.trim() && attachments.length === 0)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg disabled:opacity-40 transition-colors shrink-0 shadow-md shadow-indigo-600/10"
            title="Enviar mensagem"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1 text-center">
          <span className="text-[9px] text-slate-400">Arraste e solte arquivos de texto ou imagens diretamente no chat</span>
        </div>
      </div>
    </div>
  );
};

export default AIPanel;
