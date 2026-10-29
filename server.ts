import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to call Gemini with robust exponential backoff retry and model fallback
async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: {
    contents: any;
    config?: any;
  }
) {
  const models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const model of models) {
    let attempt = 0;
    const maxAttempts = 3;
    let delay = 1000; // start with 1s delay

    while (attempt < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          config: options.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMessage = String(err.message || err);
        const isQuotaZero = errMessage.includes("limit: 0");
        const isTransient = !isQuotaZero && (
                            errMessage.includes("503") || 
                            errMessage.includes("UNAVAILABLE") || 
                            errMessage.includes("429") || 
                            errMessage.includes("high demand") ||
                            errMessage.includes("ResourceExhausted") ||
                            errMessage.includes("Service Unavailable")
        );

        if (isTransient) {
          attempt++;
          if (attempt < maxAttempts) {
            console.warn(`[Helix AI Client] temporary error (Model: ${model}, Attempt: ${attempt}/${maxAttempts}). Retrying in ${delay}ms... Error: ${errMessage}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // exponential backoff
            continue;
          }
        }
        // If it's a non-transient error or we ran out of attempts, try the next fallback model
        break;
      }
    }
  }
  throw lastError || new Error("Failed to generate content from Gemini after fallback and retries.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse large payloads (for documents, files, base64 data)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API routes go here FIRST

  // API route for healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Agentic Chat Gemini API Route
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Chave de API do Gemini não configurada no servidor." });
      }

      const { messages, currentGraph } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Mensagens inválidas ou ausentes." });
      }

      // Initialize Gemini Client with standard telemetry headers
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Define Tools (Function Declarations) for Agentic Behavior
      const tools: { functionDeclarations: FunctionDeclaration[] }[] = [
        {
          functionDeclarations: [
            {
              name: "setGraphState",
              description: "Substitui todo o estado do grafo (nós e arestas). Útil para gerar um grafo completo a partir do zero ou fazer uma reestruturação massiva baseada em um documento.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  nodes: {
                    type: Type.ARRAY,
                    description: "Lista de nós a serem inseridos.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING, description: "ID único para o nó (ex: 'node-1', 'node-joao')" },
                        label: { type: Type.STRING, description: "Nome visível do nó (ex: 'João Silva', 'Empresa X')" },
                        type: { 
                          type: Type.STRING, 
                          description: "Categoria do nó.",
                          enum: ["PERSON", "ORGANIZATION", "EVENT", "LOCATION", "GENERIC", "POSTIT"] 
                        },
                        noteText: { type: Type.STRING, description: "Texto da observação caso o tipo seja POSTIT" },
                        noteColor: { type: Type.STRING, description: "Cor hexadecimal do Post-it (ex: '#fef08a')" },
                        x: { type: Type.NUMBER, description: "Coordenada X recomendada (0 a 1000)" },
                        y: { type: Type.NUMBER, description: "Coordenada Y recomendada (0 a 800)" },
                        details: {
                          type: Type.ARRAY,
                          description: "Detalhes adicionais chave-valor.",
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              id: { type: Type.STRING },
                              icon: { type: Type.STRING, description: "Ícone sugerido (calendar, id, brief, map, alert, etc.)" },
                              value: { type: Type.STRING, description: "Valor do detalhe" }
                            },
                            required: ["id", "value"]
                          }
                        }
                      },
                      required: ["id", "label", "type", "x", "y"]
                    }
                  },
                  edges: {
                    type: Type.ARRAY,
                    description: "Lista de conexões entre os nós.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING, description: "ID único da aresta (ex: 'edge-1')" },
                        source: { type: Type.STRING, description: "ID do nó de origem" },
                        target: { type: Type.STRING, description: "ID do nó de destino" },
                        label: { type: Type.STRING, description: "Texto de relação (ex: 'sócio', 'mora em', 'enviou Pix')" },
                        color: { type: Type.STRING, description: "Cor em hexadecimal (ex: '#ef4444' para perigo/crítico, '#94a3b8' padrão)" },
                        direction: { type: Type.STRING, enum: ["uni", "bi", "none"], description: "Direção do fluxo (uni = unidirecional, bi = bidirecional)" },
                        style: { type: Type.STRING, enum: ["solid", "dashed"], description: "Estilo da linha" }
                      },
                      required: ["id", "source", "target"]
                    }
                  }
                },
                required: ["nodes", "edges"]
              }
            },
            {
              name: "addNode",
              description: "Adiciona um único nó ao grafo atual.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "Nome visível do nó" },
                  type: { type: Type.STRING, enum: ["PERSON", "ORGANIZATION", "EVENT", "LOCATION", "GENERIC", "POSTIT"] },
                  noteText: { type: Type.STRING, description: "Texto da observação caso o tipo seja POSTIT" },
                  noteColor: { type: Type.STRING, description: "Cor hexadecimal do Post-it (ex: '#fef08a')" },
                  x: { type: Type.NUMBER, description: "Coordenada X (0 a 1000)" },
                  y: { type: Type.NUMBER, description: "Coordenada Y (0 a 800)" },
                  details: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        icon: { type: Type.STRING },
                        value: { type: Type.STRING }
                      },
                      required: ["value"]
                    }
                  }
                },
                required: ["label", "type"]
              }
            },
            {
              name: "updateNode",
              description: "Atualiza informações ou propriedades de um nó existente.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID do nó a ser atualizado" },
                  label: { type: Type.STRING, description: "Novo nome do nó" },
                  type: { type: Type.STRING, enum: ["PERSON", "ORGANIZATION", "EVENT", "LOCATION", "GENERIC", "POSTIT"] },
                  noteText: { type: Type.STRING, description: "Texto da observação caso o tipo seja POSTIT" },
                  noteColor: { type: Type.STRING, description: "Cor hexadecimal do Post-it (ex: '#fef08a')" },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  details: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        icon: { type: Type.STRING },
                        value: { type: Type.STRING }
                      },
                      required: ["value"]
                    }
                  }
                },
                required: ["id"]
              }
            },
            {
              name: "deleteNode",
              description: "Remove um nó existente do grafo.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID do nó a ser removido" }
                },
                required: ["id"]
              }
            },
            {
              name: "addEdge",
              description: "Cria um link de relacionamento entre dois nós existentes.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING, description: "ID do nó de origem" },
                  target: { type: Type.STRING, description: "ID do nó de destino" },
                  label: { type: Type.STRING, description: "Descrição do relacionamento" },
                  direction: { type: Type.STRING, enum: ["uni", "bi", "none"] },
                  style: { type: Type.STRING, enum: ["solid", "dashed"] },
                  color: { type: Type.STRING, description: "Cor da linha em hexadecimal" }
                },
                required: ["source", "target"]
              }
            },
            {
              name: "deleteEdge",
              description: "Remove uma conexão (aresta) existente entre dois nós.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID da aresta a ser removida" }
                },
                required: ["id"]
              }
            },
            {
              name: "clearGraph",
              description: "Limpa completamente o grafo, apagando todos os nós e arestas.",
              parameters: {
                type: Type.OBJECT,
                properties: {}
              }
            },
            {
              name: "autoLayout",
              description: "Organiza e reposiciona os nós do grafo automaticamente de forma estruturada.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  type: { 
                    type: Type.STRING, 
                    enum: ["no-cross", "grid", "circle", "dual-ring", "hierarchical", "star", "random"], 
                    description: "O layout desejado (no-cross = evita cruzamentos e sobreposições, grid = grade, circle = círculo, dual-ring = duplo anel, hierarchical = hierárquico, star = estrela)" 
                  }
                },
                required: ["type"]
              }
            }
          ]
        }
      ];

      // Formulate historical messages for Gemini
      // System instructions to guide agentic behavior
      const systemInstruction = `
        Você é o "Hélix", um Assistente de Grafos Inteligente e Agente Ativo especializado em análise de inteligência visual para o Ministério Público e promotores de justiça.
        Seu objetivo é ajudar o usuário a construir, gerenciar e analisar redes de relacionamento, fluxogramas, linhas do tempo e diagramas de vínculos.

        Você é um agente com PODERES REAIS para alterar o grafo visível do usuário! Você deve usar suas ferramentas (tools) para criar, atualizar, remover, e reestruturar os elementos do grafo em tempo real sempre que o usuário pedir ou fornecer dados que descrevam vínculos.

        REGRAS DE COMPORTAMENTO:
        1. Quando o usuário fornecer um documento, texto corrido, denúncia, relatório financeiro ou e-mail, seu dever é extrair ativamente as pessoas, empresas, locais, eventos e transações, e criar um grafo representativo automaticamente. Prefira usar a ferramenta "setGraphState" para construir o grafo completo de uma vez só se o documento for grande.
        2. Quando o usuário pedir para adicionar um nó (ex: "adicione Maria Silva como Pessoa"), chame "addNode". Espace as coordenadas dos nós para não ficarem amontoados (por exemplo, aumente x e y de 150 em 150 pixels).
        3. Quando o usuário pedir para conectar elementos (ex: "conecte Maria com a Tech Solutions com a relação 'sócia'"), chame "addEdge".
        4. Quando o usuário pedir para apagar ou alterar, use "deleteNode", "deleteEdge" ou "updateNode" respectivamente.
        5. Se o usuário pedir para organizar, use "autoLayout".
        6. Explique o que você fez em suas respostas no chat, destacando as alterações feitas de forma profissional e objetiva em português do Brasil.
        7. Mantenha um tom profissional, amigável, técnico e útil para investigações e investigados.

        Estado atual do Grafo do usuário para referência:
        Nós: ${JSON.stringify(currentGraph?.nodes || [])}
        Conexões: ${JSON.stringify(currentGraph?.edges || [])}
      `;

      // Map incoming messages to the SDK format
      const contents = messages.map((msg: any) => {
        // If message has attachments, merge them into parts
        const parts: any[] = [];
        if (msg.attachments && Array.isArray(msg.attachments)) {
          msg.attachments.forEach((att: any) => {
            if (att.type.startsWith("image/")) {
              const base64Data = att.content.split(",")[1] || att.content;
              parts.push({
                inlineData: {
                  mimeType: att.type,
                  data: base64Data,
                },
              });
            } else {
              // Standard document / text / pdf - append as contextual text part
              parts.push({
                text: `[Conteúdo do Documento Anexo "${att.name}"]: ${att.text || att.content}`,
              });
            }
          });
        }

        parts.push({ text: msg.text || "" });

        return {
          role: msg.role === "user" ? "user" : "model",
          parts: parts,
        };
      });

      // Execute AI Content Generation with agentic capabilities via the retry and fallback helper
      const response = await generateContentWithRetry(ai, {
        contents,
        config: {
          systemInstruction,
          tools,
        },
      });

      // Log or process tool calls and text
      const functionCalls = response.functionCalls;
      const responseText = response.text || "";

      res.json({
        text: responseText,
        functionCalls: functionCalls || [],
      });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Erro desconhecido ao processar o chat." });
    }
  });

  // API legacy graph generation from text endpoint (keep backward compatibility)
  app.post("/api/gemini/generate-graph", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Chave de API do Gemini não configurada no servidor." });
      }

      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Texto para geração ausente." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });

      const prompt = `
        Analise o seguinte texto narrativo (que pode ser uma denúncia, relato policial ou descrição de processo) e extraia as entidades e relacionamentos para criar um grafo.
        
        O texto é: "${text}"

        Identifique as entidades principais como 'nodes' (Pessoas, Empresas, Locais, Eventos) e as relações entre elas como 'edges' (links).
        Para cada Node, determine um tipo apropriado.
        Para a posição (x, y), distribua-os de forma lógica e espaçada em uma grade imaginária de 1000x800, evitando sobreposições totais.
      `;

      const response = await generateContentWithRetry(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nodes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING, description: "Nome curto para exibição" },
                    type: { type: Type.STRING, enum: ["PERSON", "ORGANIZATION", "EVENT", "LOCATION", "GENERIC"] },
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER }
                  },
                  required: ["id", "label", "type", "x", "y"]
                }
              },
              edges: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                    label: { type: Type.STRING }
                  },
                  required: ["source", "target"]
                }
              }
            },
            required: ["nodes", "edges"]
          }
        }
      });

      if (response.text) {
        res.json(JSON.parse(response.text));
      } else {
        throw new Error("Resposta vazia da IA.");
      }
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Erro ao gerar o grafo." });
    }
  });

  // Vite middleware for development vs static asset serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer();
