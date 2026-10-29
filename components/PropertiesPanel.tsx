
import React, { useRef, useState } from 'react';
import { X, Upload, User, Trash2, ArrowRight, ArrowLeftRight, Minus, Sparkles, Image as ImageIcon, StickyNote, ChevronDown, AlignJustify, MoreHorizontal, Activity, Palette } from 'lucide-react';
import { NodeData, EdgeData, NodeType, DetailItem, ShapeData } from '../types';
import { 
  CreditCard, Briefcase, Flag, FileText, Phone, Mail, Home, DollarSign, 
  Car, AlertTriangle, Globe, File, Landmark, Calendar, MapPin,
  Clock, Key, Lock, Shield, Trophy, Heart, Star, Zap, ShoppingCart, Camera, Video, Music, Search, Link, Hash
} from 'lucide-react';

interface PropertiesPanelProps {
  selectedNode: NodeData | null;
  selectedEdge: EdgeData | null;
  selectedShape: ShapeData | null;
  onClose: () => void;
  onUpdateNode: (id: string, data: Partial<NodeData>) => void;
  onUpdateEdge: (id: string, data: Partial<EdgeData>) => void;
  onUpdateShape: (id: string, data: Partial<ShapeData>) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteShape: (id: string) => void;
}

const COLORS = ['#94a3b8', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#000000'];
const AURA_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#00ffff'];
const SHAPE_COLORS = [
    { label: 'Cinza', val: 'rgba(148, 163, 184, 0.2)', border: '#94a3b8' },
    { label: 'Azul', val: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6' },
    { label: 'Verde', val: 'rgba(34, 197, 94, 0.2)', border: '#22c55e' },
    { label: 'Vermelho', val: 'rgba(239, 68, 68, 0.2)', border: '#ef4444' },
    { label: 'Amarelo', val: 'rgba(234, 179, 8, 0.2)', border: '#eab308' },
    { label: 'Roxo', val: 'rgba(168, 85, 247, 0.2)', border: '#a855f7' },
];

const POSTIT_COLORS = [
  { label: 'Amarelo', val: '#fef08a', border: '#eab308' },
  { label: 'Rosa', val: '#fbcfe8', border: '#ec4899' },
  { label: 'Azul', val: '#bfdbfe', border: '#3b82f6' },
  { label: 'Verde', val: '#bbf7d0', border: '#22c55e' },
  { label: 'Laranja', val: '#fed7aa', border: '#f97316' },
  { label: 'Roxo', val: '#e9d5ff', border: '#a855f7' },
];

// Translation Map
const TYPE_LABELS: Record<NodeType, string> = {
  [NodeType.PERSON]: 'Pessoa',
  [NodeType.ORGANIZATION]: 'Organização',
  [NodeType.EVENT]: 'Evento',
  [NodeType.LOCATION]: 'Local',
  [NodeType.GENERIC]: 'Genérico',
  [NodeType.IMAGE]: 'Imagem (Canvas)',
  [NodeType.POSTIT]: 'Post-it (Observação)'
};

// Main Icons List
const MAIN_ICONS = [
    { val: '', label: 'Padrão' },
    { val: 'user', label: 'Pessoa' },
    { val: 'building', label: 'Prédio' },
    { val: 'car', label: 'Veículo' },
    { val: 'home', label: 'Casa' },
    { val: 'money', label: 'Dinheiro' },
    { val: 'file', label: 'Doc' },
    { val: 'alert', label: 'Alerta' },
    { val: 'phone', label: 'Telefone' },
    { val: 'globe', label: 'Mundo' },
    { val: 'search', label: 'Lupa' },
    { val: 'lock', label: 'Cadeado' },
    { val: 'shield', label: 'Escudo' },
];

// Detail Icons List for Grid (Expanded)
const DETAIL_ICONS_LIST = [
    'money', 'calendar', 'id', 'phone', 'mail', 'map', 'briefcase', 
    'car', 'alert', 'file', 'bank', 'home', 'globe', 'flag', 'credit',
    'clock', 'key', 'lock', 'shield', 'trophy', 'heart', 'star', 'zap',
    'cart', 'camera', 'video', 'music', 'search', 'link', 'hash'
];

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  selectedEdge,
  selectedShape,
  onClose,
  onUpdateNode,
  onUpdateEdge,
  onUpdateShape,
  onDeleteNode,
  onDeleteEdge,
  onDeleteShape
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openIconSelectorId, setOpenIconSelectorId] = useState<string | null>(null);

  if (!selectedNode && !selectedEdge && !selectedShape) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedNode) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        if (selectedNode.type === NodeType.IMAGE) {
          const img = new window.Image();
          img.onload = () => {
            const maxWidth = 380;
            const maxHeight = 280;
            const natW = img.naturalWidth || 240;
            const natH = img.naturalHeight || 180;
            const ratio = Math.min(maxWidth / natW, maxHeight / natH, 1);
            let w = Math.round(natW * ratio);
            let h = Math.round(natH * ratio);
            if (w < 100) {
              const up = 100 / Math.max(1, w);
              w = 100;
              h = Math.max(20, Math.round(h * up));
            }
            onUpdateNode(selectedNode.id, { customImage: dataUrl, width: w, height: Math.max(20, h) });
          };
          img.src = dataUrl;
        } else {
          onUpdateNode(selectedNode.id, { customImage: dataUrl });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Helper Component for Icon ---
  const DetailIconRenderer = ({ iconName, size = 14 }: { iconName: string, size?: number }) => {
     switch(iconName) {
        case 'id': return <FileText size={size} />;
        case 'calendar': return <Calendar size={size} />;
        case 'briefcase': return <Briefcase size={size} />;
        case 'map': return <MapPin size={size} />;
        case 'credit': return <CreditCard size={size} />;
        case 'flag': return <Flag size={size} />;
        case 'phone': return <Phone size={size} />;
        case 'mail': return <Mail size={size} />;
        case 'home': return <Home size={size} />;
        case 'money': return <DollarSign size={size} />;
        case 'car': return <Car size={size} />;
        case 'alert': return <AlertTriangle size={size} />;
        case 'globe': return <Globe size={size} />;
        case 'file': return <File size={size} />;
        case 'bank': return <Landmark size={size} />;
        
        // New Icons
        case 'clock': return <Clock size={size} />;
        case 'key': return <Key size={size} />;
        case 'lock': return <Lock size={size} />;
        case 'shield': return <Shield size={size} />;
        case 'trophy': return <Trophy size={size} />;
        case 'heart': return <Heart size={size} />;
        case 'star': return <Star size={size} />;
        case 'zap': return <Zap size={size} />;
        case 'cart': return <ShoppingCart size={size} />;
        case 'camera': return <Camera size={size} />;
        case 'video': return <Video size={size} />;
        case 'music': return <Music size={size} />;
        case 'search': return <Search size={size} />;
        case 'link': return <Link size={size} />;
        case 'hash': return <Hash size={size} />;
        
        default: return <DollarSign size={size} />;
     }
  }

  // --- Detail Helpers ---
  const addDetail = (isNode: boolean) => {
    const id = isNode ? selectedNode!.id : selectedEdge!.id;
    const currentDetails = isNode ? selectedNode!.details : selectedEdge!.details;
    const updater = isNode ? onUpdateNode : onUpdateEdge;

    const newDetail: DetailItem = {
      id: Date.now().toString(),
      icon: isNode ? 'id' : 'money',
      value: ''
    };
    
    // @ts-ignore
    updater(id, { details: [...(currentDetails || []), newDetail] });
  };

  const updateDetail = (isNode: boolean, detailId: string, field: keyof DetailItem, value: string) => {
     const id = isNode ? selectedNode!.id : selectedEdge!.id;
     const currentDetails = isNode ? selectedNode!.details : selectedEdge!.details;
     const updater = isNode ? onUpdateNode : onUpdateEdge;

    if (currentDetails) {
      const newDetails = currentDetails.map(d => 
        d.id === detailId ? { ...d, [field]: value } : d
      );
      // @ts-ignore
      updater(id, { details: newDetails });
    }
  };

  const removeDetail = (isNode: boolean, detailId: string) => {
     const id = isNode ? selectedNode!.id : selectedEdge!.id;
     const currentDetails = isNode ? selectedNode!.details : selectedEdge!.details;
     const updater = isNode ? onUpdateNode : onUpdateEdge;

    if (currentDetails) {
      // @ts-ignore
      updater(id, {
        details: currentDetails.filter(d => d.id !== detailId)
      });
    }
  };

  // Render the Detail Editor Rows with Icon Grid
  const renderDetailEditor = (isNode: boolean) => {
      const details = isNode ? selectedNode!.details : selectedEdge!.details;
      return (
        <div className="space-y-3">
            <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-slate-500 uppercase">Detalhes (Infos)</label>
            <button onClick={() => addDetail(isNode)} className="text-xs text-blue-600 hover:underline font-medium">
                + Adicionar
            </button>
            </div>
            
            <div className="space-y-2">
            {(details || []).map(detail => (
                <div key={detail.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200 relative">
                    {/* Icon Selector Trigger */}
                    <div className="relative">
                        <button 
                            onClick={() => setOpenIconSelectorId(openIconSelectorId === detail.id ? null : detail.id)}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-slate-300 rounded hover:bg-slate-100 text-slate-600"
                        >
                            <DetailIconRenderer iconName={detail.icon} />
                        </button>

                        {/* Grid Popover */}
                        {openIconSelectorId === detail.id && (
                            <div className="absolute bottom-full left-0 mb-1 w-64 p-2 bg-white border border-slate-200 shadow-xl rounded-lg z-50 grid grid-cols-6 gap-1">
                                {DETAIL_ICONS_LIST.map(iconName => (
                                    <button
                                        key={iconName}
                                        onClick={() => {
                                            updateDetail(isNode, detail.id, 'icon', iconName);
                                            setOpenIconSelectorId(null);
                                        }}
                                        className={`p-1.5 rounded hover:bg-blue-50 text-slate-600 flex justify-center items-center ${detail.icon === iconName ? 'bg-blue-100 text-blue-600' : ''}`}
                                        title={iconName}
                                    >
                                        <DetailIconRenderer iconName={iconName} size={16} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* Close Popover Overlay if open */}
                    {openIconSelectorId === detail.id && (
                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpenIconSelectorId(null)} />
                    )}

                    <input
                        type="text"
                        value={detail.value}
                        onChange={(e) => updateDetail(isNode, detail.id, 'value', e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none min-w-0 border-b border-transparent focus:border-blue-300 pb-0.5 transition-colors"
                        placeholder="Valor..."
                    />
                    <button 
                        onClick={() => removeDetail(isNode, detail.id)}
                        className="text-slate-400 hover:text-red-500"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
            {(details?.length === 0 || !details) && (
                <p className="text-xs text-slate-400 italic text-center py-2">Nenhum detalhe adicionado.</p>
            )}
            </div>
        </div>
      );
  }

  return (
    <div id="properties-panel" className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 flex flex-col max-h-[90vh] overflow-hidden animation-fade-in">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700">
          {selectedNode ? 'Editar Entidade' : selectedEdge ? 'Editar Conexão' : 'Editar Forma'}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-6 pb-20">
        
        {/* NODE EDITOR */}
        {selectedNode && (
          <>
            {/* Basic Info */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-500 uppercase">
                {selectedNode.type === NodeType.IMAGE
                  ? 'Legenda / Rótulo (Opcional)'
                  : selectedNode.type === NodeType.POSTIT
                  ? 'Título do Post-it (Opcional)'
                  : 'Nome / Rótulo'}
              </label>
              <input
                type="text"
                value={selectedNode.label}
                placeholder={
                  selectedNode.type === NodeType.IMAGE
                    ? 'Sem legenda (estilo Obsidian Canvas)...'
                    : selectedNode.type === NodeType.POSTIT
                    ? 'Ex: Observação importante...'
                    : 'Nome da entidade...'
                }
                onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-blue-500 outline-none"
              />
              
              <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Tipo</label>
                    <select
                        value={selectedNode.type}
                        onChange={(e) => {
                          const newType = e.target.value as NodeType;
                          const updates: Partial<NodeData> = { type: newType };
                          if (newType === NodeType.IMAGE && !selectedNode.width) {
                            updates.width = 240;
                            updates.height = 180;
                          } else if (newType === NodeType.POSTIT) {
                            if (!selectedNode.width) updates.width = 220;
                            if (!selectedNode.height) updates.height = 180;
                            if (!selectedNode.noteColor) updates.noteColor = '#fef08a';
                          }
                          onUpdateNode(selectedNode.id, updates);
                        }}
                        className="w-full p-2 border border-slate-200 rounded text-sm bg-white focus:border-blue-500 outline-none"
                    >
                        {Object.values(NodeType).map(t => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                        ))}
                    </select>
                  </div>
                  {selectedNode.type !== NodeType.IMAGE && selectedNode.type !== NodeType.POSTIT && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Ícone Principal</label>
                      <select
                          value={selectedNode.mainIcon || ''}
                          onChange={(e) => onUpdateNode(selectedNode.id, { mainIcon: e.target.value })}
                          className="w-full p-2 border border-slate-200 rounded text-sm bg-white focus:border-blue-500 outline-none"
                      >
                          {MAIN_ICONS.map(i => (
                              <option key={i.val} value={i.val}>{i.label}</option>
                          ))}
                      </select>
                    </div>
                  )}
              </div>
            </div>

            {/* Post-it Observation Editor */}
            {selectedNode.type === NodeType.POSTIT && (
              <div className="space-y-3 bg-yellow-50/60 p-3 rounded-lg border border-yellow-200">
                <label className="block text-xs font-medium text-yellow-800 uppercase flex items-center gap-1.5">
                  <StickyNote size={14} /> Texto da Observação
                </label>
                <textarea
                  rows={5}
                  value={selectedNode.noteText || ''}
                  placeholder="Digite aqui a observação ou anotação para vincular a outras entidades..."
                  onChange={(e) => onUpdateNode(selectedNode.id, { noteText: e.target.value })}
                  className="w-full p-2.5 border border-yellow-300 rounded-lg text-sm bg-white focus:border-yellow-500 outline-none resize-y leading-relaxed"
                />

                <div>
                  <span className="block text-xs font-medium text-slate-500 uppercase mb-1.5">Cor do Post-it</span>
                  <div className="flex flex-wrap gap-2">
                    {POSTIT_COLORS.map(c => (
                      <button
                        key={c.val}
                        type="button"
                        onClick={() => onUpdateNode(selectedNode.id, { noteColor: c.val })}
                        className={`w-7 h-7 rounded-lg border-2 transition-transform ${
                          (selectedNode.noteColor || '#fef08a') === c.val
                            ? 'scale-110 ring-2 ring-offset-1 ring-slate-500'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.val, borderColor: c.border }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-yellow-200/80 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-slate-600">
                    <span>Largura do Post-it</span>
                    <span className="font-mono text-[10px]">{Math.round(selectedNode.width || 220)} × {Math.round(selectedNode.height || 180)} px</span>
                  </div>
                  <input
                    type="range"
                    min="140"
                    max="500"
                    step="10"
                    value={selectedNode.width || 220}
                    onChange={(e) => {
                      const newWidth = parseInt(e.target.value, 10);
                      onUpdateNode(selectedNode.id, { width: newWidth });
                    }}
                    className="w-full h-1 bg-yellow-200 rounded-lg appearance-none cursor-pointer accent-yellow-600"
                  />
                  <p className="text-[10px] text-slate-500">Você também pode redimensionar pelo canto inferior direito do Post-it no canvas.</p>
                </div>
              </div>
            )}

            {/* Image & Aura */}
            <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
              {selectedNode.type !== NodeType.POSTIT && (
                <>
                  <label className="block text-xs font-medium text-slate-500 uppercase flex items-center gap-2">
                      <ImageIcon size={14} /> {selectedNode.type === NodeType.IMAGE ? 'Imagem do Card & Dimensões' : 'Visual & Foto'}
                  </label>
                  
                  {/* Image Upload */}
                  <div className="flex gap-2 items-center">
                    <div className={`${selectedNode.type === NodeType.IMAGE ? 'w-16 h-16' : 'w-12 h-16'} rounded bg-white border border-slate-200 overflow-hidden flex items-center justify-center shadow-sm shrink-0`}>
                      {selectedNode.customImage ? (
                        <img src={selectedNode.customImage} alt="Node" className="w-full h-full object-cover" />
                      ) : (
                        <User size={24} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded flex items-center gap-1 w-full justify-center"
                        >
                        <Upload size={12} /> {selectedNode.type === NodeType.IMAGE ? 'Trocar Imagem' : 'Upload Foto (3x4)'}
                        </button>
                        <span className="text-[10px] text-slate-400 text-center leading-tight">
                          Ou use <strong>Ctrl+V</strong> para colar foto
                        </span>
                        {selectedNode.customImage && selectedNode.type !== NodeType.IMAGE && (
                        <button 
                            onClick={() => onUpdateNode(selectedNode.id, { customImage: undefined })}
                            className="text-xs text-red-500 hover:underline text-center px-1"
                        >
                            Remover foto
                        </button>
                        )}
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleImageUpload} 
                    />
                  </div>
                </>
              )}

              {selectedNode.type === NodeType.IMAGE && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                    <span>Tamanho no Canvas</span>
                    <span className="font-mono text-[10px]">{Math.round(selectedNode.width || 240)} × {Math.round(selectedNode.height || 180)} px</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="600"
                    step="10"
                    value={selectedNode.width || 240}
                    onChange={(e) => {
                      const newWidth = parseInt(e.target.value, 10);
                      const curW = selectedNode.width || 240;
                      const curH = selectedNode.height || 180;
                      const ratio = curH / curW;
                      onUpdateNode(selectedNode.id, {
                        width: newWidth,
                        height: Math.max(20, Math.round(newWidth * ratio))
                      });
                    }}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                  <p className="text-[10px] text-slate-400">Você também pode redimensionar pelo canto inferior direito do card no canvas.</p>
                </div>
              )}

              {/* Aura/Highlight */}
              <div className={selectedNode.type !== NodeType.POSTIT ? "pt-2 border-t border-slate-200 mt-2" : ""}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Sparkles size={12}/> Destaque (Aura)</span>
                    {selectedNode.highlightColor && (
                        <button onClick={() => onUpdateNode(selectedNode.id, { highlightColor: undefined })} className="text-xs text-slate-400 hover:text-red-500">Remover</button>
                    )}
                  </div>
                  
                  {/* Color Picker */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {AURA_COLORS.map(color => (
                         <button
                            key={color}
                            onClick={() => onUpdateNode(selectedNode.id, { highlightColor: color })}
                            className={`w-5 h-5 rounded-full shadow-sm transition-transform ${selectedNode.highlightColor === color ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                            style={{ backgroundColor: color }}
                        />
                    ))}
                  </div>

                  {/* Aura Size Slider */}
                  {selectedNode.highlightColor && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">Intensidade</span>
                        <input 
                            type="range" 
                            min="10" 
                            max="100" 
                            step="5"
                            value={selectedNode.highlightSize || 20}
                            onChange={(e) => onUpdateNode(selectedNode.id, { highlightSize: parseInt(e.target.value) })}
                            className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                    </div>
                  )}
              </div>
            </div>

            {/* Details List */}
            {renderDetailEditor(true)}
             
            <div className="pt-4 border-t border-slate-100">
                <button 
                    onClick={() => onDeleteNode(selectedNode.id)}
                    className="w-full flex items-center justify-center gap-2 text-red-500 bg-red-50 hover:bg-red-100 p-2 rounded transition-colors text-sm font-medium"
                >
                    <Trash2 size={16} /> Excluir Nó
                </button>
            </div>
          </>
        )}

        {/* EDGE EDITOR */}
        {selectedEdge && (
          <>
             <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-500 uppercase">Rótulo / Ação</label>
              <input
                type="text"
                value={selectedEdge.label || ''}
                onChange={(e) => onUpdateEdge(selectedEdge.id, { label: e.target.value })}
                placeholder="Ex: Sócio de, Pagou para..."
                className="w-full p-2 border border-slate-200 rounded text-sm focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Direction */}
                <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-500 uppercase">Direção</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => onUpdateEdge(selectedEdge.id, { direction: 'uni' })}
                            className={`flex-1 py-1.5 flex justify-center rounded ${selectedEdge.direction === 'uni' || !selectedEdge.direction ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Unidirecional"
                        >
                            <ArrowRight size={18} />
                        </button>
                        <button 
                            onClick={() => onUpdateEdge(selectedEdge.id, { direction: 'bi' })}
                            className={`flex-1 py-1.5 flex justify-center rounded ${selectedEdge.direction === 'bi' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Bidirecional"
                        >
                            <ArrowLeftRight size={18} />
                        </button>
                        <button 
                            onClick={() => onUpdateEdge(selectedEdge.id, { direction: 'none' })}
                            className={`flex-1 py-1.5 flex justify-center rounded ${selectedEdge.direction === 'none' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Sem seta"
                        >
                            <Minus size={18} />
                        </button>
                    </div>
                </div>

                {/* Line Style */}
                 <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-500 uppercase">Estilo</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => onUpdateEdge(selectedEdge.id, { style: 'solid' })}
                            className={`flex-1 py-1.5 flex justify-center rounded ${selectedEdge.style === 'solid' || !selectedEdge.style ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Sólida"
                        >
                            <AlignJustify size={18} className="rotate-90" />
                        </button>
                        <button 
                            onClick={() => onUpdateEdge(selectedEdge.id, { style: 'dashed' })}
                            className={`flex-1 py-1.5 flex justify-center rounded ${selectedEdge.style === 'dashed' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Tracejada"
                        >
                            <MoreHorizontal size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Curvature & Color */}
            <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="space-y-2">
                   <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                            <Activity size={14} /> Curvatura / Espaçamento
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                            {selectedEdge.curvatureOffset || 0}px
                        </span>
                   </div>
                   <input 
                        type="range" 
                        min="-150" 
                        max="150" 
                        step="10"
                        value={selectedEdge.curvatureOffset || 0}
                        onChange={(e) => onUpdateEdge(selectedEdge.id, { curvatureOffset: parseInt(e.target.value) })}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <p className="text-[10px] text-slate-400">Ajuste manual para separar linhas sobrepostas.</p>
                </div>

                <div className="pt-2 border-t border-slate-200">
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-2">Cor da Linha</label>
                    <div className="flex flex-wrap gap-2">
                        {COLORS.map(color => (
                            <button
                                key={color}
                                onClick={() => onUpdateEdge(selectedEdge.id, { color })}
                                className={`w-6 h-6 rounded-full border-2 ${selectedEdge.color === color ? 'border-slate-600 scale-110' : 'border-transparent hover:scale-110'} transition-transform`}
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>
                </div>
            </div>

             {/* Edge Details List */}
             {renderDetailEditor(false)}

            <div className="pt-4 border-t border-slate-100">
                <button 
                    onClick={() => onDeleteEdge(selectedEdge.id)}
                    className="w-full flex items-center justify-center gap-2 text-red-500 bg-red-50 hover:bg-red-100 p-2 rounded transition-colors text-sm font-medium"
                >
                    <Trash2 size={16} /> Excluir Conexão
                </button>
            </div>
          </>
        )}

        {/* SHAPE EDITOR */}
        {selectedShape && (
            <>
                <div className="space-y-3">
                    <label className="block text-xs font-medium text-slate-500 uppercase">Rótulo</label>
                    <input
                        type="text"
                        value={selectedShape.label || ''}
                        onChange={(e) => onUpdateShape(selectedShape.id, { label: e.target.value })}
                        placeholder="Nome do grupo..."
                        className="w-full p-2 border border-slate-200 rounded text-sm focus:border-blue-500 outline-none"
                    />
                </div>

                <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <label className="block text-xs font-medium text-slate-500 uppercase flex items-center gap-2 mb-2">
                        <Palette size={14} /> Cor de Fundo
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SHAPE_COLORS.map((c) => (
                            <button
                                key={c.val}
                                onClick={() => onUpdateShape(selectedShape.id, { color: c.val })}
                                className={`w-8 h-8 rounded border transition-transform ${selectedShape.color === c.val ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                                style={{ backgroundColor: c.val, borderColor: c.border }}
                                title={c.label}
                            />
                        ))}
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                    <button 
                        onClick={() => onDeleteShape(selectedShape.id)}
                        className="w-full flex items-center justify-center gap-2 text-red-500 bg-red-50 hover:bg-red-100 p-2 rounded transition-colors text-sm font-medium"
                    >
                        <Trash2 size={16} /> Excluir Forma
                    </button>
                </div>
            </>
        )}

      </div>
    </div>
  );
};

export default PropertiesPanel;
