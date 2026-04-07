import type {
  FinishReason,
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from 'ai';
import { DEFAULT_CODEX_REASONING_EFFORT, resolveCodexReasoningEffort, type CodexReasoningEffort } from './codex-config';

const CODEX_PROXY_URL = 'http://127.0.0.1:1456/responses';
const DEFAULT_REASONING_SUMMARY = 'auto';
const DEFAULT_TEXT_VERBOSITY = 'medium';

type CodexMessageContentPart =
  | {
      type: 'input_text';
      text: string;
    }
  | {
      type: 'input_image';
      image_url: string;
    };

type CodexInputMessage = {
  role: 'user' | 'assistant';
  content: string | CodexMessageContentPart[];
};

type CodexRequestBody = {
  model: string;
  store: false;
  stream: true;
  instructions?: string;
  input: CodexInputMessage[];
  reasoning?: {
    effort: string;
    summary: string;
  };
  text?: {
    verbosity: string;
  };
};

type CodexResponseMetadata = {
  id?: string;
  timestamp?: Date;
  modelId?: string;
};

type CodexUsage = {
  promptTokens: number;
  completionTokens: number;
};

type CodexStreamResult = {
  text: string;
  finishReason: FinishReason;
  usage: CodexUsage;
  response?: CodexResponseMetadata;
};

type CodexStreamEvent = {
  type?: string;
  delta?: string;
  response?: Record<string, any>;
  error?: unknown;
};

function normalizeCodexModel(model: string) {
  switch (model) {
    case 'gpt-5-codex':
      return 'gpt-5.3-codex';
    default:
      return model;
  }
}

function uint8ArrayToBase64(value: Uint8Array) {
  let binary = '';

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function getImageUrl(part: Extract<LanguageModelV1Prompt[number], { role: 'user' }>['content'][number]) {
  if (part.type !== 'image') {
    return undefined;
  }

  if (part.image instanceof URL) {
    return part.image.toString();
  }

  const mimeType = part.mimeType || 'image/png';

  return `data:${mimeType};base64,${uint8ArrayToBase64(part.image)}`;
}

function buildCodexInput(prompt: LanguageModelV1Prompt) {
  const instructions: string[] = [];
  const input: CodexInputMessage[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      instructions.push(message.content);
      continue;
    }

    if (message.role === 'user') {
      const content: CodexMessageContentPart[] = [];

      for (const part of message.content) {
        if (part.type === 'text') {
          content.push({
            type: 'input_text',
            text: part.text,
          });
          continue;
        }

        const imageUrl = getImageUrl(part);

        if (imageUrl) {
          content.push({
            type: 'input_image',
            image_url: imageUrl,
          });
        }
      }

      if (content.length > 0) {
        input.push({
          role: 'user',
          content,
        });
      }

      continue;
    }

    if (message.role === 'assistant') {
      const text = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n\n')
        .trim();

      if (text) {
        input.push({
          role: 'assistant',
          content: text,
        });
      }
    }
  }

  return {
    instructions: instructions.join('\n\n').trim() || undefined,
    input,
  };
}

function buildRequestBody(
  modelId: string,
  options: LanguageModelV1CallOptions,
  reasoningEffort = DEFAULT_CODEX_REASONING_EFFORT,
): CodexRequestBody {
  const { instructions, input } = buildCodexInput(options.prompt);
  const normalizedModelId = normalizeCodexModel(modelId);
  const resolvedReasoningEffort = resolveCodexReasoningEffort(normalizedModelId, reasoningEffort);

  return {
    model: normalizedModelId,
    store: false,
    stream: true,
    instructions,
    input,
    reasoning: {
      effort: resolvedReasoningEffort,
      summary: DEFAULT_REASONING_SUMMARY,
    },
    text: {
      verbosity: DEFAULT_TEXT_VERBOSITY,
    },
  };
}

function headersToRecord(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

function parseTimestamp(value: unknown) {
  if (typeof value === 'number') {
    return new Date(value * 1000);
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function mapUsage(response?: Record<string, any>): CodexUsage {
  const usage = response?.usage ?? {};

  return {
    promptTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    completionTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
  };
}

function mapFinishReason(response?: Record<string, any>): FinishReason {
  const incompleteReason = response?.incomplete_details?.reason ?? response?.reason;

  if (response?.status === 'failed') {
    return 'error';
  }

  if (incompleteReason === 'max_output_tokens' || incompleteReason === 'max_tokens' || incompleteReason === 'length') {
    return 'length';
  }

  if (incompleteReason === 'content_filter') {
    return 'content-filter';
  }

  if (response?.status === 'incomplete') {
    return 'other';
  }

  return 'stop';
}

function extractTextFromResponse(response?: Record<string, any>) {
  if (!response) {
    return '';
  }

  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return '';
  }

  return response.output
    .flatMap((item: any) => item?.content ?? [])
    .map((content: any) => {
      if (typeof content?.text === 'string') {
        return content.text;
      }

      if (typeof content?.output_text === 'string') {
        return content.output_text;
      }

      return '';
    })
    .join('');
}

function extractResponseMetadata(response?: Record<string, any>): CodexResponseMetadata | undefined {
  if (!response) {
    return undefined;
  }

  return {
    id: response.id,
    modelId: response.model,
    timestamp: parseTimestamp(response.created_at),
  };
}

async function readErrorResponse(response: Response) {
  const body = await response.text().catch(() => '');

  if (response.status === 401) {
    return 'Codex auth is missing or expired. Sign in with ChatGPT in the Electron app.';
  }

  if (!body) {
    return `Codex request failed with status ${response.status}`;
  }

  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error || parsed.message || body;
  } catch {
    return body;
  }
}

function splitEventBlocks(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';

  return { blocks, remainder };
}

function parseEventBlock(block: string): CodexStreamEvent | undefined {
  const payload = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
    .trim();

  if (!payload || payload === '[DONE]') {
    return undefined;
  }

  try {
    return JSON.parse(payload) as CodexStreamEvent;
  } catch {
    return undefined;
  }
}

async function fetchCodex(body: CodexRequestBody) {
  const response = await fetch(CODEX_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  return response;
}

async function consumeCodexStream(response: Response) {
  if (!response.body) {
    throw new Error('Codex response body was empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finalResponse: Record<string, any> | undefined;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const { blocks, remainder } = splitEventBlocks(buffer);
    buffer = remainder;

    for (const block of blocks) {
      const event = parseEventBlock(block);

      if (!event) {
        continue;
      }

      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        text += event.delta;
        continue;
      }

      if (event.type === 'response.completed' || event.type === 'response.done') {
        finalResponse = event.response;
      }
    }
  }

  const trailingEvent = parseEventBlock(buffer.trim());

  if (trailingEvent?.type === 'response.output_text.delta' && typeof trailingEvent.delta === 'string') {
    text += trailingEvent.delta;
  }

  if (
    (trailingEvent?.type === 'response.completed' || trailingEvent?.type === 'response.done') &&
    trailingEvent.response
  ) {
    finalResponse = trailingEvent.response;
  }

  if (!text && finalResponse) {
    text = extractTextFromResponse(finalResponse);
  }

  return {
    text,
    response: extractResponseMetadata(finalResponse),
    usage: mapUsage(finalResponse),
    finishReason: mapFinishReason(finalResponse),
  } satisfies CodexStreamResult;
}

export class CodexLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1' as const;
  readonly provider = 'codex.chatgpt';
  readonly defaultObjectGenerationMode = undefined;
  readonly supportsImageUrls = true;
  readonly supportsStructuredOutputs = false;

  constructor(
    readonly modelId: string,
    private readonly _settings: {
      reasoningEffort?: CodexReasoningEffort;
    } = {},
  ) {}

  async doGenerate(options: LanguageModelV1CallOptions) {
    const body = buildRequestBody(this.modelId, options, this._settings.reasoningEffort);
    const response = await fetchCodex(body);
    const result = await consumeCodexStream(response);

    return {
      text: result.text,
      finishReason: result.finishReason,
      usage: result.usage,
      rawCall: {
        rawPrompt: body.input,
        rawSettings: {
          instructions: body.instructions,
          reasoning: body.reasoning,
          text: body.text,
          store: body.store,
          stream: body.stream,
        },
      },
      rawResponse: {
        headers: headersToRecord(response.headers),
      },
      response: result.response,
    };
  }

  async doStream(options: LanguageModelV1CallOptions) {
    const body = buildRequestBody(this.modelId, options, this._settings.reasoningEffort);
    const response = await fetchCodex(body);

    if (!response.body) {
      throw new Error('Codex response body was empty');
    }

    const upstreamReader = response.body.getReader();
    const decoder = new TextDecoder();
    const responseHeaders = headersToRecord(response.headers);

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start(controller) {
        let buffer = '';
        let responseMetadataSent = false;
        let finished = false;

        const emitResponseMetadata = (metadata?: CodexResponseMetadata) => {
          if (responseMetadataSent || !metadata) {
            return;
          }

          controller.enqueue({
            type: 'response-metadata',
            id: metadata.id,
            modelId: metadata.modelId,
            timestamp: metadata.timestamp,
          });
          responseMetadataSent = true;
        };

        const pump = async () => {
          while (true) {
            const { done, value } = await upstreamReader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            const { blocks, remainder } = splitEventBlocks(buffer);
            buffer = remainder;

            for (const block of blocks) {
              const event = parseEventBlock(block);

              if (!event) {
                continue;
              }

              if ((event.type === 'response.created' || event.type === 'response.in_progress') && event.response) {
                emitResponseMetadata(extractResponseMetadata(event.response));
                continue;
              }

              if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: event.delta,
                });
                continue;
              }

              if ((event.type === 'response.completed' || event.type === 'response.done') && event.response) {
                emitResponseMetadata(extractResponseMetadata(event.response));
                controller.enqueue({
                  type: 'finish',
                  finishReason: mapFinishReason(event.response),
                  usage: mapUsage(event.response),
                });
                finished = true;
              }

              if (event.type === 'error') {
                controller.enqueue({
                  type: 'error',
                  error: event.error ?? 'Codex request failed',
                });
              }
            }
          }

          const trailingEvent = parseEventBlock(buffer.trim());

          if (trailingEvent) {
            if (
              (trailingEvent.type === 'response.created' || trailingEvent.type === 'response.in_progress') &&
              trailingEvent.response
            ) {
              emitResponseMetadata(extractResponseMetadata(trailingEvent.response));
            }

            if (trailingEvent.type === 'response.output_text.delta' && typeof trailingEvent.delta === 'string') {
              controller.enqueue({
                type: 'text-delta',
                textDelta: trailingEvent.delta,
              });
            }

            if (
              (trailingEvent.type === 'response.completed' || trailingEvent.type === 'response.done') &&
              trailingEvent.response
            ) {
              emitResponseMetadata(extractResponseMetadata(trailingEvent.response));
              controller.enqueue({
                type: 'finish',
                finishReason: mapFinishReason(trailingEvent.response),
                usage: mapUsage(trailingEvent.response),
              });
              finished = true;
            }
          }

          if (!finished) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'unknown',
              usage: {
                promptTokens: 0,
                completionTokens: 0,
              },
            });
          }

          controller.close();
        };

        pump().catch((error) => {
          controller.enqueue({
            type: 'error',
            error,
          });
          controller.close();
        });
      },
      cancel() {
        void upstreamReader.cancel();
      },
    });

    return {
      stream,
      rawCall: {
        rawPrompt: body.input,
        rawSettings: {
          instructions: body.instructions,
          reasoning: body.reasoning,
          text: body.text,
          store: body.store,
          stream: body.stream,
        },
      },
      rawResponse: {
        headers: responseHeaders,
      },
    };
  }
}
