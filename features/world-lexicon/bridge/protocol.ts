import { WorldLexiconError, type AttemptRequest, type AttemptResponse, type WorldLexiconService } from "../engine/service.ts";

/**
 * Protocolo visor ⇄ anfitrión para cuando el visor 3D vive en un iframe.
 *
 * Por qué postMessage y no callbacks directos: el visor es una aplicación
 * estática independiente (su propio servidor y su propia compilación) y el
 * progreso vive en `localStorage` del origen de la aplicación Next. Un
 * documento en otro origen no puede escribir ahí: hay que cruzar la frontera.
 * Si en el futuro el visor se monta dentro de la misma página React, el visor
 * recibe el mismo puerto `submitAttempt` como callback y este archivo no se usa.
 *
 * Seguridad: el anfitrión solo atiende mensajes cuyo `origin` sea EXACTAMENTE
 * el origen configurado del visor, cuyo `source` sea la ventana de ese iframe
 * y cuyo cuerpo cumpla el esquema estricto. Responde siempre a un origen
 * concreto, nunca a «*».
 */
export const WORLD_LEXICON_CHANNEL = "spanstories.world-lexicon";
export const WORLD_LEXICON_PROTOCOL_VERSION = 1;

export type AttemptRequestMessage = {
  readonly channel: typeof WORLD_LEXICON_CHANNEL;
  readonly version: typeof WORLD_LEXICON_PROTOCOL_VERSION;
  readonly id: string;
  readonly type: "ATTEMPT";
  readonly entryId: string;
  readonly interactionId: string;
  readonly attemptNo: number;
  readonly typed: string;
};

export type HostReplyMessage =
  | {
      readonly channel: typeof WORLD_LEXICON_CHANNEL;
      readonly version: typeof WORLD_LEXICON_PROTOCOL_VERSION;
      readonly id: string;
      readonly type: "VERDICT";
      readonly response: AttemptResponse;
    }
  | {
      readonly channel: typeof WORLD_LEXICON_CHANNEL;
      readonly version: typeof WORLD_LEXICON_PROTOCOL_VERSION;
      readonly id: string;
      readonly type: "ERROR";
      readonly code: string;
    };

const MESSAGE_ID = /^[A-Za-z0-9-]{8,64}$/;
const REQUEST_KEYS = ["channel", "version", "id", "type", "entryId", "interactionId", "attemptNo", "typed"] as const;

export function parseAttemptMessage(data: unknown): AttemptRequestMessage | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== REQUEST_KEYS.length || !REQUEST_KEYS.every((key) => keys.includes(key))) return null;
  if (record.channel !== WORLD_LEXICON_CHANNEL || record.version !== WORLD_LEXICON_PROTOCOL_VERSION || record.type !== "ATTEMPT") return null;
  if (typeof record.id !== "string" || !MESSAGE_ID.test(record.id)) return null;
  if (typeof record.entryId !== "string" || record.entryId.length === 0 || record.entryId.length > 64) return null;
  if (typeof record.interactionId !== "string" || !MESSAGE_ID.test(record.interactionId)) return null;
  if (typeof record.attemptNo !== "number" || !Number.isInteger(record.attemptNo) || record.attemptNo < 1 || record.attemptNo > 50) return null;
  if (typeof record.typed !== "string" || record.typed.length > 200) return null;
  return record as unknown as AttemptRequestMessage;
}

export type HostBridgeEvent = {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
};

export type HostBridge = {
  /** true si el mensaje era legítimo y se respondió; false si se ignoró sin respuesta. */
  handle(event: HostBridgeEvent): Promise<boolean>;
};

function isConcreteOrigin(origin: string): boolean {
  if (origin === "*" || origin === "null") return false;
  try {
    return new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

export function createHostBridge(input: {
  readonly service: Pick<WorldLexiconService, "submitAttempt"|"recordExposure">;
  readonly expectedOrigin: string;
  /** Ventana del iframe del visor; se consulta en cada mensaje porque el iframe puede recargarse. */
  readonly expectedSource: () => unknown;
  readonly postToViewer: (message: HostReplyMessage, targetOrigin: string) => void;
}): HostBridge {
  if (!isConcreteOrigin(input.expectedOrigin)) throw new Error("expectedOrigin debe ser un origen concreto (no «*»).");
  const reply = (message: HostReplyMessage) => input.postToViewer(message, input.expectedOrigin);
  return {
    async handle(event) {
      if (event.origin !== input.expectedOrigin) return false;
      const source = input.expectedSource();
      if (source === null || source === undefined || event.source !== source) return false;
      const exposure=event.data as Record<string,unknown>|null;
      if(exposure?.channel===WORLD_LEXICON_CHANNEL&&exposure.version===1&&exposure.type==='EXPOSURE'){
        if(Object.keys(exposure).length!==6||typeof exposure.entryId!=='string'||exposure.entryId.length>64||typeof exposure.interactionId!=='string'||!MESSAGE_ID.test(exposure.interactionId)||!['OBJECT','AUDIO'].includes(exposure.exposure as string))return false;
        return input.service.recordExposure?.({entryId:exposure.entryId,interactionId:exposure.interactionId,exposure:exposure.exposure as 'OBJECT'|'AUDIO'})??false;
      }
      const message = parseAttemptMessage(event.data);
      if (message === null) return false;
      const request: AttemptRequest = {
        entryId: message.entryId,
        interactionId: message.interactionId,
        attemptNo: message.attemptNo,
        typed: message.typed,
      };
      try {
        const response = await input.service.submitAttempt(request);
        reply({ channel: WORLD_LEXICON_CHANNEL, version: WORLD_LEXICON_PROTOCOL_VERSION, id: message.id, type: "VERDICT", response });
      } catch (error) {
        const code = error instanceof WorldLexiconError ? error.code : "INTERNAL";
        reply({ channel: WORLD_LEXICON_CHANNEL, version: WORLD_LEXICON_PROTOCOL_VERSION, id: message.id, type: "ERROR", code });
      }
      return true;
    },
  };
}
