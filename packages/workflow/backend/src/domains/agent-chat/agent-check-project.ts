import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { INode, IProjectDocument } from '@falang/dto';
import { validateDocument } from '@falang/mcp-core';
import type { ICompileError } from '@falang/workflow-compiler';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { buildWorkflowMcpRegistry } from '../mcp/workflow-mcp-registry.js';
import { REGISTERED_INTEGRATIONS } from '../integrations/registered-integrations.js';
import { compileProjectStructure } from '../build/build/compile-project-documents.js';
import { typeCheckInWorkerErrors } from '../build/build/build-artifact.js';

export interface IAgentCheckDiagnostic {
  readonly documentId?: string;
  readonly nodeId?: string;
  readonly message: string;
}

export interface IAgentCheckOverlay {
  readonly id: string;
  readonly root: unknown;
}

let registry: ReturnType<typeof buildWorkflowMcpRegistry> | null = null;
const getRegistry = (): ReturnType<typeof buildWorkflowMcpRegistry> => {
  registry ??= buildWorkflowMcpRegistry(REGISTERED_INTEGRATIONS);
  return registry;
};

const toDiagnostic = (error: ICompileError): IAgentCheckDiagnostic => ({
  ...(error.documentId ? { documentId: error.documentId } : {}),
  ...(error.nodeId ? { nodeId: error.nodeId } : {}),
  message: error.documentName && error.documentId ? `${error.documentName}: ${error.message}` : error.message,
});

/**
 * The agent's `check_project`: overlays the client's current trees onto the stored documents (ids must
 * belong to the project — 422 otherwise; type/name never change), validates each overlay with the
 * document type's real stack (an invalid one becomes a diagnostic and the stored tree is kept), compiles
 * like `BuildService.generateCode` and type-checks in the disposable build worker. Compile and type
 * errors are diagnostics, only infra failures reject. ADR 0062 (private).
 */
export const checkProjectForAgent = async (
  stored: readonly IProjectDocument[],
  overlays: readonly IAgentCheckOverlay[],
  integrations: readonly IWorkflowIntegration[],
): Promise<IAgentCheckDiagnostic[]> => {
  const byId = new Map(stored.map((document) => [document.id, document]));
  const diagnostics: IAgentCheckDiagnostic[] = [];
  const merged = new Map(byId);

  for (const overlay of overlays) {
    const document = byId.get(overlay.id);
    if (!document) {
      throw new UnprocessableEntityException(`Document "${overlay.id}" does not belong to this project`);
    }
    const candidate: IProjectDocument = { ...document, root: overlay.root as INode };
    const validation = getRegistry().getStack('workflow', document.type)
      ? validateDocument('workflow', candidate, getRegistry())
      : { ok: true as const, document: candidate };
    if (validation.ok) {
      merged.set(document.id, { ...document, root: validation.document.root ?? (overlay.root as INode) });
    } else {
      diagnostics.push({ documentId: document.id, message: `${document.name}: ${validation.error}` });
    }
  }

  const documents = [...merged.values()];
  try {
    const { workflows, activities } = compileProjectStructure(documents, integrations, { trackPosition: true });
    const typeErrors = await typeCheckInWorkerErrors(workflows, activities);
    diagnostics.push(...typeErrors.map((error) => toDiagnostic(error)));
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const response = error.getResponse() as { errors?: readonly ICompileError[]; message?: string };
    if (response.errors?.length) diagnostics.push(...response.errors.map((entry) => toDiagnostic(entry)));
    else diagnostics.push({ message: response.message ?? error.message });
  }
  return diagnostics;
};
