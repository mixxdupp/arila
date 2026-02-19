import type { FastifyRequest, FastifyReply } from "fastify";
import type { ZodSchema, ZodError } from "zod";

function formatZodError(error: ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export function validateBody(schema: ZodSchema) {
  return async function validateBodyHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: formatZodError(parsed.error),
      });
    }
    request.body = parsed.data;
  };
}

export function validateParams(schema: ZodSchema) {
  return async function validateParamsHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid parameters",
        details: formatZodError(parsed.error),
      });
    }
    request.params = parsed.data;
  };
}

export function validateQuery(schema: ZodSchema) {
  return async function validateQueryHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: formatZodError(parsed.error),
      });
    }
    request.query = parsed.data;
  };
}
