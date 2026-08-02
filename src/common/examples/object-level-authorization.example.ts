import { Controller, Get, Delete, Patch, Param, Body, ForbiddenException, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../modules/auth/presentation/decorators/current-user.decorator';

type ExampleUser = {
  id: string;
  permissions?: string[];
  roles?: string[];
};

/**
 * Exemplo de implementação de validação por objeto (BOLA prevention)
 * 
 * Este arquivo demonstra como implementar autorização em nível de objeto
 * para prevenir Broken Object Level Authorization (BOLA) de acordo com a OWASP.
 * 
 * Aplicar este padrão a:
 * - RulesController
 * - ExecutionsController  
 * - ReportsController
 */

@UseGuards(JwtAuthGuard)
@Controller('rules')
export class RulesControllerExample {
  constructor(private readonly rulesService: any) {}

  /**
   * Exemplo: GET /api/v1/rules/{id}
   * 
   * Validação:
   * 1. Usuário autenticado? (JwtAuthGuard)
   * 2. Recurso existe? (findById)
   * 3. Usuário tem acesso? (ownerId match ou permission)
   */
  @Get(':id')
  async getRule(
    @Param('id') id: string,
    @CurrentUser() currentUser: ExampleUser,
  ) {
    // Step 1: Buscar recurso
    const rule = await this.rulesService.findById(id);
    
    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }

    // Step 2: Validar autorização por objeto
    const isOwner = rule.createdBy === currentUser.id;
    const hasGlobalReadPermission = currentUser.permissions?.includes('rules:read:any');
    
    if (!isOwner && !hasGlobalReadPermission) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }

    return rule;
  }

  /**
   * Exemplo: DELETE /api/v1/rules/{id}
   * 
   * Validação mais restritiva:
   * - Apenas owner pode deletar OR
   * - Apenas admin com rules:delete:any
   */
  @Delete(':id')
  async deleteRule(
    @Param('id') id: string,
    @CurrentUser() currentUser: ExampleUser,
  ) {
    const rule = await this.rulesService.findById(id);
    
    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }

    // Only owner or admin can delete
    const isOwner = rule.createdBy === currentUser.id;
    const isAdmin = currentUser.roles?.includes('ADMIN');
    
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Apenas o proprietário ou admin pode deletar');
    }

    return this.rulesService.delete(id);
  }

  /**
   * Exemplo: PATCH /api/v1/rules/{id}
   * 
   * Validação com auditoria:
   * - Registrar quem estava tentando modificar
   * - Registrar se acesso foi negado (tentativa de BOLA)
   */
  @Patch(':id')
  async updateRule(
    @Param('id') id: string,
    @Body() updateData: any,
    @CurrentUser() currentUser: ExampleUser,
  ) {
    const rule = await this.rulesService.findById(id);
    
    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }

    const isOwner = rule.createdBy === currentUser.id;
    const hasWritePermission = currentUser.permissions?.includes('rules:write:any');
    
    if (!isOwner && !hasWritePermission) {
      // Registrar tentativa de BOLA no audit log
      console.warn(`[SECURITY] BOLA attempt: user ${currentUser.id} tried to modify rule ${id}`);
      throw new ForbiddenException('Acesso negado a este recurso');
    }

    return this.rulesService.update(id, updateData);
  }
}

/**
 * Padrão de Permissões Recomendado
 * 
 * Cada recurso deve ter este conjunto de permissões:
 * 
 * - `{resource}:create` — Criar novo recurso
 * - `{resource}:read:own` — Ler seu próprio recurso (padrão)
 * - `{resource}:read:any` — Ler qualquer recurso
 * - `{resource}:write:own` — Editar seu próprio recurso
 * - `{resource}:write:any` — Editar qualquer recurso
 * - `{resource}:delete:own` — Deletar seu próprio recurso
 * - `{resource}:delete:any` — Deletar qualquer recurso
 * 
 * Exemplo para Rules:
 * - `rules:create`
 * - `rules:read:own` (default se usuário autenticado)
 * - `rules:read:any` (admin)
 * - `rules:write:own` (default para owner)
 * - `rules:write:any` (admin)
 * - `rules:delete:own`
 * - `rules:delete:any` (admin)
 */

/**
 * Implementação em Authorization Guards
 * 
 * Para automatizar, criar um decorator que valida por objeto:
 * 
 * @RequireObjectOwnership('rules')
 * @Get(':id')
 * async getRule(@Param('id') id: string) {
 *   return this.rulesService.findById(id);
 * }
 * 
 * O guard automaticamente:
 * 1. Busca o objeto
 * 2. Compara currentUser.id com resource.ownerId
 * 3. Valida permission com `:any` suffix se necessário
 */
