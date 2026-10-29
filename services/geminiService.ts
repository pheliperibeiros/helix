import { GraphState, NodeType } from "../types";

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  attachments?: Array<{
    name: string;
    size: string;
    type: string;
    content: string; // base64 or raw text content
    text?: string;   // extracted text if applicable
  }>;
}

export interface ChatResponse {
  text: string;
  functionCalls: Array<{
    name: string;
    args: any;
    id?: string;
  }>;
}

/**
 * Proxy function to send chat messages and current graph state to the Express backend.
 */
export const sendChatMessage = async (
  messages: ChatMessage[],
  currentGraph: GraphState
): Promise<ChatResponse> => {
  const response = await fetch("/api/gemini/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      currentGraph,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Erro ao se comunicar com o assistente Hélix.");
  }

  return response.json();
};

/**
 * Legacy/Standard direct text-to-graph generator proxy.
 */
export const generateGraphFromText = async (text: string): Promise<GraphState> => {
  const response = await fetch("/api/gemini/generate-graph", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Erro ao gerar o grafo.");
  }

  const rawData = await response.json();
  
  const nodes = (rawData.nodes || []).map((n: any) => ({
    ...n,
    x: n.x || Math.random() * 500,
    y: n.y || Math.random() * 500,
    type: Object.values(NodeType).includes(n.type) ? n.type : NodeType.GENERIC,
    details: n.details || []
  }));

  const edges = (rawData.edges || []).map((e: any, index: number) => ({
    id: e.id || `edge-gen-${index}-${Date.now()}`,
    source: e.source,
    target: e.target,
    label: e.label || "",
    color: e.color || "#94a3b8",
    direction: e.direction || "uni",
    style: e.style || "solid",
    details: e.details || []
  }));

  return { nodes, edges };
};
