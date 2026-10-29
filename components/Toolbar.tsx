
import React, { useState, useRef } from 'react';
import { Trash2, Download, ZoomIn, ZoomOut, User, Building, MapPin, Calendar, Square, Image, StickyNote, FileCode, Camera, Save, FolderOpen, MousePointer2, Circle, Minus, LayoutGrid, CircleDot, Layers, GitFork, Share2, Shuffle, Sparkles } from 'lucide-react';
import { NodeType, ShapeType } from '../types';

interface ToolbarProps {
  onAddNode: (type: NodeType) => void;
  onAddImageFiles: (files: FileList) => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDownload: (format: 'png' | 'jpeg' | 'svg') => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  scale: number;
  activeTool: 'CURSOR' | ShapeType;
  onSetTool: (tool: 'CURSOR' | ShapeType) => void;
  onAutoLayout: (layoutType: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ 
    onAddNode, onAddImageFiles, onClear, onZoomIn, onZoomOut, onDownload, 
    onSaveProject, onLoadProject, scale, activeTool, onSetTool,
    onAutoLayout
}) => {
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          onLoadProject(file);
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
          onAddImageFiles(files);
      }
      if (imageInputRef.current) imageInputRef.current.value = '';
  };

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-lg border border-slate-200 p-2 flex items-center gap-2 z-50">
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".hlx" 
        onChange={handleFileChange}
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        className="hidden" 
        accept="image/*" 
        multiple
        onChange={handleImageFileChange}
      />

      {/* Shapes & Tools */}
      <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-2">
         <button 
            onClick={() => onSetTool('CURSOR')} 
            className={`p-2 rounded-lg ${activeTool === 'CURSOR' ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} 
            title="Selecionar / Mover"
        >
            <MousePointer2 size={20} />
        </button>
        <div className="w-px h-6 bg-slate-200 mx-1"></div>
        <button 
            onClick={() => onSetTool('rectangle')} 
            className={`p-2 rounded-lg ${activeTool === 'rectangle' ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} 
            title="Desenhar Retângulo (Grupo)"
        >
            <Square size={20} />
        </button>
        <button 
            onClick={() => onSetTool('circle')} 
            className={`p-2 rounded-lg ${activeTool === 'circle' ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} 
            title="Desenhar Círculo (Grupo)"
        >
            <Circle size={20} />
        </button>
        <button 
            onClick={() => onSetTool('line')} 
            className={`p-2 rounded-lg ${activeTool === 'line' ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} 
            title="Desenhar Linha Livre"
        >
            <Minus size={20} className="-rotate-45" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-2">
        <button onClick={() => onAddNode(NodeType.PERSON)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 tooltip-trigger" title="Adicionar Pessoa">
            <User size={20} className="text-blue-500" />
        </button>
        <button onClick={() => onAddNode(NodeType.ORGANIZATION)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Adicionar Organização">
            <Building size={20} className="text-purple-500" />
        </button>
        <button onClick={() => onAddNode(NodeType.LOCATION)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Adicionar Local">
            <MapPin size={20} className="text-green-500" />
        </button>
        <button onClick={() => onAddNode(NodeType.EVENT)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Adicionar Evento">
            <Calendar size={20} className="text-orange-500" />
        </button>
        <button onClick={() => onAddNode(NodeType.GENERIC)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Nó Genérico">
            <Square size={20} className="text-slate-500" />
        </button>
        <button onClick={() => onAddNode(NodeType.POSTIT)} className="p-2 hover:bg-amber-50 rounded-lg text-slate-600" title="Adicionar Post-it (Observação)">
            <StickyNote size={20} className="text-amber-500 fill-amber-100" />
        </button>
        <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Inserir Imagem como Entidade (ou Ctrl+V no Canvas)">
            <Image size={20} className="text-pink-500" />
        </button>
      </div>

      {/* Auto Layout Selector */}
      <div className="relative flex items-center border-r border-slate-200 pr-2 mr-2">
         <button 
             onClick={() => setShowLayoutMenu(!showLayoutMenu)} 
             className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 flex items-center gap-1.5 transition-colors" 
             title="Organização Automática"
         >
             <LayoutGrid size={18} className="text-indigo-600" />
             <span className="text-xs font-semibold text-slate-700 hidden md:inline">Organizar</span>
         </button>
         
         {showLayoutMenu && (
             <>
                 <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)}></div>
                 <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-50 flex flex-col py-1.5 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                     <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1">
                         Layout Automático
                     </div>
                     <button 
                         onClick={() => { onAutoLayout('no-cross'); setShowLayoutMenu(false); }}
                         className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50/70 flex items-center gap-2.5 border-b border-slate-100 mb-1"
                     >
                         <Sparkles size={15} className="text-indigo-600 shrink-0" />
                         <div>
                             <div className="font-semibold text-indigo-700">Sem Cruzamentos</div>
                             <div className="text-[10px] text-slate-500">Evita cruzamento de conexões e sobreposição</div>
                         </div>
                     </button>
                     <button 
                         onClick={() => { onAutoLayout('grid'); setShowLayoutMenu(false); }}
                         className="px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                     >
                         <LayoutGrid size={14} className="text-slate-500" />
                         <div>
                             <div className="font-medium text-slate-800">Grade (Grid)</div>
                             <div className="text-[10px] text-slate-400">Distribui em linhas e colunas</div>
                         </div>
                     </button>
                     <button 
                         onClick={() => { onAutoLayout('circle'); setShowLayoutMenu(false); }}
                         className="px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                     >
                         <CircleDot size={14} className="text-slate-500" />
                         <div>
                             <div className="font-medium text-slate-800">Circular (Círculo)</div>
                             <div className="text-[10px] text-slate-400">Arranja os nós em círculo</div>
                         </div>
                     </button>
                     <button 
                         onClick={() => { onAutoLayout('dual-ring'); setShowLayoutMenu(false); }}
                         className="px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                     >
                         <Layers size={14} className="text-slate-500" />
                         <div>
                             <div className="font-medium text-slate-800">Duplo Anel</div>
                             <div className="text-[10px] text-slate-400">Nós centrais internos, demais externos</div>
                         </div>
                     </button>
                     <button 
                         onClick={() => { onAutoLayout('hierarchical'); setShowLayoutMenu(false); }}
                         className="px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                     >
                         <GitFork size={14} className="text-slate-500 rotate-180" />
                         <div>
                             <div className="font-medium text-slate-800">Hierárquico</div>
                             <div className="text-[10px] text-slate-400">Alinha por tipo de entidade</div>
                         </div>
                     </button>
                     <button 
                         onClick={() => { onAutoLayout('star'); setShowLayoutMenu(false); }}
                         className="px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                     >
                         <Share2 size={14} className="text-slate-500" />
                         <div>
                             <div className="font-medium text-slate-800">Estrela (Concentrado)</div>
                             <div className="text-[10px] text-slate-400">Nó mais conectado no centro</div>
                         </div>
                     </button>
                     <button 
                         onClick={() => { onAutoLayout('random'); setShowLayoutMenu(false); }}
                         className="px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 border-t border-slate-100 mt-1 pt-1.5"
                     >
                         <Shuffle size={14} className="text-slate-500" />
                         <div>
                             <div className="font-medium text-slate-800">Aleatório</div>
                             <div className="text-[10px] text-slate-400">Espalha as entidades aleatoriamente</div>
                         </div>
                     </button>
                 </div>
             </>
         )}
      </div>

      <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-2">
         <button onClick={onZoomOut} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <ZoomOut size={18} />
        </button>
        <span className="text-xs font-medium w-12 text-center text-slate-500">{Math.round(scale * 100)}%</span>
        <button onClick={onZoomIn} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <ZoomIn size={18} />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-2">
        <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Abrir Projeto (.hlx)">
            <FolderOpen size={18} />
        </button>
        <button onClick={onSaveProject} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Salvar Projeto (.hlx)">
            <Save size={18} />
        </button>
      </div>

      <div className="flex items-center gap-1">
         <div className="relative">
            <button 
                onClick={() => setShowDownloadMenu(!showDownloadMenu)} 
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" 
                title="Exportar Imagem"
            >
                <Download size={18} />
            </button>
            
            {showDownloadMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)}></div>
                    <div className="absolute top-full left-0 mt-2 w-40 bg-white rounded-lg shadow-xl border border-slate-200 z-50 flex flex-col py-1 overflow-hidden">
                        <button 
                            onClick={() => { onDownload('png'); setShowDownloadMenu(false); }}
                            className="px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                            <Image size={14} /> Imagem PNG
                        </button>
                        <button 
                             onClick={() => { onDownload('jpeg'); setShowDownloadMenu(false); }}
                            className="px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                            <Camera size={14} /> Imagem JPEG
                        </button>
                        <button 
                             onClick={() => { onDownload('svg'); setShowDownloadMenu(false); }}
                            className="px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                            <FileCode size={14} /> Vetor SVG
                        </button>
                    </div>
                </>
            )}
         </div>

        <button onClick={onClear} className="p-2 hover:bg-red-50 rounded-lg text-red-500" title="Limpar Tudo">
            <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
