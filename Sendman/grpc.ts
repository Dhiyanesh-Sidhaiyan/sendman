import { IpcMain } from 'electron';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { GrpcRequestDef } from './store';
import { substitute, VarMap } from './vars';

export interface GrpcExecuteInput {
  request: GrpcRequestDef;
  vars: VarMap;
}

export interface GrpcExecuteResult {
  protocol: 'grpc';
  ok: boolean;
  response?: any;
  latencyMs: number;
  attempts: number;
  error?: string;
}

async function executeGrpcOnce(input: GrpcExecuteInput): Promise<GrpcExecuteResult> {
  const { request: req, vars } = input;
  const started = performance.now();

  try {
    const protoPath = substitute(req.protoPath, vars);
    const serviceName = substitute(req.service, vars);
    const methodName = substitute(req.method, vars);
    const messageText = substitute(req.message, vars);

    // Load proto file
    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to service
    const parts = serviceName.split('.');
    let current: any = protoDescriptor;
    for (const part of parts) {
      current = current[part];
      if (!current) throw new Error(`Service "${serviceName}" not found in proto file`);
    }

    const ServiceClient = current;
    if (typeof ServiceClient !== 'function') {
      throw new Error(`"${serviceName}" is not a service constructor`);
    }

    // Parse message
    let message: any;
    try {
      message = JSON.parse(messageText);
    } catch {
      throw new Error(`Invalid JSON message: ${messageText}`);
    }

    // Build metadata
    const metadata = new grpc.Metadata();
    for (const m of req.metadata) {
      if (!m.enabled || !m.key) continue;
      metadata.add(substitute(m.key, vars), substitute(m.value, vars));
    }

    // Determine server address from service name or use localhost:50051 as fallback
    // In a real implementation, you'd want to make this configurable
    const serverAddress = 'localhost:50051';
    const client = new ServiceClient(serverAddress, grpc.credentials.createInsecure());

    // Make unary call
    const timeout = req.resilience.timeoutMs > 0 ? req.resilience.timeoutMs : 30000;
    const deadline = new Date(Date.now() + timeout);

    return new Promise((resolve) => {
      if (!client[methodName]) {
        resolve({
          protocol: 'grpc',
          ok: false,
          latencyMs: Math.round(performance.now() - started),
          attempts: 1,
          error: `Method "${methodName}" not found on service "${serviceName}"`
        });
        return;
      }

      client[methodName](message, metadata, { deadline }, (err: any, response: any) => {
        const latencyMs = Math.round(performance.now() - started);

        if (err) {
          resolve({
            protocol: 'grpc',
            ok: false,
            latencyMs,
            attempts: 1,
            error: err.message || String(err)
          });
        } else {
          resolve({
            protocol: 'grpc',
            ok: true,
            response,
            latencyMs,
            attempts: 1
          });
        }

        client.close();
      });
    });
  } catch (e: any) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      protocol: 'grpc',
      ok: false,
      latencyMs,
      attempts: 1,
      error: e?.message ?? String(e)
    };
  }
}

export async function executeGrpc(input: GrpcExecuteInput): Promise<GrpcExecuteResult> {
  const maxAttempts = Math.max(1, input.request.resilience.maxAttempts || 1);
  let last: GrpcExecuteResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await executeGrpcOnce(input);
    res.attempts = attempt;
    last = res;

    // Only retry on specific gRPC errors (unavailable, deadline exceeded, etc.)
    const shouldRetry = !res.ok &&
      (res.error?.includes('UNAVAILABLE') ||
       res.error?.includes('DEADLINE_EXCEEDED') ||
       res.error?.includes('RESOURCE_EXHAUSTED'));

    if (!shouldRetry || attempt === maxAttempts) return res;

    // Simple exponential backoff
    const delay = Math.min(30000, 200 * Math.pow(2, attempt - 1));
    await new Promise(r => setTimeout(r, Math.random() * delay));
  }

  return last!;
}

export function registerGrpcHandlers(ipc: IpcMain) {
  ipc.handle('grpc:execute', async (_e, input: GrpcExecuteInput) => executeGrpc(input));
}
